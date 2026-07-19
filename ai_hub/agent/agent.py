"""
Agent 编排层
负责 Tool Calling 编排、上下文管理、多步骤推理
"""
import json
import logging
from typing import AsyncIterator, Optional

from ai_hub.llm.provider import registry, LLMProvider
from ai_hub.agent.tools import get_tool_definitions, execute_tool
from ai_hub.prompts.loader import get_system_prompt

logger = logging.getLogger(__name__)


class AgentSession:
    """Agent 会话，管理对话上下文和工具调用"""

    def __init__(self):
        self.messages: list[dict] = []
        self.system_prompt: str = get_system_prompt()
        self.provider: Optional[LLMProvider] = None
        self.mode: str = "general"

    def set_provider(self, name: Optional[str] = None):
        self.provider = registry.get(name)

    def set_mode(self, mode: str):
        """设置对话模式，自动加载对应 prompt"""
        self.mode = mode
        self.system_prompt = get_system_prompt(mode)

    def add_message(self, role: str, content: str):
        self.messages.append({"role": role, "content": content})

    def add_user_message(self, content: str, attachments: Optional[list[dict]] = None):
        """添加用户消息，可选附件信息"""
        msg = content
        if attachments:
            file_list = "\n".join(
                f"- {a['name']} ({a['type']})" for a in attachments
            )
            msg = f"用户上传了以下附件：\n{file_list}\n\n用户消息：{content}"
        self.add_message("user", msg)

    async def run_stream(self, max_tool_rounds: int = 5) -> AsyncIterator[str]:
        """运行 Agent 推理，流式返回结果"""
        if not self.provider:
            yield "错误: 没有可用的 AI Provider，请先配置 API Key。"
            return

        tools = get_tool_definitions()
        current_messages = list(self.messages)

        for _round in range(max_tool_rounds):
            # 调用 LLM
            full_content = ""
            try:
                stream = await self.provider.chat_stream(
                    messages=current_messages,
                    system_prompt=self.system_prompt,
                )

                # 收集完整响应用于检测 tool calls
                async for chunk in stream:
                    full_content += chunk
                    yield chunk  # 流式输出给前端

            except Exception as e:
                logger.error(f"Agent stream error: {e}")
                yield f"\n\n> 错误: {str(e)}"
                return

            # 检测是否有 tool call（通过 JSON 格式标记）
            tool_call = _parse_tool_call(full_content)
            if not tool_call:
                # 没有 tool call，对话结束
                self.add_message("assistant", full_content)
                return

            # 执行 tool call
            tool_name = tool_call["name"]
            tool_args = tool_call["arguments"]

            yield f"\n\n> 🔧 正在调用工具: `{tool_name}`...\n\n"

            result = await execute_tool(tool_name, tool_args)

            # 将 tool 结果加入上下文
            tool_result_msg = json.dumps(result, ensure_ascii=False)
            current_messages.append({
                "role": "assistant",
                "content": full_content,
            })
            current_messages.append({
                "role": "tool",
                "content": tool_result_msg,
            })

            yield f"> 工具执行结果:\n```json\n{tool_result_msg}\n```\n\n"

        yield "\n\n> 已达到最大工具调用轮次，任务可能未完成。"

    async def run(self, max_tool_rounds: int = 5) -> str:
        """非流式运行 Agent"""
        result_parts = []
        async for chunk in self.run_stream(max_tool_rounds=max_tool_rounds):
            result_parts.append(chunk)
        return "".join(result_parts)


def _parse_tool_call(content: str) -> Optional[dict]:
    """从 LLM 响应中解析 tool call"""
    import re

    # 匹配 ```tool_call ... ``` 代码块
    pattern = r"```tool_call\s*\n(.*?)\n```"
    match = re.search(pattern, content, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # 匹配独立的 JSON 对象（包含 name 和 arguments）
    pattern2 = r'\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[^}]+\}\s*\}'
    match2 = re.search(pattern2, content)
    if match2:
        try:
            return json.loads(match2.group(0))
        except json.JSONDecodeError:
            pass

    return None


# 全局会话缓存
_sessions: dict[str, AgentSession] = {}


def get_or_create_session(session_id: str) -> AgentSession:
    """获取或创建 Agent 会话"""
    if session_id not in _sessions:
        session = AgentSession()
        session.set_provider()
        _sessions[session_id] = session
    return _sessions[session_id]


def clear_session(session_id: str):
    """清除会话"""
    _sessions.pop(session_id, None)