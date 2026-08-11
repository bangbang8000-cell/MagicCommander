"""
LLM Provider 抽象层
支持 DeepSeek / OpenAI / Claude / Gemini / Qwen / GLM / Grok / Ollama / 自定义
所有 Provider 均通过 OpenAI 兼容接口统一适配
"""
import asyncio
import logging
from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional

from openai import AsyncOpenAI, Timeout

from ai_hub.config import settings, ProviderConfig, PROVIDER_CATALOG

logger = logging.getLogger(__name__)

# 重试配置：指数退避
MAX_RETRIES = 2
RETRY_BASE_DELAY = 1.0


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
        # Ollama 等本地服务无 API Key，使用占位 key；显式超时防止请求挂死
        self._client = AsyncOpenAI(
            api_key=config.api_key or "ollama",
            base_url=config.base_url,
            timeout=Timeout(connect=15.0, read=120.0, write=120.0, pool=30.0),
            max_retries=0,  # 由本层自行控制重试（指数退避）
        )
        self.last_reasoning_content: str = ""

    @property
    def provider_name(self) -> str:
        return self._name

    def _is_retryable(self, e: Exception) -> bool:
        """网络/超时/服务端错误可重试；认证等配置错误不重试。"""
        msg = str(e).lower()
        if any(k in msg for k in ("auth", "api key", "401", "403", "invalid")):
            return False
        return True

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

        last_error: Exception | None = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                stream = await self._client.chat.completions.create(
                    model=self._config.model,
                    messages=full_messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    stream=True,
                )
                self.last_reasoning_content = ""
                async for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta:
                        delta = chunk.choices[0].delta
                        # 收集 DeepSeek thinking mode 的 reasoning_content
                        if hasattr(delta, 'reasoning_content') and delta.reasoning_content:
                            self.last_reasoning_content += delta.reasoning_content
                        if delta.content:
                            yield delta.content
                return
            except Exception as e:
                last_error = e
                if attempt < MAX_RETRIES and self._is_retryable(e):
                    delay = RETRY_BASE_DELAY * (2 ** attempt)
                    logger.warning(f"[{self._name}] Stream 请求失败，{delay}s 后重试 ({attempt + 1}/{MAX_RETRIES}): {e}")
                    await asyncio.sleep(delay)
                else:
                    break

        logger.error(f"[{self._name}] Stream error: {last_error}")
        yield f"\n\n> 错误: {last_error}"

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

        last_error: Exception | None = None
        for attempt in range(MAX_RETRIES + 1):
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
                last_error = e
                if attempt < MAX_RETRIES and self._is_retryable(e):
                    delay = RETRY_BASE_DELAY * (2 ** attempt)
                    logger.warning(f"[{self._name}] Chat 请求失败，{delay}s 后重试 ({attempt + 1}/{MAX_RETRIES}): {e}")
                    await asyncio.sleep(delay)
                else:
                    break

        logger.error(f"[{self._name}] Chat error: {last_error}")
        return f"错误: {last_error}"


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
            # Ollama 本地服务无 API Key 也应注册（config 中 ollama 默认 enabled=True）
            if config.enabled and (config.api_key or key == "ollama"):
                provider = OpenAICompatibleProvider(config, key)
                registry.register(key, provider)
                logger.info(f"Provider '{key}' initialized (model: {config.model})")
            else:
                logger.info(f"Provider '{key}' skipped (not configured)")
        except Exception as e:
            logger.warning(f"Provider '{key}' init failed: {e}")