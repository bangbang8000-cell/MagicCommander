"""MC-LOOP1/2：AI 工具循环上限可配置 测试（PRD v3.4）

覆盖维度：
- L1 默认 5：未配置时 get_max_tool_loop_rounds() == 5
- L4 clamp 边界：0→1、11→10、负数→1、非法输入→5
- 持久化：set_max_tool_loop_rounds 写入 secrets；apply_secrets 恢复
- API：POST /api/chat/config/general 持久化并 clamp；POST /api/chat/config 随 configure 链路持久化
- L5 保存即生效：set 后 get 立即返回新值（无需重启）
- L2 设 3 达上限结束：agent 仅执行 3 轮并提示「已达到最大工具循环轮数 3」
- L3 设 10 可 >5 轮：agent 可执行 10 轮（> 默认 5）并提示「已达到最大工具循环轮数 10」
"""
import asyncio
import os
import sys
from unittest import mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.agent.agent import AgentSession
from ai_hub.api.chat import router as chat_router
from ai_hub.config import (
    MAX_TOOL_LOOP_ROUNDS_DEFAULT,
    MAX_TOOL_LOOP_ROUNDS_MAX,
    MAX_TOOL_LOOP_ROUNDS_MIN,
    apply_secrets,
    clamp_max_tool_loop_rounds,
    get_max_tool_loop_rounds,
    load_secrets,
    settings,
    set_max_tool_loop_rounds,
)


@pytest.fixture
def isolated_secrets(tmp_path, monkeypatch):
    """隔离 secrets 落盘目录（workspace_dir → tmp_path），测试结束后 monkeypatch 自动还原"""
    monkeypatch.setattr(settings, "workspace_dir", str(tmp_path))
    yield tmp_path


def _build_app() -> FastAPI:
    app = FastAPI(title="Test AI Hub")
    app.include_router(chat_router)
    return app


# --- L1：默认 5 ---

def test_default_is_5(isolated_secrets):
    assert MAX_TOOL_LOOP_ROUNDS_DEFAULT == 5
    assert get_max_tool_loop_rounds() == 5


# --- L4：clamp 边界 ---

def test_clamp_lower_boundary(isolated_secrets):
    assert clamp_max_tool_loop_rounds(0) == MAX_TOOL_LOOP_ROUNDS_MIN
    assert clamp_max_tool_loop_rounds(-5) == MAX_TOOL_LOOP_ROUNDS_MIN


def test_clamp_upper_boundary(isolated_secrets):
    assert clamp_max_tool_loop_rounds(11) == MAX_TOOL_LOOP_ROUNDS_MAX
    assert clamp_max_tool_loop_rounds(100) == MAX_TOOL_LOOP_ROUNDS_MAX


def test_clamp_invalid_inputs_fall_back_to_default(isolated_secrets):
    assert clamp_max_tool_loop_rounds("abc") == MAX_TOOL_LOOP_ROUNDS_DEFAULT
    assert clamp_max_tool_loop_rounds(None) == MAX_TOOL_LOOP_ROUNDS_DEFAULT


def test_clamp_keeps_valid_values(isolated_secrets):
    assert clamp_max_tool_loop_rounds(3) == 3
    assert clamp_max_tool_loop_rounds(10) == 10


# --- L5：保存即生效 + 持久化 ---

def test_set_then_get_is_immediate(isolated_secrets):
    set_max_tool_loop_rounds(3)
    assert get_max_tool_loop_rounds() == 3


def test_set_persists_to_secrets_file(isolated_secrets):
    set_max_tool_loop_rounds(3)
    secrets = load_secrets()
    assert secrets["max_tool_loop_rounds"] == 3


def test_apply_secrets_restores_value(isolated_secrets):
    set_max_tool_loop_rounds(8)
    # 模拟重启后的内存默认值
    settings.max_tool_loop_rounds = MAX_TOOL_LOOP_ROUNDS_DEFAULT
    apply_secrets()
    assert settings.max_tool_loop_rounds == 8
    assert get_max_tool_loop_rounds() == 8


def test_apply_secrets_excludes_key_from_provider_configs(isolated_secrets):
    set_max_tool_loop_rounds(6)
    apply_secrets()
    assert "max_tool_loop_rounds" not in settings.provider_configs


# --- API：/api/chat/config/general ---

def test_api_config_general_persists_valid(isolated_secrets):
    app = _build_app()
    with TestClient(app) as client:
        r = client.post("/api/chat/config/general", json={"max_tool_loop_rounds": 3})
        assert r.status_code == 200, r.text
        assert r.json() == {"status": "ok", "max_tool_loop_rounds": 3}
    assert get_max_tool_loop_rounds() == 3


def test_api_config_general_clamps_upper(isolated_secrets):
    app = _build_app()
    with TestClient(app) as client:
        r = client.post("/api/chat/config/general", json={"max_tool_loop_rounds": 99})
        assert r.status_code == 200, r.text
        assert r.json() == {"status": "ok", "max_tool_loop_rounds": MAX_TOOL_LOOP_ROUNDS_MAX}
    assert get_max_tool_loop_rounds() == MAX_TOOL_LOOP_ROUNDS_MAX


def test_api_config_carries_tool_loop_rounds(isolated_secrets):
    """MC-LOOP1：随既有 configure 链路（/api/chat/config）可选持久化工具循环上限"""
    app = _build_app()
    with TestClient(app) as client:
        r = client.post(
            "/api/chat/config",
            json={"provider": "deepseek", "api_key": "k", "max_tool_loop_rounds": 7},
        )
        assert r.status_code == 200, r.text
    assert get_max_tool_loop_rounds() == 7


# --- L2/L3：agent 多轮循环上限生效 ---

TOOL_CALL_TEXT = '```tool_call\n{"name": "list_projects", "arguments": {}}\n```'


class AlwaysToolProvider:
    """每轮 chat_stream 都返回 tool_call，用于验证循环上限"""

    last_reasoning_content = ""

    async def chat_stream(self, messages, system_prompt="", temperature=0.7, max_tokens=4096):
        yield TOOL_CALL_TEXT


async def _collect(agen):
    out = []
    async for chunk in agen:
        out.append(chunk)
    return out


def _run_and_count(session):
    executed = []

    async def fake_execute(name, args):
        executed.append(name)
        return {"success": True, "result": {"projects": []}}

    with mock.patch("ai_hub.agent.agent.execute_tool", new=fake_execute):
        chunks = asyncio.run(_collect(session.run_stream()))
    return executed, "\n".join(chunks)


def test_agent_stops_at_configured_limit_3(isolated_secrets):
    """L2：设 3 → agent 仅执行 3 轮，达到上限提示并正常结束（不报错）"""
    set_max_tool_loop_rounds(3)
    session = AgentSession()
    session.provider = AlwaysToolProvider()
    session.autonomy_mode = "full_auto"

    executed, out = _run_and_count(session)
    assert len(executed) == 3
    assert "已达到最大工具循环轮数 3" in out


def test_agent_can_exceed_default_5_with_limit_10(isolated_secrets):
    """L3：设 10 → agent 可执行超过默认 5 轮（10 轮），提示轮数正确"""
    set_max_tool_loop_rounds(10)
    session = AgentSession()
    session.provider = AlwaysToolProvider()
    session.autonomy_mode = "full_auto"

    executed, out = _run_and_count(session)
    assert len(executed) == 10
    assert len(executed) > MAX_TOOL_LOOP_ROUNDS_DEFAULT
    assert "已达到最大工具循环轮数 10" in out
