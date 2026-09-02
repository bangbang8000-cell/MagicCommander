"""4.5.0（D-1）一致性校验引擎测试（F5-1）：参数表完整性 / 模板与参数一致性 / 配置字段校验。"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd

from validation.models import ValidationReport
from validation.consistency import validate_consistency, _is_valid_ipv4
from validation import validate_project


def _write_para(project_dir, rows):
    pd.DataFrame(rows).to_excel(
        os.path.join(project_dir, "para.xlsx"),
        sheet_name="project_para",
        index=False,
    )


def _write_hostname(project_dir, rows):
    os.makedirs(os.path.join(project_dir, "excel"), exist_ok=True)
    pd.DataFrame(rows).to_excel(
        os.path.join(project_dir, "excel", "hostname.xlsx"),
        sheet_name="主机表",
        index=False,
    )


def _write_template(project_dir, name, content):
    os.makedirs(os.path.join(project_dir, "templates"), exist_ok=True)
    with open(os.path.join(project_dir, "templates", name), "w", encoding="utf-8") as f:
        f.write(content)


def _healthy_project(project_dir):
    """最小健康项目：para 完整 + hostname 完整 + 角色模板存在。"""
    os.makedirs(os.path.join(project_dir, "excel"), exist_ok=True)
    os.makedirs(os.path.join(project_dir, "templates"), exist_ok=True)
    _write_para(project_dir, [
        {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
         "对称列数": 0, "key列数": 1},
    ])
    _write_hostname(project_dir, [
        {"设备名": "SW-01", "角色": "ASW", "管理IP": "192.168.1.1", "掩码": 24},
    ])
    _write_template(project_dir, "ASW.j2", 'hostname {{ info["设备名"] }}\n')


# ---- 结构契约 ----

def test_report_structure_has_localized_fields():
    """校验错误可读化：含中文 + 定位字段（D-1）。"""
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [])
        report = validate_consistency(tmp)
        assert isinstance(report, ValidationReport)
        assert report.scope == "consistency"
        assert "checks" in report.to_dict()
        assert "summary" in report.to_dict()
        if report.issues:
            issue = report.issues[0]
            assert issue.severity in ("error", "warning", "info")
            assert issue.category in ("para", "template", "output", "ip", "field", "ai")
            assert isinstance(issue.location, str)
            assert isinstance(issue.message, str)
            assert isinstance(issue.suggestion, str)


# ---- 参数表完整性 ----

def test_missing_para_xlsx_error():
    with tempfile.TemporaryDirectory() as tmp:
        report = validate_consistency(tmp)
        assert report.ok is False
        errs = [i for i in report.issues if i.severity == "error"]
        assert any("para.xlsx" in i.location and "缺少" in i.message for i in errs)


def test_missing_project_para_sheet_error():
    with tempfile.TemporaryDirectory() as tmp:
        pd.DataFrame({"项目名称": ["x"]}).to_excel(
            os.path.join(tmp, "para.xlsx"), sheet_name="项目名称", index=False)
        report = validate_consistency(tmp)
        assert any(i.severity == "error" and "project_para" in i.message for i in report.issues)


def test_missing_required_columns_error():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [{"工作簿名称": "hostname.xlsx"}])
        report = validate_consistency(tmp)
        assert any(i.severity == "error" and "缺少必填列" in i.message for i in report.issues)


def test_invalid_sheet_type_error():
    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, "excel"), exist_ok=True)
        pd.DataFrame({"设备名": ["SW-01"]}).to_excel(
            os.path.join(tmp, "excel", "hostname.xlsx"), sheet_name="主机表", index=False)
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "非法类型",
             "对称列数": 0, "key列数": 1},
        ])
        report = validate_consistency(tmp)
        assert any(i.severity == "error" and "工作表类型" in i.message for i in report.issues)


def test_missing_workbook_error():
    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, "excel"), exist_ok=True)
        _write_para(tmp, [
            {"工作簿名称": "missing.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        report = validate_consistency(tmp)
        assert any(i.severity == "error" and "不存在" in i.message for i in report.issues)


def test_missing_sheet_error():
    with tempfile.TemporaryDirectory() as tmp:
        _write_hostname(tmp, [{"设备名": "SW-01"}])
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "不存在的表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        report = validate_consistency(tmp)
        assert any(i.severity == "error" and "不存在或读取失败" in i.message for i in report.issues)


def test_empty_sheet_warning():
    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, "excel"), exist_ok=True)
        pd.DataFrame(columns=["设备名"]).to_excel(
            os.path.join(tmp, "excel", "hostname.xlsx"), sheet_name="主机表", index=False)
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        report = validate_consistency(tmp)
        assert any(i.severity == "warning" and "为空" in i.message for i in report.issues)


def test_missing_dirs_error():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [])
        report = validate_consistency(tmp)
        msgs = [i.message for i in report.issues]
        assert any("excel" in m for m in msgs)
        assert any("templates" in m for m in msgs)


# ---- 模板与参数一致性 ----

def test_missing_role_template_error():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        _write_hostname(tmp, [{"设备名": "SW-01", "角色": "CORE"}])
        os.makedirs(os.path.join(tmp, "templates"), exist_ok=True)
        report = validate_consistency(tmp)
        assert any(i.severity == "error" and "CORE" in i.message and "模板" in i.message
                   for i in report.issues)


def test_template_missing_field_ref_warning():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        _write_hostname(tmp, [{"设备名": "SW-01", "角色": "ASW"}])
        _write_template(tmp, "ASW.j2", '{{ info["不存在的字段"] }}')
        report = validate_consistency(tmp)
        assert any(i.severity == "warning" and "不存在的字段" in i.message for i in report.issues)


def test_template_syntax_error():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        _write_hostname(tmp, [{"设备名": "SW-01", "角色": "ASW"}])
        _write_template(tmp, "ASW.j2", "{% if %}")
        report = validate_consistency(tmp)
        assert any(i.severity == "error" and "语法错误" in i.message for i in report.issues)


# ---- 配置字段校验 ----

def test_invalid_mgmt_ip_error():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        _write_hostname(tmp, [{"设备名": "SW-01", "角色": "ASW", "管理IP": "999.1.1.1"}])
        os.makedirs(os.path.join(tmp, "templates"), exist_ok=True)
        report = validate_consistency(tmp)
        assert any(i.severity == "error" and "IPv4" in i.message for i in report.issues)


def test_duplicate_device_name_warning():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        _write_hostname(tmp, [
            {"设备名": "SW-01", "角色": "ASW"},
            {"设备名": "SW-01", "角色": "ASW"},
        ])
        os.makedirs(os.path.join(tmp, "templates"), exist_ok=True)
        report = validate_consistency(tmp)
        assert any(i.severity == "warning" and "重复" in i.message for i in report.issues)


def test_empty_key_field_warning():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        _write_hostname(tmp, [{"设备名": "", "角色": "ASW"}])
        os.makedirs(os.path.join(tmp, "templates"), exist_ok=True)
        report = validate_consistency(tmp)
        assert any(i.severity == "warning" and "设备名" in i.message and "为空" in i.message
                   for i in report.issues)


# ---- 健康项目通过 ----

def test_healthy_project_passes():
    with tempfile.TemporaryDirectory() as tmp:
        _healthy_project(tmp)
        report = validate_consistency(tmp)
        assert report.ok is True, [i.message for i in report.issues]


# ---- 统一入口 ----

def test_validate_project_all_runs_three_scopes():
    with tempfile.TemporaryDirectory() as tmp:
        _healthy_project(tmp)
        report = validate_project(tmp, "all")
        assert report.scope == "all"
        assert any("para" in c for c in report.checks)
        assert any("output" in c for c in report.checks)
        assert any("ip" in c for c in report.checks)
        # 无 IP 规划字段 → info（不阻断）
        assert report.ok is True


# ---- 工具函数 ----

def test_is_valid_ipv4():
    assert _is_valid_ipv4("192.168.1.1") is True
    assert _is_valid_ipv4("0.0.0.0") is True
    assert _is_valid_ipv4("255.255.255.255") is True
    assert _is_valid_ipv4("999.1.1.1") is False
    assert _is_valid_ipv4("192.168.1") is False
    assert _is_valid_ipv4("192.168.1.1.5") is False
    assert _is_valid_ipv4("") is False
    assert _is_valid_ipv4(None) is False
