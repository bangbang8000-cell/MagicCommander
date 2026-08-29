"""PRD v3.5 M1（MC-SESS2/3）后端会话上下文隔离测试

S-6 两会话互不串上下文：
- 不同 session_id 的 AgentSession 独立 history
- 同一 session_id 复用同一会话、上下文累积
- clear_session 清空后端会话 history（新对话语义）
- conversationId（session_id）缺省时回落默认会话，兼容既有单会话调用
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.agent.agent import get_or_create_session, clear_session
from ai_hub.api.chat import ChatRequest


def test_two_sessions_context_isolated():
    """两会话互不串上下文：各自 messages 独立，内容互不渗透"""
    a = get_or_create_session("sess-isol-a")
    b = get_or_create_session("sess-isol-b")
    assert a is not b

    a.add_user_message("这是会话A独有的上下文")
    b.add_user_message("这是会话B独有的上下文")

    assert len(a.messages) == 1
    assert len(b.messages) == 1
    assert "会话A" in a.messages[0]["content"]
    assert "会话A" not in b.messages[0]["content"]
    assert "会话B" in b.messages[0]["content"]
    assert "会话B" not in a.messages[0]["content"]


def test_same_session_accumulates_context():
    """同一 session_id 复用同一会话实例，多轮上下文累积"""
    a1 = get_or_create_session("sess-acc")
    a1.add_user_message("第一轮问题")
    a2 = get_or_create_session("sess-acc")
    a2.add_user_message("第二轮追问")

    assert a1 is a2
    assert len(a2.messages) == 2


def test_clear_session_resets_history():
    """clear_session 清除后端会话 history，再次创建为全新空会话（清空上下文语义）"""
    s = get_or_create_session("sess-clear")
    s.add_user_message("历史内容")
    assert len(s.messages) == 1

    clear_session("sess-clear")

    s2 = get_or_create_session("sess-clear")
    assert s2 is not s
    assert len(s2.messages) == 0


def test_chat_request_default_session_when_id_omitted():
    """conversationId（session_id）缺省时回落 default 会话，兼容既有单会话"""
    req = ChatRequest(message="你好", mode="general", provider="mock")
    assert req.session_id == "default"

    req2 = ChatRequest(message="你好", session_id="sess-x", mode="general", provider="mock")
    assert req2.session_id == "sess-x"
