"""5.0.2-502：AgentProvider 抽象 + 引擎路由 + 配置 get/set + 会话隔离测试（MC）

覆盖：
- Provider 协议：AgentProvider ABC 四域接口（会话/工具/技能/记忆）+ 子类契约
- OwnAgentProvider：包装 AgentSession/Skills/Memory/tools（自有引擎适配）
- HermesAgentProvider：mock 探测成功/失败（未装 → is_available False + AgentNotAvailableError
  友好提示含 pip install hermes-agent + 官网；已装 → 映射 hermes Python API + MC 工具/技能/记忆）
- 引擎路由：get_engine/resolve_engine_mode ∈ {own, hermes, auto}；auto 探测降级
- 配置 get/set：ai_engine 三选一持久化 .mc_ai_secrets.json + apply_secrets 重载
- 会话隔离：get_or_create_session 按 (engine, session_id) 命名空间，切换保留旧会话
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import pytest

from ai_hub.agent.agent import get_or_create_session, clear_session, _sessions
from ai_hub.config import (
    settings,
    AI_ENGINE_MODES,
    AI_ENGINE_DEFAULT,
    AI_ENGINE_OWN,
    AI_ENGINE_HERMES,
    AI_ENGINE_AUTO,
)
from ai_hub.agent.provider import (
    AgentProvider,
    AgentNotAvailableError,
    OwnAgentProvider,
    HermesAgentProvider,
    hermes_installed,
    get_engine,
    get_own_provider,
    get_hermes_provider,
    resolve_engine_mode,
    engine_status,
    HERMES_INSTALL_HINT,
    ENGINE_OWN,
    ENGINE_HERMES,
    ENGINE_AUTO,
    ENGINE_MODES,
    ENGINE_DEFAULT,
    ENGINE_NA_MARKER,
)


@pytest.fixture(autouse=True)
def clean_state(tmp_path, monkeypatch):
    """隔离全局状态：清空会话缓存 + 复位引擎配置 + 隔离 secrets 目录 + 清理 registry + 重置 provider 单例"""
    import ai_hub.agent.provider as prov_mod
    from ai_hub.llm.provider import registry

    saved_sessions = dict(_sessions)
    _sessions.clear()
    saved_registry = dict(registry._providers)
    registry._providers.clear()
    old_own = prov_mod._own_provider
    old_hermes = prov_mod._hermes_provider
    prov_mod._own_provider = None
    prov_mod._hermes_provider = None
    old_ws = settings.workspace_dir
    old_engine = settings.ai_engine
    settings.workspace_dir = str(tmp_path)
    settings.ai_engine = AI_ENGINE_DEFAULT
    yield
    _sessions.clear()
    _sessions.update(saved_sessions)
    registry._providers.clear()
    registry._providers.update(saved_registry)
    prov_mod._own_provider = old_own
    prov_mod._hermes_provider = old_hermes
    settings.workspace_dir = old_ws
    settings.ai_engine = old_engine


def _collect(agent: AgentProvider, **kwargs) -> str:
    async def run():
        parts = []
        async for chunk in agent.stream_chat(**kwargs):
            parts.append(chunk)
        return "".join(parts)

    return asyncio.run(run())


# ============================================================
# Provider 协议 / 抽象基类
# ============================================================

class TestProviderProtocol:
    def test_agent_provider_is_abstract(self):
        """AgentProvider 是 ABC，不能直接实例化；四域方法为抽象接口"""
        with pytest.raises(TypeError):
            AgentProvider()  # type: ignore[abstract]
        for meth in (
            "engine_name", "is_available", "stream_chat", "clear_session",
            "list_tools", "execute_tool", "list_skills", "get_skill", "get_memory_prompt",
        ):
            assert hasattr(AgentProvider, meth)

    def test_providers_are_agent_provider_subclasses(self):
        assert issubclass(OwnAgentProvider, AgentProvider)
        assert issubclass(HermesAgentProvider, AgentProvider)

    def test_engine_name_contract(self):
        assert get_own_provider().engine_name == ENGINE_OWN
        assert (ENGINE_OWN, ENGINE_HERMES, ENGINE_AUTO) == ("own", "hermes", "auto")
        assert ENGINE_MODES == ("own", "hermes", "auto")
        assert ENGINE_DEFAULT == "own"
        assert ENGINE_NA_MARKER.format(engine="hermes") == "---ENGINE_NA:hermes---"


# ============================================================
# OwnAgentProvider（自有引擎适配）
# ============================================================

class MockLLMProvider:
    """mock LLM provider：chat_stream 返回固定文本流（无工具调用）"""

    last_reasoning_content = ""

    async def chat_stream(self, messages, system_prompt="", temperature=0.7, max_tokens=4096):
        yield "你好"
        yield "，世界"


class TestOwnAgentProvider:
    def test_is_available_and_mixin_tools(self):
        from ai_hub.agent.tools import init_tools, get_tool_definitions

        init_tools()
        provider = get_own_provider()
        assert provider.is_available() is True
        defs = provider.list_tools()
        names = {d["function"]["name"] for d in defs}
        assert "list_projects" in names

    def test_list_skills_and_get_skill(self):
        provider = get_own_provider()
        skills = provider.list_skills()
        assert isinstance(skills, list)
        for s in skills:
            assert "name" in s and "enabled" in s
        detail = provider.get_skill(skills[0]["name"])
        assert detail is not None and "content" in detail
        assert provider.get_skill("__no_such__") is None

    def test_get_memory_prompt(self):
        provider = get_own_provider()
        prompt = provider.get_memory_prompt("proj")
        assert isinstance(prompt, str)

    def test_stream_chat_routes_to_agent_session(self):
        """own 引擎流式对话：注册 mock LLM Provider，走 AgentSession 完整链路"""
        from ai_hub.llm.provider import registry

        registry.register("mock-provider", MockLLMProvider())
        provider = get_own_provider()
        text = _collect(provider, session_id="own-s1", message="hi", provider="mock-provider", mode="general")
        assert "你好，世界" in text

    def test_clear_session_only_own_namespace(self):
        from ai_hub.llm.provider import registry

        registry.register("mock-provider", MockLLMProvider())
        get_or_create_session("own-clear", engine="own")
        get_or_create_session("own-clear", engine="hermes")
        assert "own:own-clear" in _sessions
        assert "hermes:own-clear" in _sessions
        get_own_provider().clear_session("own-clear")
        assert "own:own-clear" not in _sessions
        assert "hermes:own-clear" in _sessions  # 其他引擎保留


# ============================================================
# HermesAgentProvider（mock 探测成功/失败）
# ============================================================

class FakeHermesModule:
    """模拟 hermes 运行时（适配契约：chat(key, message, memory/tools/skills)）"""

    def __init__(self):
        self.calls = []

    async def chat(self, key, message, memory="", tools=None, skills=None):
        self.calls.append((key, message, memory, tools, skills))
        yield "你好"
        yield "，世界"


def _mock_hermes_absent(monkeypatch):
    import ai_hub.agent.provider as prov_mod

    monkeypatch.setattr(prov_mod.importlib.util, "find_spec", lambda name: None)


def _mock_hermes_present(monkeypatch, fake):
    import sys as _sys
    import ai_hub.agent.provider as prov_mod

    monkeypatch.setattr(
        prov_mod.importlib.util, "find_spec",
        lambda name: object() if name in prov_mod.HERMES_MODULE_CANDIDATES else None,
    )
    monkeypatch.setitem(_sys.modules, "hermes", fake)


class TestHermesAgentProvider:
    def test_not_installed_is_available_false(self, monkeypatch):
        """未安装：is_available False + not_available_hint 含 pip install + 官网；stream_chat 抛友好错误"""
        _mock_hermes_absent(monkeypatch)
        assert hermes_installed() is False
        provider = HermesAgentProvider()
        assert provider.engine_name == ENGINE_HERMES
        assert provider.is_available() is False
        hint = provider.not_available_hint()
        assert "pip install hermes-agent" in hint
        assert "https://github.com/NousResearch/hermes-agent" in hint
        with pytest.raises(AgentNotAvailableError) as exc:
            _collect(provider, session_id="hermes-s0", message="hi")
        assert "pip install hermes-agent" in str(exc.value)
        assert HERMES_INSTALL_HINT in str(exc.value)

    def test_installed_probe_and_engine_name(self, monkeypatch):
        fake = FakeHermesModule()
        _mock_hermes_present(monkeypatch, fake)
        assert hermes_installed() is True
        provider = HermesAgentProvider()
        assert provider.engine_name == ENGINE_HERMES
        assert provider.is_available() is True
        assert provider._import_hermes() is fake

    def test_stream_chat_maps_ctx_and_chunks(self, monkeypatch):
        from ai_hub.agent.tools import init_tools

        init_tools()
        fake = FakeHermesModule()
        _mock_hermes_present(monkeypatch, fake)
        provider = HermesAgentProvider()
        text = _collect(provider, session_id="hermes-s1", message="hi", mode="general", project_name="proj")
        assert "你好，世界" in text
        key, message, memory, tools, skills = fake.calls[0]
        assert key == "hermes:hermes-s1"
        assert message == "hi"
        assert isinstance(memory, str)
        assert isinstance(tools, list) and len(tools) > 0
        assert isinstance(skills, list)

    def test_installed_but_api_unadapted_raises(self, monkeypatch):
        """已安装但 Python API 未适配：无 chat 入口 → AgentNotAvailableError（等待版本更新）"""

        class NoChatModule:
            pass

        _mock_hermes_present(monkeypatch, NoChatModule())
        provider = HermesAgentProvider()
        with pytest.raises(AgentNotAvailableError) as exc:
            _collect(provider, session_id="hermes-s2", message="hi")
        assert "等待版本更新" in str(exc.value)

    def test_clear_session_hermes_namespace(self, monkeypatch):
        fake = FakeHermesModule()
        _mock_hermes_present(monkeypatch, fake)
        provider = HermesAgentProvider()
        _collect(provider, session_id="hermes-c1", message="a")
        assert "hermes:hermes-c1" not in _sessions  # hermes 会话由运行时管理
        provider.clear_session("hermes-c1")  # 不抛错即可（清理 MC 侧项目上下文）


# ============================================================
# 引擎路由（get_engine / resolve_engine_mode / auto 探测降级）
# ============================================================

class TestEngineRouting:
    def test_resolve_engine_mode_modes(self, monkeypatch):
        _mock_hermes_absent(monkeypatch)
        assert resolve_engine_mode("own") == ENGINE_OWN
        assert resolve_engine_mode("hermes") == ENGINE_HERMES
        assert resolve_engine_mode("auto") == ENGINE_AUTO
        assert resolve_engine_mode("  ") == ENGINE_DEFAULT  # 非法回退 own
        assert resolve_engine_mode("bogus") == ENGINE_DEFAULT
        assert resolve_engine_mode(None) == ENGINE_DEFAULT  # 缺省读配置（默认 own）

    def test_get_engine_own(self, monkeypatch):
        _mock_hermes_absent(monkeypatch)
        assert isinstance(get_engine("own"), OwnAgentProvider)
        assert get_engine("own") is get_own_provider()

    def test_get_engine_hermes_returns_provider(self, monkeypatch):
        _mock_hermes_absent(monkeypatch)
        eng = get_engine("hermes")
        assert isinstance(eng, HermesAgentProvider)
        assert eng.is_available() is False  # 未安装：provider 可路由，但不可用（stream 时抛友好错误）

    def test_get_engine_auto_falls_back_to_own(self, monkeypatch):
        _mock_hermes_absent(monkeypatch)
        assert get_engine("auto") is get_own_provider()

    def test_get_engine_auto_uses_hermes_when_installed(self, monkeypatch):
        _mock_hermes_present(monkeypatch, FakeHermesModule())
        eng = get_engine("auto")
        assert isinstance(eng, HermesAgentProvider)

    def test_engine_status_own_available_hermes_not(self, monkeypatch):
        _mock_hermes_absent(monkeypatch)
        status = engine_status()
        assert status["engine"] == ENGINE_DEFAULT
        assert status["resolved"] == ENGINE_OWN
        assert status["available"] == {ENGINE_OWN: True, ENGINE_HERMES: False}


# ============================================================
# 配置 get/set（ai_engine 三选一，持久化 .mc_ai_secrets.json）
# ============================================================

class TestEngineConfig:
    def test_default_engine_is_own(self):
        assert AI_ENGINE_DEFAULT == "own"
        assert AI_ENGINE_MODES == ("own", "hermes", "auto")
        from ai_hub.config import get_ai_engine

        assert get_ai_engine() == "own"

    def test_set_persists_and_apply(self, tmp_path):
        from ai_hub.config import set_ai_engine, get_ai_engine, apply_secrets

        r = set_ai_engine("hermes")
        assert r == "hermes"
        assert settings.ai_engine == "hermes"
        assert get_ai_engine() == "hermes"
        secrets = json.loads((tmp_path / ".mc_ai_secrets.json").read_text(encoding="utf-8"))
        assert secrets["ai_engine"] == "hermes"
        # apply_secrets 重新加载（模拟重启）
        settings.ai_engine = "own"
        apply_secrets()
        assert settings.ai_engine == "hermes"

    def test_set_auto_and_clamp(self, tmp_path):
        from ai_hub.config import set_ai_engine, clamp_ai_engine

        assert clamp_ai_engine("auto") == "auto"
        assert clamp_ai_engine("bogus") == "own"
        assert clamp_ai_engine(None) == "own"
        assert set_ai_engine("auto") == "auto"

    def test_ai_engine_excluded_from_provider_configs(self, tmp_path):
        from ai_hub.config import set_ai_engine, apply_secrets

        set_ai_engine("hermes")
        apply_secrets()
        assert "ai_engine" not in settings.provider_configs


# ============================================================
# 会话隔离（engine 维度命名空间）
# ============================================================

class TestSessionIsolation:
    def test_same_engine_reuses_same_session(self):
        s1 = get_or_create_session("sess", engine="own")
        s2 = get_or_create_session("sess", engine="own")
        assert s1 is s2
        assert s1.engine == "own"

    def test_different_engine_distinct_namespace(self):
        own = get_or_create_session("sess", engine="own")
        hermes = get_or_create_session("sess", engine="hermes")
        assert own is not hermes
        assert own.engine == "own" and hermes.engine == "hermes"
        # 切换引擎保留旧会话（own 命名空间仍存在）
        assert "own:sess" in _sessions
        assert "hermes:sess" in _sessions

    def test_clear_only_target_engine(self):
        get_or_create_session("sess", engine="own")
        get_or_create_session("sess", engine="hermes")
        clear_session("sess", engine="own")
        assert "own:sess" not in _sessions
        assert "hermes:sess" in _sessions
        # 向后兼容：单参调用默认 own
        get_or_create_session("s2", engine="own")
        clear_session("s2")
        assert "own:s2" not in _sessions

    def test_default_engine_backward_compatible(self):
        s = get_or_create_session("legacy")
        assert s.engine == "own"
