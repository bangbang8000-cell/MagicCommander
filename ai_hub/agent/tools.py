"""
Agent Tool 定义
将现有 Python CLI 功能包装为标准 Tool 接口，供 LLM 调用
"""
import json
import logging
import subprocess
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# 工具注册表
_tools: dict[str, dict] = {}


def register_tool(name: str, description: str, parameters: dict, handler: callable):
    """注册一个 Agent Tool"""
    _tools[name] = {
        "name": name,
        "description": description,
        "parameters": parameters,
        "handler": handler,
    }


def get_tool_definitions() -> list[dict]:
    """获取所有工具定义（JSON Schema 格式），供 LLM function calling 使用"""
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            },
        }
        for t in _tools.values()
    ]


async def execute_tool(name: str, arguments: dict) -> dict:
    """执行指定工具"""
    tool = _tools.get(name)
    if not tool:
        return {"success": False, "error": f"未知工具: {name}"}
    try:
        result = await tool["handler"](arguments)
        return {"success": True, "result": result}
    except Exception as e:
        logger.error(f"Tool '{name}' execution failed: {e}")
        return {"success": False, "error": str(e)}


def _run_python_cli(args: list[str]) -> str:
    """运行 Python CLI 命令并返回输出"""
    workspace = _workspace_dir or ""
    backend_dir = _backend_dir or str(Path(__file__).parent.parent.parent / "backend")

    env = {}
    if workspace:
        env["MC_WORKSPACE"] = workspace

    try:
        result = subprocess.run(
            [sys.executable, str(Path(backend_dir) / "main.py")] + args,
            capture_output=True,
            text=True,
            timeout=120,
            cwd=backend_dir,
            env={**__import__("os").environ, **env},
        )
        return result.stdout.strip() or result.stderr.strip()
    except subprocess.TimeoutExpired:
        return "命令执行超时"
    except Exception as e:
        return f"命令执行失败: {e}"


_workspace_dir = ""
_backend_dir = ""


def set_workspace_dir(path: str):
    global _workspace_dir
    _workspace_dir = path


def set_backend_dir(path: str):
    global _backend_dir
    _backend_dir = path


# ====== 注册所有工具 ======


async def _list_projects(args: dict) -> str:
    return _run_python_cli(["project", "list"])


async def _create_project(args: dict) -> str:
    project_name = args["projectName"]
    cmd = ["project", "create", project_name]
    if args.get("templateName"):
        cmd.extend(["--template", args["templateName"]])
    return _run_python_cli(cmd)


async def _render_config(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["render", "project", project_name])


async def _dry_run(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["render", "dry-run", project_name])


async def _validate_template(args: dict) -> str:
    template_name = args["templateName"]
    return _run_python_cli(["validate", "template", template_name])


async def _validate_excel(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["validate", "excel", project_name])


async def _diff_compare(args: dict) -> str:
    project_name = args["projectName"]
    return _run_python_cli(["diff", "compare", project_name])


async def _read_file(args: dict) -> str:
    project_name = args["projectName"]
    file_path = args["filePath"]
    return _run_python_cli(["file", "read", project_name, file_path])


async def _search_files(args: dict) -> str:
    query = args["query"]
    cmd = ["search", query]
    if args.get("projectName"):
        cmd.extend(["--project", args["projectName"]])
    return _run_python_cli(cmd)


async def _create_template(args: dict) -> str:
    source = args["sourceProject"]
    name = args["templateName"]
    return _run_python_cli(["template", "save", source, name])


async def _update_template(args: dict) -> str:
    name = args["templateName"]
    file_path = args["filePath"]
    content = args["content"]
    return _run_python_cli(["template", "update", name, file_path, content])


def init_tools():
    """初始化所有 Agent Tools"""
    register_tool(
        "list_projects",
        "列出所有项目及其结构",
        {
            "type": "object",
            "properties": {},
            "required": [],
        },
        _list_projects,
    )

    register_tool(
        "create_project",
        "创建新的配置项目，指定项目名称和可选的模板来源",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
                "templateName": {"type": "string", "description": "模板名称（可选）"},
            },
            "required": ["projectName"],
        },
        _create_project,
    )

    register_tool(
        "create_template",
        "将现有项目保存为可复用模板",
        {
            "type": "object",
            "properties": {
                "sourceProject": {"type": "string", "description": "源项目名称"},
                "templateName": {"type": "string", "description": "新模板名称"},
            },
            "required": ["sourceProject", "templateName"],
        },
        _create_template,
    )

    register_tool(
        "update_template",
        "修改模板文件内容",
        {
            "type": "object",
            "properties": {
                "templateName": {"type": "string", "description": "模板名称"},
                "filePath": {"type": "string", "description": "文件相对路径"},
                "content": {"type": "string", "description": "新内容"},
            },
            "required": ["templateName", "filePath", "content"],
        },
        _update_template,
    )

    register_tool(
        "render_config",
        "执行配置渲染，生成设备配置文件",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _render_config,
    )

    register_tool(
        "dry_run",
        "预演渲染，预览结果但不写入文件",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _dry_run,
    )

    register_tool(
        "validate_template",
        "校验 Jinja2 模板语法",
        {
            "type": "object",
            "properties": {
                "templateName": {"type": "string", "description": "模板名称"},
            },
            "required": ["templateName"],
        },
        _validate_template,
    )

    register_tool(
        "validate_excel",
        "校验 Excel 参数文件",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _validate_excel,
    )

    register_tool(
        "diff_compare",
        "对比渲染结果与已有输出差异",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
            },
            "required": ["projectName"],
        },
        _diff_compare,
    )

    register_tool(
        "read_file",
        "读取项目中的文件内容",
        {
            "type": "object",
            "properties": {
                "projectName": {"type": "string", "description": "项目名称"},
                "filePath": {"type": "string", "description": "文件相对路径"},
            },
            "required": ["projectName", "filePath"],
        },
        _read_file,
    )

    register_tool(
        "search_files",
        "按名称或内容搜索项目文件",
        {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "搜索关键词"},
                "projectName": {"type": "string", "description": "限定项目（可选）"},
            },
            "required": ["query"],
        },
        _search_files,
    )

    logger.info(f"Initialized {len(_tools)} Agent tools")