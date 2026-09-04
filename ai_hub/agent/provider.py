"""AI 引擎 Provider 抽象层（5.0.2-F502-1：AI Agent 底座，Hermes 并存）

设计：适配器骨架 + 探测降级。
- AgentProvider 抽象：会话（stream chat + clear_session）/ 工具（list_tools/execute_tool）
  / 技能（list_skills/get_skill）/ 记忆（get_memory_prompt）统一接口。
- OwnAgentProvider：将自有引擎（AgentSession + SkillsEngine + MemoryEngine + tools）适配为 provider。
- HermesAgentProvider：适配 NousResearch/hermes-agent——探测 hermes 运行时是否安装
  （importlib 探测，不真实安装），未安装则 AgentNotAvailableError 携带友好安装指引；
  已安装则调用其 Python API 完成对话/工具/技能/记忆映射（工具映射与技能同步）。
- 引擎路由 get_engine(engine_mode)：engine_mode ∈ {own, hermes, auto}；
  auto = Hermes 可用则 Hermes，否则自有引擎。

本模块为 hermes 引用的唯一许可位置（审计 test_no_external_agent.py 据此校验）。
"""
import asyncio
import importlib.util
import logging
from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional

logger = logging.getLogger(__name__)

# ============================================================
# AI 引擎三选一（F502-2）
# ============================================================
ENGINE_OWN = "own"
ENGINE_HERMES = "hermes"
ENGINE_AUTO = "auto"
ENGINE_MODES = (ENGINE_OWN, ENGINE_HERMES, ENGINE_AUTO)
ENGINE_DEFAULT = ENGINE_OWN

# Hermes 运行时探测的候选模块名
HERMES_MODULE_CANDIDATES = ("hermes", "hermes_agent")

HERMES_INSTALL_HINT = (
    "AI 引擎 Hermes 未安装。安装指引：在终端执行 `pip install hermes-agent`，"
    "然后重启应用即可启用（官方仓库 https://github.com/NousResearch/hermes-agent ）。"
    "安装前可先在设置中切换回「自有引擎」继续使用。"
)

# 前端「Hermes 未安装」提示卡片标记（独立行，渲染时按行剥离，不进显示区；
# 与 ---CONFIRM:<tool>--- 同一设计，前端 ChatMessageBubble 据此渲染提示卡片）
ENGINE_NA_MARKER = "---ENGINE_NA:{engine}---"


class AgentNotAvailableError(RuntimeError):
    """Agent 引擎不可用（如 Hermes 未安装 / API 未适配）"""


def _probe_hermes_module():
    """探测并导入 Hermes 运行时；未安装/导入失败返回 None（不抛异常）。

    探测使用 importlib.util.find_spec（不触发真实 import 副作用），
    确认存在后才 __import__；适配器骨架阶段 Hermes 通常未安装。
    """
    for name in HERMES_MODULE_CANDIDATES:
        if importlib.util.find_spec(name) is not None:
            try:
                return __import__(name)
            except Exception as e:
                logger.warning(f"hermes '{name}' import failed: {e}")
    return None


def hermes_installed() -> bool:
    """Hermes 运行时是否已安装（探测，不真实 import）"""
    return _probe_hermes_module() is not None


class AgentProvider(ABC):
    """Agent 引擎 Provider 抽象：会话 / 工具 / 技能 / 记忆 统一接口

    自有引擎（OwnAgentProvider）与外部引擎（HermesAgentProvider）以同一接口适配，
    api/chat 只依赖本抽象，不感知具体引擎实现。
    """

    @property
    @abstractmethod
    def engine_name(self) -> str:
        """引擎标识（own / hermes）"""
        ...

    @abstractmethod
    def is_available(self) -> bool:
        """引擎是否可用（Hermes 需运行时已安装）"""
        ...

    def not_available_hint(self) -> str:
        """引擎不可用时的友好提示文案（含安装指引）；可用时返回空串"""
        return ""

    @abstractmethod
    async def stream_chat(
        self,
        session_id: str,
        message: str,
        mode: str = "general",
        project_name: str = "",
        autonomy_mode: str = "semi_auto",
        provider: Optional[str] = None,
        attachments: Optional[list[dict]] = None,
        max_tool_rounds: Optional[int] = None,
        knowledge: bool = True,
        knowledge_ids: Optional[list[str]] = None,
    ) -> AsyncIterator[str]:
        """流式对话：逐块 yield 文本；引擎不可用抛 AgentNotAvailableError

        5.0.5-505-c：knowledge 知识库注入开关（默认开）；knowledge_ids 指定条目精确注入。
        """
        ...

    @abstractmethod
    def clear_session(self, session_id: str) -> None:
        """清除指定会话（引擎维度命名空间内）"""
        ...

    @abstractmethod
    def list_tools(self) -> list[dict]:
        """列出工具定义（JSON Schema 格式）"""
        ...

    @abstractmethod
    async def execute_tool(self, name: str, arguments: dict) -> dict:
        """执行工具，返回 {success, result|error}"""
        ...

    @abstractmethod
    def list_skills(self) -> list[dict]:
        """列出技能元信息"""
        ...

    @abstractmethod
    def get_skill(self, name: str) -> Optional[dict]:
        """返回技能详情；不存在返回 None"""
        ...

    @abstractmethod
    def get_memory_prompt(self, project_name: str = "") -> str:
        """返回用户/项目记忆提示文本"""
        ...


