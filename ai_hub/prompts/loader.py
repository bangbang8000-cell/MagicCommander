"""
Prompt 管理模块
从 ai_hub/prompts/ 目录加载场景化提示词，支持版本管理
"""
import os
from pathlib import Path
from typing import Optional

# Prompt 文件目录
PROMPTS_DIR = Path(__file__).parent

# 缓存
_cache: dict[str, str] = {}


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


def get_system_prompt(mode: Optional[str] = None) -> str:
    """获取完整的系统提示词（基础 + skill + 模式）"""
    base = load_prompt("system")
    tools = load_prompt("mc-tools")
    parts = [base, tools]
    if mode and mode in ("template", "config", "general"):
        mode_prompt = load_prompt(mode)
        if mode_prompt:
            parts.append(mode_prompt)
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