"""4.5.0（F5-4）AI 规划器准确性校验：AI 工具返回结果 ↔ 实际磁盘/状态一致性。

在 AI 工具（create_project / update_project / import_project / export_project /
create_project_intelligent / delete_project 等）执行后调用 verify_tool_result()，
核对其声称的结果是否与实际项目目录/文件/元数据一致，返回结构化问题列表
（与 backend/validation/models.py 的 issue 结构对齐：severity/类别/定位/建议）。

独立模块，不改动既有工具 handler（最小侵入）。
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# 与 backend/validation 对齐的 issue 结构
SEVERITY_ERROR = "error"
SEVERITY_WARNING = "warning"


def _issue(severity: str, location: str, message: str, suggestion: str = "") -> dict:
    return {
        "severity": severity,
        "category": "ai",
        "location": location,
        "message": message,
        "suggestion": suggestion,
    }


def _result_dict(result) -> dict:
    """将工具返回（str JSON 或 dict）归一为 dict；解析失败返回 {}。"""
    if isinstance(result, dict):
        return result
    if isinstance(result, str):
        try:
            return json.loads(result)
        except (ValueError, TypeError):
            return {}
    return {}


def _project_name(args: dict) -> str:
    return str(args.get("projectName") or "").strip()


def verify_tool_result(tool_name: str, args: dict, result, workspace: str = "") -> list:
    """校验单个工具执行结果与实际磁盘/状态一致性。

    参数:
        tool_name: 工具名（如 create_project / update_project / import_project …）
        args: 工具调用参数
        result: 工具返回（str JSON 或 dict）
        workspace: 工作区目录（缺省用 tools 模块已设置的 _workspace_dir）

    返回:
        issue 列表（空列表 = 一致）。每个 issue 为
        {severity, category:'ai', location, message, suggestion}。
    """
    if not workspace:
        try:
            from ai_hub.agent import tools as tools_mod
            workspace = tools_mod._workspace_dir or ""
        except Exception:
            workspace = ""
    ws = Path(workspace) if workspace else None
    data = _result_dict(result)
    name = _project_name(args)

    if tool_name in ("create_project", "create_from_template", "create_project_intelligent",
                     "import_project"):
        return _verify_created(tool_name, args, data, name, ws)
    if tool_name == "update_project":
        return _verify_updated(args, data, name, ws)
    if tool_name == "export_project":
        return _verify_exported(args, data, ws)
    if tool_name == "delete_project":
        return _verify_deleted(data, name, ws)
    if tool_name == "list_projects":
        return _verify_listed(data, ws)
    # 未知工具 → 不做校验
    return []


def _verify_created(tool_name: str, args: dict, data: dict, name: str, ws) -> list:
    """创建/导入类工具：声称 created/ok → 项目目录与关键结构真实存在。"""
    issues: list = []
    if not name:
        return issues
    claimed = data.get("status") in ("created", "ok", "success")
    if not claimed:
        # 工具自身已返回失败/存在，无需进一步核对
        return issues
    if ws is None:
        return issues
    project_dir = ws / name
    loc = f"workspace/{name}"
    if not project_dir.is_dir():
        issues.append(_issue(
            SEVERITY_ERROR, loc,
            f"工具 {tool_name} 声称已创建项目 '{name}'，但磁盘上不存在该目录",
            "检查工具写入是否被回滚，或重新执行创建"))
        return issues
    # 关键结构抽查：templates / excel / para.xlsx（创建类工具应具备）
    structure = data.get("structure") if isinstance(data.get("structure"), dict) else {}
    expected_dirs = structure.get("directories") if structure.get("directories") else None
    if isinstance(expected_dirs, list):
        for d in expected_dirs:
            if not (project_dir / d).is_dir():
                issues.append(_issue(
                    SEVERITY_WARNING, loc,
                    f"工具 {tool_name} 声称含目录 '{d}'，但磁盘上不存在",
                    "核对工具生成步骤是否完整"))
    templates = list(project_dir.glob("templates/*.j2")) if (project_dir / "templates").is_dir() else []
    if structure.get("templates") and not templates:
        issues.append(_issue(
            SEVERITY_WARNING, loc,
            f"工具 {tool_name} 声称生成模板，但 templates/ 下无 .j2 文件",
            "核对模板生成逻辑"))
    return issues


def _verify_updated(args: dict, data: dict, name: str, ws) -> list:
    """更新类工具：声称 ok → template.meta.json 实际存在且包含声称字段。"""
    issues: list = []
    if not name:
        return issues
    if data.get("status") != "ok":
        return issues
    if ws is None:
        return issues
    meta_path = ws / name / "template.meta.json"
    loc = f"workspace/{name}/template.meta.json"
    if not meta_path.is_file():
        issues.append(_issue(
            SEVERITY_ERROR, loc,
            f"工具 update_project 声称已更新元数据，但 {name}/template.meta.json 不存在",
            "重新执行更新或检查项目是否被删除"))
        return issues
    try:
        current = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        current = {}
    claimed = data.get("meta") if isinstance(data.get("meta"), dict) else {}
    if isinstance(args.get("meta"), dict):
        for k, v in args["meta"].items():
            if current.get(k) != v:
                issues.append(_issue(
                    SEVERITY_ERROR, loc,
                    f"元数据字段 '{k}' 与实际不符（声称 {v}，磁盘 {current.get(k)}）",
                    "重新同步元数据"))
    if claimed and current.get("description") != claimed.get("description"):
        pass
    return issues


def _verify_exported(args: dict, data: dict, ws) -> list:
    """导出类工具：声称 ok → zip 文件真实存在。"""
    issues: list = []
    if data.get("status") != "ok":
        return issues
    zip_path = data.get("zipPath")
    if not zip_path:
        return issues
    if not Path(zip_path).is_file():
        issues.append(_issue(
            SEVERITY_ERROR, str(zip_path),
            f"工具 export_project 声称已导出，但 zip 文件不存在: {zip_path}",
            "检查导出目录权限或重新导出"))
    return issues


def _verify_deleted(data: dict, name: str, ws) -> list:
    """删除类工具：声称成功 → 项目目录应不存在。"""
    issues: list = []
    if not name or ws is None:
        return issues
    # 无论 status 文本，只要目录还在且工具声称删除成功才报（缺省：目录已删 = 一致）
    if (ws / name).is_dir():
        issues.append(_issue(
            SEVERITY_WARNING, f"workspace/{name}",
            f"工具 delete_project 声称删除项目 '{name}'，但磁盘目录仍存在",
            "确认删除是否被取消，或手动清理残留目录"))
    return issues


def _verify_listed(data: dict, ws) -> list:
    """列表类工具：返回的项目名与磁盘目录一致。"""
    issues: list = []
    listed = data.get("data") if isinstance(data.get("data"), list) else []
    listed_names = set()
    for item in listed:
        if isinstance(item, dict) and item.get("name"):
            listed_names.add(str(item["name"]))
        elif isinstance(item, str):
            listed_names.add(item)
    if not listed_names or ws is None or not ws.is_dir():
        return issues
    disk_names = {p.name for p in ws.iterdir()
                  if p.is_dir() and not p.name.startswith(".") and p.name != "__pycache__"}
    missing = sorted(disk_names - listed_names)
    if missing:
        issues.append(_issue(
            SEVERITY_WARNING, "workspace/",
            f"list_projects 返回缺失项目: {', '.join(missing[:5])}",
            "核对项目登记表（MC_Para.xlsx）与工作区目录是否同步"))
    return issues


def summarize(issues: list) -> dict:
    """问题汇总（面板/报告用）：{total, errors, warnings}。"""
    total = len(issues)
    errors = sum(1 for i in issues if i.get("severity") == SEVERITY_ERROR)
    warnings = total - errors
    return {"total": total, "errors": errors, "warnings": warnings, "ok": errors == 0}
