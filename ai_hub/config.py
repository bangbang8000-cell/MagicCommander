"""
AI Hub 配置模块
管理服务器端口、Provider 配置、安全密钥、模型目录等
"""
import os
import json
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings

# ============================================================
# 模型目录 - 2026年7月最新
# ============================================================

PROVIDER_CATALOG = {
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com/v1",
        "models": ["deepseek-v4-pro", "deepseek-v4", "deepseek-chat"],
        "default_model": "deepseek-v4-pro",
    },
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-5", "gpt-5-mini", "gpt-4.1"],
        "default_model": "gpt-5-mini",
    },
    "claude": {
        "name": "Claude",
        "base_url": "https://api.anthropic.com/v1",
        "models": ["claude-opus-4", "claude-sonnet-4", "claude-haiku-4"],
        "default_model": "claude-sonnet-4",
    },
    "gemini": {
        "name": "Gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "models": ["gemini-3.5-pro", "gemini-3.5-flash"],
        "default_model": "gemini-3.5-pro",
    },
    "qwen": {
        "name": "Qwen",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "models": ["qwen3.7-max", "qwen3.7-plus"],
        "default_model": "qwen3.7-max",
    },
    "glm": {
        "name": "GLM",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "models": ["glm-5.2", "glm-5.1"],
        "default_model": "glm-5.2",
    },
    "grok": {
        "name": "Grok",
        "base_url": "https://api.x.ai/v1",
        "models": ["grok-4.5"],
        "default_model": "grok-4.5",
    },
    "ollama": {
        "name": "Ollama (本地)",
        "base_url": "http://localhost:11434/v1",
        "models": ["qwen3:latest", "llama4:latest", "deepseek-v4:latest"],
        "default_model": "qwen3:latest",
    },
    "custom": {
        "name": "自定义",
        "base_url": "",
        "models": [],
        "default_model": "",
    },
}


class ProviderConfig(BaseSettings):
    """单个 Provider 配置"""
    api_key: str = ""
    base_url: str = ""
    model: str = ""
    enabled: bool = False

    model_config = {"env_prefix": "", "extra": "allow"}


class AIHubSettings(BaseSettings):
    """AI Hub 全局配置"""
    # 服务器
    host: str = "127.0.0.1"
    port: int = 18721

    # Provider 配置 (动态字段，通过 secrets 文件加载)
    provider_configs: dict = {}

    # 默认 Provider
    default_provider: str = "deepseek"

    # 工作区路径（由 Electron 传入）
    workspace_dir: str = ""

    # 模板目录（由 Electron 传入）
    template_dir: str = ""

    model_config = {"env_prefix": "MC_AI_", "extra": "allow"}

    def get_provider_config(self, provider: str) -> ProviderConfig:
        """获取指定 Provider 的配置"""
        catalog = PROVIDER_CATALOG.get(provider)
        if not catalog:
            # 自定义 provider
            secrets = self.provider_configs.get(provider, {})
            return ProviderConfig(
                api_key=secrets.get("api_key", ""),
                base_url=secrets.get("base_url", ""),
                model=secrets.get("model", ""),
                enabled=bool(secrets.get("api_key", "")),
            )

        secrets = self.provider_configs.get(provider, {})
        api_key = secrets.get("api_key", "")
        base_url = secrets.get("base_url", "") or catalog["base_url"]
        model = secrets.get("model", "") or catalog["default_model"]
        enabled = bool(api_key) or provider == "ollama"

        return ProviderConfig(
            api_key=api_key,
            base_url=base_url,
            model=model,
            enabled=enabled,
        )

    def list_provider_info(self) -> list[dict]:
        """列出所有 Provider 信息（含模型目录）"""
        result = []
        for key, catalog in PROVIDER_CATALOG.items():
            config = self.get_provider_config(key)
            result.append({
                "key": key,
                "name": catalog["name"],
                "base_url": catalog["base_url"],
                "models": catalog["models"],
                "current_model": config.model,
                "enabled": config.enabled,
                "is_default": key == self.default_provider,
            })
        return result


# 全局配置实例
settings = AIHubSettings()


def get_secrets_path() -> Path:
    """获取密钥文件路径"""
    if settings.workspace_dir:
        return Path(settings.workspace_dir) / ".mc_ai_secrets.json"
    return Path.home() / ".magiccommander" / "ai_secrets.json"


def load_secrets() -> dict:
    """从文件加载密钥"""
    secrets_path = get_secrets_path()
    if secrets_path.exists():
        try:
            with open(secrets_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_secrets(secrets: dict) -> None:
    """保存密钥到文件"""
    secrets_path = get_secrets_path()
    secrets_path.parent.mkdir(parents=True, exist_ok=True)
    with open(secrets_path, "w", encoding="utf-8") as f:
        json.dump(secrets, f, indent=2)
    try:
        os.chmod(secrets_path, 0o600)
    except Exception:
        pass


def apply_secrets():
    """从文件加载密钥并应用到配置"""
    secrets = load_secrets()
    settings.provider_configs = {k: v for k, v in secrets.items() if k != "default_provider"}
    if "default_provider" in secrets:
        settings.default_provider = secrets["default_provider"]