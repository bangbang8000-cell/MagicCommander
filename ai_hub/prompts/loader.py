"""
Prompt 管理模块
从 ai_hub/prompts/ 目录加载场景化提示词，支持版本管理
"""
import logging
import os
from pathlib import Path
from typing import Optional

# Prompt 文件目录
PROMPTS_DIR = Path(__file__).parent

logger = logging.getLogger(__name__)

# 缓存
_cache: dict[str, str] = {}

# M7d: system prompt 版本（记忆等动态上下文变更时失效，会话内据此刷新）
_cache_version = 0


def invalidate_system_prompt_cache() -> None:
    """使会话内 system prompt 失效（记忆/技能等动态上下文变更时调用）"""
    global _cache_version
    _cache_version += 1


def get_system_prompt_version() -> int:
    return _cache_version


def load_prompt(name: str) -> str:
    """加载指定名称的 prompt 文件"""
    if name in _cache:
        return _cache[name]

    file_path = PROMPTS_DIR / f"{name}.md"
    if file_path.exists():
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
            _cache[name] = content
            return content
        except Exception:
            pass

    # 返回默认提示词
    return _get_default_prompt(name)


def get_knowledge_prompt(
    query: str = "",
    project_name: str = "",
    top_k: int | None = None,
    ids: Optional[list[str]] = None,
) -> str:
    """5.0.5-505-c：知识库上下文段——按项目名+会话相关关键词检索 Top-K 拼接。

    由 get_system_prompt / AgentSession.run_stream 在组装系统提示词时调用；
    知识库为空或检索无命中时返回空串（不注入噪音）。异常不阻断主流程。
    """
    try:
        from ai_hub.knowledge.engine import get_knowledge_engine
        return get_knowledge_engine().get_knowledge_prompt(
            query=query or "",
            project_name=project_name or "",
            top_k=top_k,
            ids=ids or None,
        )
    except Exception as e:
        logger.warning(f"Failed to build knowledge prompt: {e}")
        return ""


def get_system_prompt(
    mode: Optional[str] = None,
    project_name: str = "",
    query: str = "",
    knowledge: bool = True,
) -> str:
    """获取完整的系统提示词（基础 + planner + skill + tools + mode + context + memory + knowledge）"""
    base = load_prompt("system")
    tools = load_prompt("mc-tools")

    from ai_hub.agent.planner import get_planner_prompt
    planner = get_planner_prompt()

    from ai_hub.skills.engine import get_skills_engine
    skills_prompt = get_skills_engine().get_skills_prompt()

    parts = [base, planner, tools, skills_prompt]

    if mode and mode in ("template", "config", "general"):
        mode_prompt = load_prompt(mode)
        if mode_prompt:
            parts.append(mode_prompt)

    if project_name:
        from ai_hub.agent.context import get_project_context
        ctx = get_project_context("")
        if ctx.project_name:
            parts.append(ctx.get_prompt_context())

    from ai_hub.memory.engine import get_memory_engine
    memory_prompt = get_memory_engine().get_memory_prompt(project_name)
    if memory_prompt:
        parts.append(memory_prompt)

    # 5.0.5-505-c：知识库上下文注入（开关默认开；按项目名+查询关键词检索 Top-K）
    if knowledge:
        knowledge_prompt = get_knowledge_prompt(query=query, project_name=project_name)
        if knowledge_prompt:
            parts.append(knowledge_prompt)

    return "\n\n".join(parts)


def reload_prompts():
    """重新加载所有 prompt（用于热更新）"""
    _cache.clear()


def _get_default_prompt(name: str) -> str:
    """获取默认提示词"""
    defaults = {
        "system": "你是 MagicCommander 的 AI 助手，专门帮助用户管理网络设备配置。使用中文回复。",
        "template": "当前处于模板帮助模式。请重点帮助用户创建、修改和校验模板。",
        "config": "当前处于配置问答模式。请重点帮助用户创建项目、渲染配置和对比差异。",
        "general": "当前处于通用助手模式。请自由回答用户的问题。",
    }
    return defaults.get(name, "")