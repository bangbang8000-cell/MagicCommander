"""
Agent 编排层
负责 Tool Calling 编排、上下文管理、多步骤推理
"""
import json
import logging
import re
import uuid
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

    def add_message(self, role: str, content: str, extra: dict = None):
        msg = {"role": role, "content": content}
        if extra:
            msg.update(extra)
        self.messages.append(msg)

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
            # 调用 LLM，实时流式输出
            full_content = ""
            try:
                stream = self.provider.chat_stream(
                    messages=current_messages,
                    system_prompt=self.system_prompt,
                )

                async for chunk in stream:
                    full_content += chunk
                    yield chunk  # 实时流式输出给前端

            except Exception as e:
                logger.error(f"Agent stream error: {e}")
                yield f"\n\n> 错误: {_extract_error_message(e)}"
                return

            # 检测是否有 tool call
            tool_call = _parse_tool_call(full_content)
            if not tool_call:
                # 没有 tool call，对话结束
                reason = _get_reasoning(self.provider)
                self.add_message("assistant", full_content, {"reasoning_content": reason} if reason else None)
                return

            # 有 tool call：输出工具调用状态
            cleaned_content = _strip_tool_call(full_content)

            tool_name = tool_call["name"]
            tool_args = tool_call["arguments"]
            tool_call_id = f"call_{uuid.uuid4().hex[:12]}"

            yield f"\n\n> 🔧 正在调用工具: `{tool_name}`...\n\n"

            try:
                result = await execute_tool(tool_name, tool_args)
            except Exception as e:
                logger.error(f"Tool execution error: {e}")
                yield f"> 工具执行失败: {_extract_error_message(e)}\n\n"
                return

            # 将 tool 结果加入上下文（OpenAI 标准格式）
            tool_result_json = json.dumps(result, ensure_ascii=False)
            reason = _get_reasoning(self.provider)
            assistant_msg = {
                "role": "assistant",
                "content": cleaned_content if cleaned_content else None,
                "tool_calls": [{
                    "id": tool_call_id,
                    "type": "function",
                    "function": {
                        "name": tool_name,
                        "arguments": json.dumps(tool_args, ensure_ascii=False),
                    }
                }]
            }
            if reason:
                assistant_msg["reasoning_content"] = reason
            current_messages.append(assistant_msg)
            current_messages.append({
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": tool_result_json,
            })

            yield f"> 工具执行结果:\n```json\n{tool_result_json}\n```\n\n"

        yield "\n\n> 已达到最大工具调用轮次，任务可能未完成。"

    async def run(self, max_tool_rounds: int = 5) -> str:
        """非流式运行 Agent"""
        result_parts = []
        async for chunk in self.run_stream(max_tool_rounds=max_tool_rounds):
            result_parts.append(chunk)
        return "".join(result_parts)


def _parse_tool_call(content: str) -> Optional[dict]:
    """从 LLM 响应中解析 tool call，返回 {name, arguments} 或 None"""

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


def _strip_tool_call(content: str) -> str:
    """从内容中移除 tool call JSON，返回清理后的文本"""
    # 移除 ```tool_call ... ``` 代码块
    cleaned = re.sub(r"```tool_call\s*\n.*?\n```\s*", "", content, flags=re.DOTALL)
    # 移除独立的 JSON 对象（包含 name 和 arguments）
    cleaned = re.sub(
        r'\n?\s*\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[^}]+\}\s*\}\s*\n?',
        "",
        cleaned,
    )
    return cleaned.strip()


def _extract_error_message(e: Exception) -> str:
    """从异常中提取用户友好的错误信息"""
    msg = str(e)

    # 尝试解析 OpenAI API 错误
    try:
        # 格式: "Error code: 400 - {'error': {'message': '...', ...}}"
        if "Error code:" in msg:
            parts = msg.split(" - ", 1)
            if len(parts) > 1:
                detail = parts[1]
                # 尝试解析 JSON
                try:
                    data = json.loads(detail.replace("'", '"'))
                    if "error" in data and "message" in data["error"]:
                        return data["error"]["message"]
                except (json.JSONDecodeError, KeyError):
                    pass
                return detail[:200]
    except Exception:
        pass

    return msg[:300]


def _get_reasoning(provider) -> str:
    """获取 Provider 的 reasoning_content（DeepSeek thinking mode）"""
    reason = getattr(provider, 'last_reasoning_content', '')
    return reason.strip() if reason else ''


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