class _MCToolsMixin:
    """工具/技能/记忆的 MC 侧透传（自有引擎与 Hermes 双端复用同一 MC 工具面）

    - 工具：透传 ai_hub.agent.tools 注册表（Hermes 经同一 execute_tool 调 backend CLI）
    - 技能：透传 SkillsEngine（Hermes 的 SKILL.md 机制与 MC 技能库同步）
    - 记忆：透传 MemoryEngine（Hermes 的 MEMORY.md/USER.md 机制与 MC 记忆同步）
    """

    def list_tools(self) -> list[dict]:
        from ai_hub.agent.tools import get_tool_definitions
        return get_tool_definitions()

    async def execute_tool(self, name: str, arguments: dict) -> dict:
        from ai_hub.agent.tools import execute_tool as _execute
        return await _execute(name, arguments)

    def list_skills(self) -> list[dict]:
        from ai_hub.skills.engine import get_skills_engine
        return get_skills_engine().list_skills()

    def get_skill(self, name: str) -> Optional[dict]:
        from ai_hub.skills.engine import get_skills_engine
        return get_skills_engine().get_skill(name)

    def get_memory_prompt(self, project_name: str = "") -> str:
        from ai_hub.memory.engine import get_memory_engine
        return get_memory_engine().get_memory_prompt(project_name)


class OwnAgentProvider(_MCToolsMixin, AgentProvider):
    """自有引擎适配：包装 AgentSession / SkillsEngine / MemoryEngine / tools（F502-1）"""

    @property
    def engine_name(self) -> str:
        return ENGINE_OWN

    def is_available(self) -> bool:
        return True

    async def stream_chat(
        self,
        session_id: str,
        message: str,
        mode: str = "general",
        project_name: str = "",
        autonomy_mode: str = "semi_auto",
        provider: Optional[str] = None,
        attachments: Optional[list[dict]] = None,
        max_tool_rounds: Optional[int] = None,
        knowledge: bool = True,
        knowledge_ids: Optional[list[str]] = None,
    ) -> AsyncIterator[str]:
        from ai_hub.agent.agent import get_or_create_session
        # 会话隔离：engine 维度命名空间（不同引擎的同一 session_id 互不串上下文）
        session = get_or_create_session(session_id, engine=self.engine_name)
        if provider:
            session.set_provider(provider)
        session.set_mode(mode, project_name or "")
        session.autonomy_mode = autonomy_mode
        # 5.0.5-505-c：知识库注入开关 + 指定条目透传到会话（run_stream 动态注入）
        session.knowledge_enabled = knowledge
        session.knowledge_ids = knowledge_ids
        session.add_user_message(message, attachments)
        # 5.0.3-503-a：多步任务编排——workflow 模式开启时由自有引擎内部驱动
        # 状态机（Plan→Execute→Verify）；Hermes 路径零改动（workflow 只对自有引擎生效）。
        if getattr(session, "workflow", "off") == "on":
            from ai_hub.agent.workflow import workflow_stream
            async for chunk in workflow_stream(session, message, max_tool_rounds=max_tool_rounds):
                yield chunk
            return
        async for chunk in session.run_stream(max_tool_rounds=max_tool_rounds):
            yield chunk

    def clear_session(self, session_id: str) -> None:
        from ai_hub.agent.agent import clear_session as _clear
        _clear(session_id, engine=self.engine_name)


