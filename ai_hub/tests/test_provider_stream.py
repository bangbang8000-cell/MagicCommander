"""LLM Provider 流式推理内容转发测试

覆盖维度：
- DeepSeek 等推理模型的 reasoning_content 在思考期（content 为空）也被转发为内容流，
  保证前端在思考期有 chunk（重置活跃超时 + 可见输出），避免空流被误杀
- reasoning_content 始终累计到 last_reasoning_content，供 agent 层持久化
- content 存在时正文优先转发（避免重复输出）
"""
import asyncio
import os
import sys
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.config import ProviderConfig
from ai_hub.llm.provider import OpenAICompatibleProvider


class MockDelta:
    def __init__(self, content=None, reasoning_content=None):
        self.content = content
        self.reasoning_content = reasoning_content


class MockChunk:
    def __init__(self, delta):
        self.choices = [SimpleNamespace(delta=delta)]


def _make_provider():
    cfg = ProviderConfig(api_key="test-key", base_url="https://api.test.com/v1", model="mock-model", enabled=True)
    provider = OpenAICompatibleProvider(cfg, "mock")
    return provider


async def _collect(provider, chunks):
    """将模拟 chunk 流喂给 provider.chat_stream，收集 yield 出的字符串"""
    results = []

    async def fake_stream(*args, **kwargs):
        for c in chunks:
            yield c

    provider._client.chat.completions.create = mock.AsyncMock(side_effect=fake_stream)
    async for s in provider.chat_stream([{"role": "user", "content": "hi"}]):
        results.append(s)
    return results


def test_reasoning_content_forwarded_when_content_empty():
    """思考期（content 为空）reasoning_content 必须被转发为内容流"""
    provider = _make_provider()
    chunks = [
        MockChunk(MockDelta(reasoning_content="让我想想")),
        MockChunk(MockDelta(reasoning_content="需要调用工具")),
    ]
    results = asyncio.run(_collect(provider, chunks))
    assert results == ["让我想想", "需要调用工具"]


def test_reasoning_content_accumulated_to_last_reasoning_content():
    """reasoning_content 累计到 last_reasoning_content，供 agent 层持久化"""
    provider = _make_provider()
    chunks = [
        MockChunk(MockDelta(reasoning_content="思考A")),
        MockChunk(MockDelta(reasoning_content="思考B")),
    ]
    asyncio.run(_collect(provider, chunks))
    assert provider.last_reasoning_content == "思考A思考B"


def test_content_priority_when_both_present():
    """content 存在时正文优先转发（不重复输出已转发的思考内容）"""
    provider = _make_provider()
    chunks = [
        MockChunk(MockDelta(reasoning_content="思考过程")),
        MockChunk(MockDelta(content="最终答案")),
        MockChunk(MockDelta(content="，完毕")),
    ]
    results = asyncio.run(_collect(provider, chunks))
    assert results == ["思考过程", "最终答案", "，完毕"]
    assert provider.last_reasoning_content == "思考过程"


def test_content_only_stream_unchanged():
    """普通模型（无 reasoning_content）行为不变，仅转发正文"""
    provider = _make_provider()
    chunks = [
        MockChunk(MockDelta(content="你好")),
        MockChunk(MockDelta(content="，世界")),
    ]
    results = asyncio.run(_collect(provider, chunks))
    assert results == ["你好", "，世界"]
    assert provider.last_reasoning_content == ""
