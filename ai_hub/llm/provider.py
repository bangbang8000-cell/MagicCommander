"""
LLM Provider 抽象层
支持 DeepSeek / OpenAI / Claude / Gemini / Qwen / GLM / Grok / Ollama / 自定义
所有 Provider 均通过 OpenAI 兼容接口统一适配
"""
import logging
from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional

from openai import AsyncOpenAI

from ai_hub.config import settings, ProviderConfig, PROVIDER_CATALOG

logger = logging.getLogger(__name__)


class LLMProvider(ABC):
    """LLM Provider 抽象基类"""

    @abstractmethod
    async def chat_stream(
        self,
        messages: list[dict],
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        ...

    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> str:
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        ...


class OpenAICompatibleProvider(LLMProvider):
    """OpenAI 兼容接口通用 Provider"""

    def __init__(self, config: ProviderConfig, name: str):
        self._config = config
        self._name = name
        self._client = AsyncOpenAI(
            api_key=config.api_key,
            base_url=config.base_url,
        )

    @property
    def provider_name(self) -> str:
        return self._name

    async def chat_stream(
        self,
        messages: list[dict],
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        try:
            stream = await self._client.chat.completions.create(
                model=self._config.model,
                messages=full_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            logger.error(f"[{self._name}] Stream error: {e}")
            yield f"\n\n> 错误: {str(e)}"

    async def chat(
        self,
        messages: list[dict],
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> str:
        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        try:
            response = await self._client.chat.completions.create(
                model=self._config.model,
                messages=full_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=False,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"[{self._name}] Chat error: {e}")
            return f"错误: {str(e)}"


class ProviderRegistry:
    """Provider 注册表"""

    def __init__(self):
        self._providers: dict[str, LLMProvider] = {}

    def register(self, name: str, provider: LLMProvider):
        self._providers[name] = provider

    def get(self, name: Optional[str] = None) -> Optional[LLMProvider]:
        name = name or settings.default_provider
        return self._providers.get(name)

    def get_default(self) -> Optional[LLMProvider]:
        return self.get(settings.default_provider)

    def list_providers(self) -> list[dict]:
        result = []
        for key, catalog in PROVIDER_CATALOG.items():
            config = settings.get_provider_config(key)
            result.append({
                "key": key,
                "name": catalog["name"],
                "model": config.model,
                "models": catalog["models"],
                "enabled": config.enabled,
                "is_default": key == settings.default_provider,
            })
        return result


# 全局 Provider 注册表
registry = ProviderRegistry()


def init_providers():
    """初始化所有可用的 Provider"""
    for key in PROVIDER_CATALOG:
        try:
            config = settings.get_provider_config(key)
            if config.enabled and config.api_key:
                provider = OpenAICompatibleProvider(config, key)
                registry.register(key, provider)
                logger.info(f"Provider '{key}' initialized (model: {config.model})")
            else:
                logger.info(f"Provider '{key}' skipped (not configured)")
        except Exception as e:
            logger.warning(f"Provider '{key}' init failed: {e}")