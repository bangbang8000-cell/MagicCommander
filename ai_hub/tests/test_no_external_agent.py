"""4.3（测试计划 A-7）：无 Hermes / 外部 Agent 平台引入——代码审计（自动化）

审计目标：4.0 系列不引入 Hermes / 外部 Agent 平台依赖。
- ai_hub/requirements.txt 不包含 hermes 或外部 Agent 平台依赖
- ai_hub/ 代码无 `import hermes` / `from hermes`
- 顶层 package.json 依赖不含 hermes（hermes-parser 为 eslint 工具链依赖，非 Agent 平台，允许）

注：package-lock.json 中的 hermes-parser/hermes-estree 是 eslint 的 JS 解析器，
与外部 Agent 平台无关，不构成引入。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AI_HUB_DIR = os.path.join(ROOT, "ai_hub")

# 外部 Agent 平台/框架关键词（Hermes 及其同类外部编排平台）
BANNED_PLATFORMS = ["hermes", "harness"]


def _walk_py_files():
    for root, dirs, files in os.walk(AI_HUB_DIR):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__"]
        for f in files:
            if f.endswith(".py"):
                yield os.path.join(root, f)


def test_requirements_has_no_external_agent_platform():
    req_path = os.path.join(AI_HUB_DIR, "requirements.txt")
    with open(req_path, encoding="utf-8") as f:
        content = f.read().lower()
    for banned in BANNED_PLATFORMS:
        assert banned not in content, f"requirements.txt 不应包含外部 Agent 平台依赖: {banned}"


def test_ai_hub_code_has_no_hermes_import():
    self_path = os.path.abspath(__file__)
    for fpath in _walk_py_files():
        if os.path.abspath(fpath) == self_path:
            continue  # 审计文件自身 docstring 含关键词，跳过
        with open(fpath, encoding="utf-8", errors="ignore") as f:
            for i, line in enumerate(f, 1):
                stripped = line.strip().lower()
                if stripped.startswith(("import hermes", "from hermes")) or "import hermes" in stripped:
                    raise AssertionError(f"{fpath}:{i} 引入了 Hermes/外部 Agent 平台: {line.strip()}")


def test_top_level_package_json_has_no_hermes_dependency():
    pkg_path = os.path.join(ROOT, "package.json")
    with open(pkg_path, encoding="utf-8") as f:
        content = f.read().lower()
    # 顶层依赖键（dependencies/devDependencies）中不得有 hermes（工具链 hermes-parser 允许）
    import json
    pkg = json.loads(content)
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    for name in deps:
        assert "hermes" not in name.lower(), f"顶层依赖不应引入 hermes: {name}"
