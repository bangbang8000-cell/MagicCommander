"""5.0.2-502-c：Hermes 并存接入审计（修订 4.3 A-7「无 Hermes/外部 Agent 平台」）

4.0 系列原「不引入 Hermes / 外部 Agent 平台（统一底座移 5.0）」在本版放宽为「Hermes 并存」：
- Hermes 必须经 AgentProvider 适配（ai_hub/agent/provider.py）注册并配置声明
  （config.py AI_ENGINE_MODES），未安装（importlib find_spec 失败）时不可用（友好提示），
  不真实 pip 安装（依赖清单不硬依赖）
- 其他外部 Agent 平台（harness/langchain/langgraph/crewai/autogen/...）仍为 BANNED
- 其余不变：AI Hub 仍用内置 LLM Provider（openai 兼容直连）

静态审计：
- 依赖清单（requirements*.txt / package.json）不包含任何被禁平台，且不硬依赖 hermes
- ai_hub 源码 hermes 相关 import 仅允许出现在 AgentProvider 适配器（provider.py）
- hermes 品牌标识仅允许出现在适配器/配置声明/引擎端点/测试中
"""
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # 仓库根（MagicCommander-Client）
AI_HUB_DIR = ROOT / "ai_hub"

# 外部 Agent 平台 / 编排框架黑名单（除 hermes 外全部保留拦截）
FORBIDDEN_DEPS = {
    "harness", "langchain", "langgraph", "crewai", "autogen", "ag2",
    "openai-agents", "agents-sdk", "semantic-kernel", "haystack", "llamaindex",
}

FORBIDDEN_IMPORT_PATTERNS = [
    r"^\s*(from|import)\s+harness",
    r"^\s*(from|import)\s+langchain",
    r"^\s*(from|import)\s+crewai",
    r"^\s*(from|import)\s+autogen",
]

# Hermes 适配/声明允许出现的文件（相对仓库根）
HERMES_ALLOWED_FILES = {
    "ai_hub/agent/provider.py",        # AgentProvider 适配器（探测 + 惰性 import）
    "ai_hub/agent/agent.py",           # 会话引擎命名空间隔离（502-b）
    "ai_hub/config.py",                # AI_ENGINE_MODES 配置声明
    "ai_hub/api/chat.py",              # /engine 端点 + 未安装提示
    "ai_hub/tests/test_no_external_agent.py",  # 本审计文件自身
    "ai_hub/tests/test_agent_provider.py",     # 502 新增测试
}


def _walk_py_files(base: Path):
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__"]
        for f in files:
            if f.endswith(".py"):
                yield Path(root) / f


def test_requirements_has_no_forbidden_agent_platform():
    """依赖清单：无被禁平台 + 不硬依赖 hermes（探测式加载，未装不可用）"""
    for req in (AI_HUB_DIR / "requirements.txt", AI_HUB_DIR / "requirements-dev.txt"):
        if not req.exists():
            continue
        text = req.read_text(encoding="utf-8").lower()
        for dep in FORBIDDEN_DEPS:
            assert dep not in text, f"依赖清单含被禁平台: {dep} in {req.name}"
        assert "hermes" not in text, f"依赖清单不应硬依赖 hermes（可选适配）：{req.name}"


def test_top_level_package_json_has_no_agent_platform():
    """顶层 package.json：无被禁平台 + 不声明 hermes 依赖（hermes-parser 为 eslint 工具链，允许）"""
    import json

    pkg_path = ROOT / "package.json"
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    for name in deps:
        lowered = name.lower()
        for dep in FORBIDDEN_DEPS:
            assert dep not in lowered, f"顶层依赖含被禁平台: {name}"
        # 工具链 hermes-parser/hermes-estree 允许（非 Agent 平台），其余含 hermes 的依赖拦截
        if "hermes" in lowered and "hermes-parser" not in lowered and "hermes-estree" not in lowered:
            raise AssertionError(f"顶层依赖不应声明 hermes（可选适配，非硬依赖）: {name}")


def test_ai_hub_code_has_no_forbidden_imports():
    """ai_hub 源码：无 harness/langchain/crewai/autogen 等被禁框架 import"""
    hits = []
    for py in sorted(_walk_py_files(AI_HUB_DIR)):
        for i, line in enumerate(py.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            for pat in FORBIDDEN_IMPORT_PATTERNS:
                if re.match(pat, line):
                    hits.append(f"{py.relative_to(ROOT)}:{i}: {line.strip()}")
    assert not hits, "发现被禁平台 import:\n" + "\n".join(hits)


def test_hermes_imports_only_in_provider_adapter():
    """Hermes import 仅允许在 AgentProvider 适配器（provider.py）中（探测确认后惰性加载）"""
    hits = []
    for py in sorted(_walk_py_files(AI_HUB_DIR)):
        rel = py.relative_to(ROOT).as_posix()
        if rel == "ai_hub/tests/test_no_external_agent.py":
            continue  # 审计文件自身 docstring 含关键词
        for i, line in enumerate(py.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            m = re.match(r"^\s*(?:from\s+(hermes|hermes_agent)|import\s+(hermes|hermes_agent))", line)
            if m and rel != "ai_hub/agent/provider.py":
                hits.append(f"{rel}:{i}: {line.strip()}")
    assert not hits, "Hermes import 必须在 provider.py 适配器内（AgentProvider 注册）:\n" + "\n".join(hits)


def test_hermes_registered_via_agent_provider():
    """Hermes 必须经 AgentProvider 注册且配置声明：provider.py 探测 + config.py 声明 + 引擎路由"""
    provider_file = AI_HUB_DIR / "agent" / "provider.py"
    config_file = AI_HUB_DIR / "config.py"
    text = provider_file.read_text(encoding="utf-8")
    # 探测式加载：importlib find_spec，不真实 pip 安装
    assert "importlib.util.find_spec" in text or "find_spec" in text
    assert "AgentNotAvailableError" in text
    assert "pip install hermes-agent" in text
    assert "get_engine" in text and "resolve_engine" in text
    # 配置声明：AI_ENGINE_MODES 含 hermes
    cfg = config_file.read_text(encoding="utf-8")
    assert "hermes" in cfg and "AI_ENGINE_MODES" in cfg


def test_hermes_brand_allowed_only_in_declared_files():
    """hermes 品牌标识仅允许出现在适配器/配置声明/引擎端点/测试中（其余 ai_hub 文件禁止）"""
    hits = []
    for f in sorted(AI_HUB_DIR.rglob("*")):
        if not f.is_file() or f.suffix not in (".py", ".md", ".json", ".toml", ".ini"):
            continue
        rel = f.relative_to(ROOT).as_posix()
        if rel in HERMES_ALLOWED_FILES:
            continue
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if re.search(r"\bhermes\b", line, re.IGNORECASE):
                hits.append(f"{rel}:{i}: {line.strip()[:80]}")
    assert not hits, "hermes 引用必须在声明文件内（AgentProvider 适配/配置/引擎端点）:\n" + "\n".join(hits)
