"""AI Hub /api/chat/config 契约测试：MC-401 更换 API key 后仍用旧 key

覆盖维度（PRD v3.2 M1 / MC-401）：
- 带 models 字段 POST /api/chat/config → 200 且新 key 落盘、registry 刷新（不再 500 静默失败）
- 不带 models 字段 → 仍 200（向后兼容，M2 模型列表持久化回写为可选字段）
- init_providers 先清空 registry：清 key 后旧实例不再残留（T4 防御）
"""
import json
import os
import sys
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.api.chat import router as chat_router
from ai_hub.config import settings
from ai_hub.llm.provider import registry, init_providers


class FakeProvider:
    """用于预置 registry 旧实例的替身，验证 init_providers 是否真正替换/清空"""

    def __init__(self, api_key="stale-key"):
        self._config = SimpleNamespace(api_key=api_key, model="", base_url="", enabled=True)
        self.provider_name = "fake"


@pytest.fixture
def isolated_hub(tmp_path, monkeypatch):
    """隔离 secrets 落盘目录并重置全局 registry/provider_configs，测试结束后还原"""
    saved_configs = settings.provider_configs
    saved_default = settings.default_provider
    saved_workspace = settings.workspace_dir
    saved_providers = registry._providers
    monkeypatch.setattr(settings, "workspace_dir", str(tmp_path))
    settings.provider_configs = {}
    settings.default_provider = "deepseek"
    registry._providers = {}
    yield tmp_path
    settings.provider_configs = saved_configs
    settings.default_provider = saved_default
    settings.workspace_dir = saved_workspace
    registry._providers = saved_providers


def _build_app() -> FastAPI:
    app = FastAPI(title="Test AI Hub")
    app.include_router(chat_router)
    return app


def _read_secrets(tmp_path) -> dict:
    path = tmp_path / ".mc_ai_secrets.json"
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def test_config_with_models_returns_200_and_persists_new_key(isolated_hub):
    """带 models 字段 → 200（不再 500），新 key 落盘、registry 刷新为最新实例（MC-401 主修）"""
    tmp_path = isolated_hub
    # 预置旧实例（模拟启动时用旧 key 注册的 provider），验证 config 后实例被刷新替换
    registry._providers["deepseek"] = FakeProvider("old-key")
    registry._providers["openai"] = FakeProvider("stale-openai")

    app = _build_app()
    with TestClient(app) as client:
        r = client.post(
            "/api/chat/config",
            json={
                "provider": "deepseek",
                "api_key": "new-key-abc",
                "model": "deepseek-chat",
                "base_url": "https://api.deepseek.com/v1",
                "models": ["deepseek-chat", "deepseek-reasoner"],
            },
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"status": "ok", "provider": "deepseek"}

    # 1) 新 key 已落盘（含 models 持久化回写）
    secrets = _read_secrets(tmp_path)
    assert secrets["deepseek"]["api_key"] == "new-key-abc"
    assert secrets["deepseek"]["models"] == ["deepseek-chat", "deepseek-reasoner"]

    # 2) registry 已刷新：deepseek 实例为新的 OpenAICompatibleProvider，携带新 key（非旧实例残留）
    provider = registry._providers["deepseek"]
    assert not isinstance(provider, FakeProvider)
    assert provider._config.api_key == "new-key-abc"

    # 3) 未配置 key 的 provider 不再残留旧实例（T4：init_providers 先清空 registry）
    assert "openai" not in registry._providers


def test_config_without_models_backward_compatible(isolated_hub):
    """不带 models 字段 → 仍 200 且新 key 落盘（M2 models 字段为可选，向后兼容）"""
    tmp_path = isolated_hub
    app = _build_app()
    with TestClient(app) as client:
        r = client.post(
            "/api/chat/config",
            json={
                "provider": "deepseek",
                "api_key": "new-key-without-models",
                "model": "deepseek-chat",
                "base_url": "https://api.deepseek.com/v1",
            },
        )
        assert r.status_code == 200, r.text

    secrets = _read_secrets(tmp_path)
    assert secrets["deepseek"]["api_key"] == "new-key-without-models"
    # 未传 models 时不应持久化 models 字段（保留原值语义）
    assert "models" not in secrets["deepseek"]


def test_init_providers_clears_stale_registry_entries(isolated_hub):
    """T4：init_providers 先清空 registry，未配置 key 的 provider 旧实例不残留"""
    settings.provider_configs = {
        "deepseek": {
            "api_key": "new-key-abc",
            "base_url": "https://api.deepseek.com/v1",
            "model": "deepseek-chat",
        },
    }
    # 预置旧实例（含已清 key 的 provider，如 openai）
    registry._providers["deepseek"] = FakeProvider("old-key")
    registry._providers["openai"] = FakeProvider("stale-openai")
    registry._providers["grok"] = FakeProvider("stale-grok")

    init_providers()

    # deepseek 被刷新为新实例（新 key）
    provider = registry._providers["deepseek"]
    assert not isinstance(provider, FakeProvider)
    assert provider._config.api_key == "new-key-abc"
    # openai/grok 未配置 key → 从 registry 中清除，不残留旧实例
    assert "openai" not in registry._providers
    assert "grok" not in registry._providers