class HermesAgentProvider(_MCToolsMixin, AgentProvider):
    """Hermes 引擎适配（NousResearch/hermes-agent）：探测 → 降级，就绪后无缝启用（F502-3）

    - 未安装：is_available() False；stream_chat 抛 AgentNotAvailableError（含安装指引）。
    - 已安装：调用 hermes-agent 的 Python API 完成对话；MC 工具/技能/记忆经 _MCToolsMixin
      映射进 hermes 会话上下文（Hermes 自身有 MEMORY.md/USER.md/SKILL.md 机制，适配器做同步）。
    """

    def __init__(self):
        self._hermes_module = None

    @property
    def engine_name(self) -> str:
        return ENGINE_HERMES

    def _import_hermes(self):
        """惰性探测/导入 Hermes 运行时；结果缓存。未安装返回 None。"""
        if self._hermes_module is None:
            self._hermes_module = _probe_hermes_module()
        return self._hermes_module

    def is_available(self) -> bool:
        return self._import_hermes() is not None

    def not_available_hint(self) -> str:
        return HERMES_INSTALL_HINT

    async def stream_chat(
        self,
        session_id: str,
        message: str,
        mode: str = "general",
        project_name: str = "",
        autonomy_mode: str = "semi_auto",
        provider: Optional[str] = None,
        attachments: Optional[list[dict]] = None,
        max_tool_rounds: Optional[int] = None,
        knowledge: bool = True,
        knowledge_ids: Optional[list[str]] = None,
    ) -> AsyncIterator[str]:
        mod = self._import_hermes()
        if mod is None:
            raise AgentNotAvailableError(HERMES_INSTALL_HINT)
        # 会话：engine 维度命名空间（不同 session_id 独立 hermes 会话，切换引擎旧会话保留）
        hermes_key = f"hermes:{session_id}"
        # 工具映射与技能同步：把 MC 工具定义/技能/记忆同步进 hermes 会话上下文
        # （5.0.5-505-c：知识库注入为自有引擎 run_stream 机制，Hermes 路径经工具检索即可）
        ctx = {
            "memory_prompt": self.get_memory_prompt(project_name),
            "skills": self.list_skills(),
            "tools": self.list_tools(),
        }
        async for chunk in _call_hermes_chat(mod, hermes_key, message, ctx, max_tool_rounds):
            yield chunk

    def clear_session(self, session_id: str) -> None:
        # hermes 会话由运行时管理；此处仅清理 MC 侧项目上下文（按引擎命名空间）
        from ai_hub.agent.context import clear_project_context
        clear_project_context(f"{ENGINE_HERMES}:{session_id}")


async def _call_hermes_chat(
    mod,
    key: str,
    message: str,
    ctx: dict,
    max_tool_rounds: Optional[int] = None,
) -> AsyncIterator[str]:
    """调用 Hermes 运行时 Python API（版本防御性适配）

    - 入口 A：mod.chat(key, message, memory=..., tools=..., skills=...) 返回
      async 可迭代（str 块）；返回 str / awaitable 亦可。
    - 其余入口未识别 → 抛 AgentNotAvailableError（已安装但 API 未适配，等待版本更新）。
    """
    chat_fn = getattr(mod, "chat", None)
    if callable(chat_fn):
        try:
            result = chat_fn(
                key,
                message,
                memory=ctx.get("memory_prompt", ""),
                tools=ctx.get("tools") or [],
                skills=ctx.get("skills") or [],
            )
            if hasattr(result, "__aiter__"):
                async for chunk in result:
                    yield str(chunk)
                return
            if asyncio.iscoroutine(result):
                text = await result
                if hasattr(text, "__aiter__"):
                    async for chunk in text:
                        yield str(chunk)
                    return
                yield str(text or "")
                return
            if isinstance(result, str):
                yield result
                return
        except AgentNotAvailableError:
            raise
        except Exception as e:
            logger.error(f"Hermes chat failed: {e}")
            raise AgentNotAvailableError(f"Hermes 调用失败：{e}") from e
    raise AgentNotAvailableError(
        "已安装 hermes-agent，但当前版本 Python API 尚未适配，请等待版本更新，"
        "或在设置中切换回「自有引擎」继续使用。"
    )


# ============================================================
# 引擎注册表 / 路由（F502-2）
# ============================================================

_own_provider: Optional[OwnAgentProvider] = None
_hermes_provider: Optional[HermesAgentProvider] = None


def get_own_provider() -> OwnAgentProvider:
    global _own_provider
    if _own_provider is None:
        _own_provider = OwnAgentProvider()
    return _own_provider


def get_hermes_provider() -> HermesAgentProvider:
    global _hermes_provider
    if _hermes_provider is None:
        _hermes_provider = HermesAgentProvider()
    return _hermes_provider


def resolve_engine_mode(engine: Optional[str] = None) -> str:
    """解析请求/配置的引擎模式：缺省读配置 ai_engine；非法回退 own"""
    from ai_hub.config import get_ai_engine
    mode = engine or get_ai_engine()
    return mode if mode in ENGINE_MODES else ENGINE_DEFAULT


def get_engine(engine_mode: Optional[str] = None) -> AgentProvider:
    """引擎路由：own → 自有；hermes → Hermes；auto → Hermes 可用则 Hermes 否则自有"""
    mode = resolve_engine_mode(engine_mode)
    if mode == ENGINE_HERMES:
        return get_hermes_provider()
    if mode == ENGINE_AUTO:
        hermes = get_hermes_provider()
        if hermes.is_available():
            return hermes
        return get_own_provider()
    return get_own_provider()


def engine_status() -> dict:
    """引擎状态（供 /api/chat/engine 与前端展示）：当前配置 + 各引擎可用性 + 实际解析"""
    mode = resolve_engine_mode()
    hermes = get_hermes_provider()
    available = {ENGINE_OWN: True, ENGINE_HERMES: hermes.is_available()}
    return {
        "engine": mode,
        "resolved": get_engine(mode).engine_name,
        "available": available,
    }
