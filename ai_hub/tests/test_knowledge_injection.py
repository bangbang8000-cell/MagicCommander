"""5.0.5-505-c：知识库上下文注入——loader 拼接 / 开关 / 缓存失效 / run_stream 动态注入

覆盖：
- get_system_prompt(query/project) 注入知识库上下文段；knowledge=False 不注入
- 空知识库 / 无关查询不注入噪音
- 知识变更递增 system prompt 版本（invalidate_system_prompt_cache）
- run_stream 按最近用户消息动态注入（knowledge_enabled 开关 / knowledge_ids 精确注入）
- ChatRequest 接收 knowledge / knowledge_ids 字段
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.agent.agent import AgentSession, _last_user_message_text
from ai_hub.prompts import loader
from ai_hub.prompts.loader import get_system_prompt, get_system_prompt_version
import ai_hub.knowledge.engine as kb_engine
from ai_hub.knowledge.engine import get_knowledge_engine


def _isolate_knowledge(tmp_path, monkeypatch):
    monkeypatch.setattr(kb_engine, "KNOWLEDGE_DIR", tmp_path)
    kb_engine._engine = None
    get_knowledge_engine().load_all()


def _seed_knowledge(tmp_path, monkeypatch):
    _isolate_knowledge(tmp_path, monkeypatch)
    get_knowledge_engine().add_entry(
        title="VLAN 规划", content="VLAN 100 为业务网，VLAN 200 为管理网",
        category="网络", tags=["vlan"], project="proj-a",
    )


# --- loader 注入 ---

def test_get_system_prompt_injects_knowledge(tmp_path, monkeypatch):
    _seed_knowledge(tmp_path, monkeypatch)
    prompt = get_system_prompt(query="VLAN", project_name="proj-a")
    assert "## 知识库上下文" in prompt
    assert "VLAN 100 为业务网" in prompt
    assert "VLAN 规划" in prompt


def test_get_system_prompt_knowledge_disabled(tmp_path, monkeypatch):
    _seed_knowledge(tmp_path, monkeypatch)
    prompt = get_system_prompt(query="VLAN", project_name="proj-a", knowledge=False)
    assert "## 知识库上下文" not in prompt


def test_get_system_prompt_no_inject_when_empty_library(tmp_path, monkeypatch):
    _isolate_knowledge(tmp_path, monkeypatch)
    prompt = get_system_prompt(query="VLAN", project_name="proj-a")
    assert "## 知识库上下文" not in prompt


def test_get_system_prompt_ignores_unrelated_query(tmp_path, monkeypatch):
    _seed_knowledge(tmp_path, monkeypatch)
    prompt = get_system_prompt(query="zzz完全不相关", project_name="")
    assert "## 知识库上下文" not in prompt


# --- 缓存失效 ---

def test_knowledge_change_bumps_system_prompt_version(tmp_path, monkeypatch):
    _seed_knowledge(tmp_path, monkeypatch)
    v0 = get_system_prompt_version()
    get_knowledge_engine().add_entry(title="新条目", content="x")
    assert get_system_prompt_version() > v0


# --- run_stream 动态注入 ---

class CapturingStreamProvider:
    last_reasoning_content = ""

    def __init__(self):
        self.captured_prompt = ""

    async def chat_stream(self, messages, system_prompt="", temperature=0.7, max_tokens=4096):
        self.captured_prompt = system_prompt
        yield "好的"


def _collect(session):
    async def run():
        out = []
        async for c in session.run_stream():
            out.append(c)
        return out

    return asyncio.run(run())


def test_run_stream_injects_knowledge_for_last_user_message(tmp_path, monkeypatch):
    _seed_knowledge(tmp_path, monkeypatch)
    provider = CapturingStreamProvider()
    session = AgentSession()
    session.provider = provider
    session.knowledge_enabled = True
    session.add_message("user", "VLAN 怎么规划？")
    _collect(session)
    assert "## 知识库上下文" in provider.captured_prompt
    assert "VLAN 100 为业务网" in provider.captured_prompt


def test_run_stream_knowledge_disabled_no_inject(tmp_path, monkeypatch):
    _seed_knowledge(tmp_path, monkeypatch)
    provider = CapturingStreamProvider()
    session = AgentSession()
    session.provider = provider
    session.knowledge_enabled = False
    session.add_message("user", "VLAN 怎么规划？")
    _collect(session)
    assert "## 知识库上下文" not in provider.captured_prompt


def test_run_stream_knowledge_ids_precise_inject(tmp_path, monkeypatch):
    _isolate_knowledge(tmp_path, monkeypatch)
    e1 = get_knowledge_engine().add_entry(title="目标条目", content="目标内容", category="网络")
    get_knowledge_engine().add_entry(title="无关条目", content="无关内容", category="存储")
    provider = CapturingStreamProvider()
    session = AgentSession()
    session.provider = provider
    session.knowledge_enabled = True
    session.knowledge_ids = [e1["key"]]
    session.add_message("user", "完全无关的问题内容")
    _collect(session)
    assert "目标内容" in provider.captured_prompt
    assert "无关内容" not in provider.captured_prompt


# --- 工具函数 ---

def test_last_user_message_text():
    assert _last_user_message_text([{"role": "user", "content": "VLAN 规划"}]) == "VLAN 规划"
    assert _last_user_message_text([{"role": "user", "content": "@@MC_SUMMARIZE@@..."}]) == ""
    assert _last_user_message_text([{"role": "assistant", "content": "x"}]) == ""
    assert _last_user_message_text([]) == ""


# --- ChatRequest 字段 ---

def test_chat_request_accepts_knowledge_fields(tmp_path, monkeypatch):
    from ai_hub.api.chat import ChatRequest
    req = ChatRequest(message="hi", knowledge=False, knowledge_ids=["a", "b"])
    assert req.knowledge is False
    assert req.knowledge_ids == ["a", "b"]
    req2 = ChatRequest(message="hi")
    assert req2.knowledge is True
    assert req2.knowledge_ids is None
