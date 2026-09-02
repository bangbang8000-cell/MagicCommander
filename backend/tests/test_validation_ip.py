"""4.5.0（D-3）IP 规划校验测试（F5-3）：子网重叠 / 网关冲突 / 分配越界与重复 / 掩码合法性。"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd

from validation.ip_validate import (
    ip_to_int, parse_prefix, cidr_to_range, subnets_overlap, ip_in_subnet,
    is_valid_ipv4, check_ip_entries, check_subnet_conflicts, validate_ip,
)
from validation.models import ValidationReport, ValidationIssue


def _write_para(project_dir, rows):
    pd.DataFrame(rows).to_excel(
        os.path.join(project_dir, "para.xlsx"),
        sheet_name="project_para",
        index=False,
    )


def _write_ipaddress(project_dir, rows):
    os.makedirs(os.path.join(project_dir, "excel"), exist_ok=True)
    pd.DataFrame(rows).to_excel(
        os.path.join(project_dir, "excel", "ipaddress.xlsx"),
        sheet_name="网关地址表",
        index=False,
    )


# ---- 纯工具函数 ----

def test_ip_to_int():
    assert ip_to_int("0.0.0.0") == 0
    assert ip_to_int("255.255.255.255") == 4294967295
    assert ip_to_int("192.168.1.1") == 3232235777


def test_parse_prefix():
    assert parse_prefix("24") == 24
    assert parse_prefix(24) == 24
    assert parse_prefix("255.255.255.0") == 24
    assert parse_prefix("32") == 32
    assert parse_prefix("0") == 0
    try:
        parse_prefix("33")
        assert False, "应抛异常"
    except ValueError:
        pass
    try:
        parse_prefix("")
        assert False, "应抛异常"
    except ValueError:
        pass


def test_cidr_to_range():
    lo, hi = cidr_to_range("192.168.1.0", 24)
    assert lo == ip_to_int("192.168.1.0")
    assert hi == ip_to_int("192.168.1.255")


def test_subnets_overlap():
    assert subnets_overlap("192.168.1.0", 24, "192.168.1.128", 25) is True
    assert subnets_overlap("192.168.1.0", 24, "192.168.2.0", 24) is False
    assert subnets_overlap("10.0.0.0", 8, "10.1.0.0", 16) is True


def test_ip_in_subnet():
    assert ip_in_subnet("192.168.1.10", "192.168.1.0", 24) is True
    assert ip_in_subnet("192.168.2.10", "192.168.1.0", 24) is False


def test_is_valid_ipv4_import():
    assert is_valid_ipv4("192.168.1.1") is True
    assert is_valid_ipv4("10.0.0.0") is True
    assert is_valid_ipv4("999.1.1.1") is False


# ---- 问题明细（纯函数） ----

def test_invalid_mask_issue():
    entries = [{"location": "excel/ipaddress.xlsx/网关地址表/第2行",
                "ip": "192.168.1.1", "prefix": 33}]
    report = ValidationReport(project="p", scope="ip")
    check_ip_entries(entries, report)
    assert any(i.severity == "error" and "掩码非法" in i.message for i in report.issues)


def test_duplicate_ip_issue():
    entries = [
        {"location": "a", "ip": "192.168.1.1", "prefix": 24},
        {"location": "b", "ip": "192.168.1.1", "prefix": 24},
    ]
    report = ValidationReport(project="p", scope="ip")
    check_ip_entries(entries, report)
    errs = [i for i in report.issues if i.severity == "error"]
    assert any("重复分配" in i.message and "192.168.1.1" in i.message for i in errs)


def test_subnet_overlap_issue():
    subnets = [
        {"location": "a", "network": "192.168.1.0", "prefix": 24},
        {"location": "b", "network": "192.168.1.0", "prefix": 25},
    ]
    report = ValidationReport(project="p", scope="ip")
    check_subnet_conflicts(subnets, report)
    assert any(i.severity == "error" and "子网重叠" in i.message for i in report.issues)


def test_subnets_no_overlap_no_issue():
    subnets = [
        {"location": "a", "network": "192.168.1.0", "prefix": 24},
        {"location": "b", "network": "192.168.2.0", "prefix": 24},
    ]
    report = ValidationReport(project="p", scope="ip")
    check_subnet_conflicts(subnets, report)
    assert report.ok is True


# ---- 项目级校验（从参数表读取） ----

def test_project_ip_validate_reads_para():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "ipaddress.xlsx", "工作表名称": "网关地址表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 2},
        ])
        _write_ipaddress(tmp, [
            {"己端设备": "SW-01", "网关IP": "192.168.1.1", "网关掩码": 24},
            {"己端设备": "SW-02", "网关IP": "192.168.1.1", "网关掩码": 24},
        ])
        report = validate_ip(tmp)
        assert isinstance(report, ValidationReport)
        assert report.scope == "ip"
        assert any(i.severity == "error" and "重复分配" in i.message for i in report.issues)


def test_project_ip_invalid_mask():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "ipaddress.xlsx", "工作表名称": "网关地址表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 2},
        ])
        _write_ipaddress(tmp, [
            {"己端设备": "SW-01", "网关IP": "192.168.1.1", "网关掩码": 40},
        ])
        report = validate_ip(tmp)
        assert any(i.severity == "error" and "掩码非法" in i.message for i in report.issues)


def test_project_no_ip_fields_info():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        os.makedirs(os.path.join(tmp, "excel"), exist_ok=True)
        pd.DataFrame({"设备名": ["SW-01"]}).to_excel(
            os.path.join(tmp, "excel", "hostname.xlsx"), sheet_name="主机表", index=False)
        report = validate_ip(tmp)
        assert any(i.severity == "info" and "未发现 IP 规划字段" in i.message for i in report.issues)
        assert report.ok is True


def test_issue_model_validation():
    issue = ValidationIssue(severity="bad", category="nope", location="x",
                            message="m", suggestion="s")
    assert issue.severity == "error"
    assert issue.category == "field"
    d = issue.to_dict()
    assert d["severity"] == "error"
