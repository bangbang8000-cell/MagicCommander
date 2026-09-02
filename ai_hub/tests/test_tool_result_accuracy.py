"""4.5.0（D-4）AI 规划器准确性校验测试（F5-4）：工具返回结果 ↔ 实际磁盘/状态一致性。

覆盖 create_project / create_from_template / create_project_intelligent /
update_project / import_project / export_project / delete_project / list_projects。
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.agent.accuracy import verify_tool_result, summarize


def _mk_project(workspace, name, with_meta=False, meta=None):
    project_dir = Path(workspace) / name
    (project_dir / "templates").mkdir(parents=True, exist_ok=True)
    (project_dir / "excel").mkdir(parents=True, exist_ok=True)
    (project_dir / "templates" / "ASW.j2").write_text("x", encoding="utf-8")
    (project_dir / "excel" / "hostname.xlsx").write_bytes(b"")
    if with_meta:
        (project_dir / "template.meta.json").write_text(
            json.dumps(meta or {}, ensure_ascii=False), encoding="utf-8")
    return project_dir


def _created_result(status="created", structure=None):
    return json.dumps({"status": status, "projectName": "p1",
                       "structure": structure or {"directories": ["templates", "excel"]}})


# ---- create_project 准确性 ----

def test_create_project_claimed_but_missing_dir_error(tmp_path):
    issues = verify_tool_result("create_project", {"projectName": "ghost"},
                                _created_result(), str(tmp_path))
    assert len(issues) >= 1
    assert issues[0]["severity"] == "error"
    assert "不存在" in issues[0]["message"]
    assert issues[0]["category"] == "ai"


def test_create_project_matches_disk_no_issue(tmp_path):
    _mk_project(tmp_path, "p1")
    issues = verify_tool_result("create_project", {"projectName": "p1"},
                                _created_result(), str(tmp_path))
    assert issues == []


def test_create_project_claimed_structure_missing_warning(tmp_path):
    _mk_project(tmp_path, "p1")
    # 声称有 output-label 目录，但磁盘没有 → warning
    result = _created_result(status="created",
                             structure={"directories": ["templates", "excel", "output-label"]})
    issues = verify_tool_result("create_project", {"projectName": "p1"}, result, str(tmp_path))
    assert any(i["severity"] == "warning" and "output-label" in i["message"] for i in issues)


def test_create_project_claimed_templates_missing_warning(tmp_path):
    project_dir = Path(tmp_path) / "p1"
    (project_dir / "excel").mkdir(parents=True, exist_ok=True)
    result = _created_result(status="created",
                             structure={"templates": ["ASW.j2"], "directories": ["excel"]})
    issues = verify_tool_result("create_project_intelligent", {"projectName": "p1"},
                                result, str(tmp_path))
    assert any(i["severity"] == "warning" and "无 .j2 文件" in i["message"] for i in issues)


def test_create_project_failed_result_skips_check(tmp_path):
    # 工具返回失败 → 不核对（避免对失败结果误报）
    issues = verify_tool_result("create_project", {"projectName": "p1"},
                                '{"status":"exists","error":"已存在"}', str(tmp_path))
    assert issues == []


# ---- update_project 准确性 ----

def test_update_project_claimed_but_no_meta_file_error(tmp_path):
    _mk_project(tmp_path, "p1", with_meta=False)
    issues = verify_tool_result(
        "update_project",
        {"projectName": "p1", "description": "new desc"},
        '{"status":"ok","projectName":"p1"}',
        str(tmp_path))
    assert any(i["severity"] == "error" and "template.meta.json" in i["message"]
               for i in issues)


def test_update_project_meta_matches_disk_no_issue(tmp_path):
    _mk_project(tmp_path, "p1", with_meta=True, meta={"deviceType": "switch"})
    issues = verify_tool_result(
        "update_project",
        {"projectName": "p1", "meta": {"deviceType": "switch"}},
        '{"status":"ok","projectName":"p1","meta":{"deviceType":"switch"}}',
        str(tmp_path))
    assert issues == []


def test_update_project_meta_drift_error(tmp_path):
    _mk_project(tmp_path, "p1", with_meta=True, meta={"deviceType": "switch"})
    issues = verify_tool_result(
        "update_project",
        {"projectName": "p1", "meta": {"deviceType": "router"}},
        '{"status":"ok","projectName":"p1","meta":{"deviceType":"router"}}',
        str(tmp_path))
    assert any(i["severity"] == "error" and "deviceType" in i["message"] for i in issues)


# ---- import_project / export_project ----

def test_import_project_claimed_but_missing_error(tmp_path):
    issues = verify_tool_result("import_project",
                                {"projectName": "imp", "zipPath": "x.zip"},
                                '{"status":"ok","projectName":"imp"}', str(tmp_path))
    assert any(i["severity"] == "error" and "不存在" in i["message"] for i in issues)


def test_import_project_matches_no_issue(tmp_path):
    _mk_project(tmp_path, "imp")
    issues = verify_tool_result("import_project",
                                {"projectName": "imp", "zipPath": "x.zip"},
                                '{"status":"ok","projectName":"imp"}', str(tmp_path))
    assert issues == []


def test_export_project_zip_exists_no_issue(tmp_path):
    zip_path = Path(tmp_path) / "_exports" / "p1.zip"
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    zip_path.write_bytes(b"zip")
    issues = verify_tool_result("export_project", {"projectName": "p1"},
                                f'{{"status":"ok","projectName":"p1","zipPath":"{zip_path}"}}',
                                str(tmp_path))
    assert issues == []


def test_export_project_zip_missing_error(tmp_path):
    missing = Path(tmp_path) / "_exports" / "gone.zip"
    result = json.dumps({"status": "ok", "projectName": "p1", "zipPath": str(missing)})
    issues = verify_tool_result("export_project", {"projectName": "p1"}, result, str(tmp_path))
    assert any(i["severity"] == "error" and "zip 文件不存在" in i["message"] for i in issues)


# ---- delete_project / list_projects ----

def test_delete_project_still_exists_warning(tmp_path):
    _mk_project(tmp_path, "p1")
    issues = verify_tool_result("delete_project", {"projectName": "p1"},
                                '{"status":"ok"}', str(tmp_path))
    assert any(i["severity"] == "warning" and "仍存在" in i["message"] for i in issues)


def test_delete_project_removed_no_issue(tmp_path):
    issues = verify_tool_result("delete_project", {"projectName": "gone"},
                                '{"status":"ok"}', str(tmp_path))
    assert issues == []


def test_list_projects_missing_disk_project_warning(tmp_path):
    _mk_project(tmp_path, "real1")
    _mk_project(tmp_path, "real2")
    # 列表只返回 real1 → real2 缺失
    result = json.dumps({"status": "success", "data": [{"name": "real1"}]}, ensure_ascii=False)
    issues = verify_tool_result("list_projects", {}, result, str(tmp_path))
    assert any(i["severity"] == "warning" and "real2" in i["message"] for i in issues)


def test_list_projects_consistent_no_issue(tmp_path):
    _mk_project(tmp_path, "real1")
    result = json.dumps({"status": "success", "data": [{"name": "real1"}]}, ensure_ascii=False)
    issues = verify_tool_result("list_projects", {}, result, str(tmp_path))
    assert issues == []


def test_unknown_tool_skipped():
    issues = verify_tool_result("no_such_tool", {}, "{}", "/tmp")
    assert issues == []


# ---- 汇总 ----

def test_summarize_counts():
    issues = [
        {"severity": "error", "category": "ai", "location": "a", "message": "m", "suggestion": ""},
        {"severity": "warning", "category": "ai", "location": "b", "message": "m", "suggestion": ""},
    ]
    s = summarize(issues)
    assert s["total"] == 2
    assert s["errors"] == 1
    assert s["warnings"] == 1
    assert s["ok"] is False
