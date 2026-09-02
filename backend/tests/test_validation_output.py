"""4.5.0（D-2）导出数据核对测试（F5-2）：渲染批次产物 ↔ 参数/模板状态一致性。"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd

from validation.output_check import (validate_output, latest_output_dir,
                                     list_output_devices)
from validation.models import ValidationReport


def _write_para(project_dir, rows):
    pd.DataFrame(rows).to_excel(
        os.path.join(project_dir, "para.xlsx"),
        sheet_name="project_para",
        index=False,
    )


def _write_excel(project_dir, fname, sheet, rows):
    os.makedirs(os.path.join(project_dir, "excel"), exist_ok=True)
    pd.DataFrame(rows).to_excel(
        os.path.join(project_dir, "excel", fname), sheet_name=sheet, index=False)


def _make_output_batch(project_dir, ts="2026_09_02_10_00_00", devices=()):
    base = os.path.join(project_dir, "output", ts, "ASW")
    os.makedirs(base, exist_ok=True)
    for name, content in devices:
        with open(os.path.join(base, f"{name}.txt"), "w", encoding="utf-8") as f:
            f.write(content)


def _rendered_project(project_dir):
    """已渲染的健康项目：2 台设备产物与参数表一致。"""
    _write_para(project_dir, [
        {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
         "对称列数": 0, "key列数": 1},
    ])
    _write_excel(project_dir, "hostname.xlsx", "主机表", [
        {"设备名": "SW-01", "角色": "ASW"},
        {"设备名": "SW-02", "角色": "ASW"},
    ])
    _make_output_batch(project_dir, devices=[
        ("SW-01", "config SW-01\n"),
        ("SW-02", "config SW-02\n"),
    ])
    return project_dir


# ---- 基础工具 ----

def test_report_type():
    with tempfile.TemporaryDirectory() as tmp:
        report = validate_output(tmp)
        assert isinstance(report, ValidationReport)
        assert report.scope == "output"
        assert "output" in " ".join(report.checks)


def test_no_output_dir_warning():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        _write_excel(tmp, "hostname.xlsx", "主机表", [{"设备名": "SW-01", "角色": "ASW"}])
        report = validate_output(tmp)
        assert any(i.severity == "warning" and "没有渲染批次" in i.message for i in report.issues)


def test_latest_output_dir_picks_newest():
    with tempfile.TemporaryDirectory() as tmp:
        _make_output_batch(tmp, ts="2026_09_01_00_00_00", devices=[("SW-01", "a")])
        _make_output_batch(tmp, ts="2026_09_02_00_00_00", devices=[("SW-01", "b")])
        latest = latest_output_dir(tmp)
        assert latest is not None
        assert os.path.basename(latest) == "2026_09_02_00_00_00"


def test_list_output_devices():
    with tempfile.TemporaryDirectory() as tmp:
        _make_output_batch(tmp, devices=[("SW-01", "a"), ("SW-02", "b")])
        devices = list_output_devices(latest_output_dir(tmp))
        assert sorted(d["name"] for d in devices) == ["SW-01", "SW-02"]
        assert all(d["role"] == "ASW" for d in devices)


# ---- 数量/命名 ----

def test_device_count_mismatch_error():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        _write_excel(tmp, "hostname.xlsx", "主机表", [
            {"设备名": "SW-01", "角色": "ASW"},
            {"设备名": "SW-02", "角色": "ASW"},
            {"设备名": "SW-03", "角色": "ASW"},
        ])
        _make_output_batch(tmp, devices=[("SW-01", "a"), ("SW-02", "b")])
        report = validate_output(tmp)
        assert any(i.severity == "error" and "设备数" in i.message for i in report.issues)


def test_missing_device_in_output_error():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        _write_excel(tmp, "hostname.xlsx", "主机表", [
            {"设备名": "SW-01", "角色": "ASW"},
            {"设备名": "SW-02", "角色": "ASW"},
        ])
        _make_output_batch(tmp, devices=[("SW-01", "a")])
        report = validate_output(tmp)
        assert any(i.severity == "error" and "缺失设备" in i.message and "SW-02" in i.message
                   for i in report.issues)


def test_extra_device_in_output_warning():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        _write_excel(tmp, "hostname.xlsx", "主机表", [{"设备名": "SW-01", "角色": "ASW"}])
        _make_output_batch(tmp, devices=[("SW-01", "a"), ("SW-99", "b")])
        report = validate_output(tmp)
        assert any(i.severity == "warning" and "参数表外设备" in i.message and "SW-99" in i.message
                   for i in report.issues)


# ---- 引用核对 ----

def test_missing_terminal_reference_warning():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
            {"工作簿名称": "connection.xlsx", "工作表名称": "终端连接表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 2},
        ])
        _write_excel(tmp, "hostname.xlsx", "主机表", [{"设备名": "SW-01", "角色": "ASW"}])
        _write_excel(tmp, "connection.xlsx", "终端连接表", [
            {"己端设备": "SW-01", "终端名称": "PC-001"},
        ])
        # 产物未引用 PC-001 → 警告
        _make_output_batch(tmp, devices=[("SW-01", "config SW-01\n")])
        report = validate_output(tmp)
        assert any(i.severity == "warning" and "未引用" in i.message and "PC-001" in i.message
                   for i in report.issues)


def test_reference_hit_no_warning():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
            {"工作簿名称": "connection.xlsx", "工作表名称": "终端连接表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 2},
        ])
        _write_excel(tmp, "hostname.xlsx", "主机表", [{"设备名": "SW-01", "角色": "ASW"}])
        _write_excel(tmp, "connection.xlsx", "终端连接表", [
            {"己端设备": "SW-01", "终端名称": "PC-001"},
        ])
        _make_output_batch(tmp, devices=[("SW-01", "description TO-PC-001\n")])
        report = validate_output(tmp)
        assert not any("未引用" in i.message for i in report.issues)


# ---- 漂移核对 ----

def test_drift_after_para_modified_warning():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        _write_excel(tmp, "hostname.xlsx", "主机表", [{"设备名": "SW-01", "角色": "ASW"}])
        _make_output_batch(tmp, devices=[("SW-01", "a")])
        # 修改 para.xlsx 使其 mtime 晚于产物批次
        para_path = os.path.join(tmp, "para.xlsx")
        old = os.path.getmtime(para_path)
        os.utime(para_path, (old + 10, old + 10))
        report = validate_output(tmp)
        assert any(i.severity == "warning" and "过期" in i.message for i in report.issues)


def test_healthy_rendered_project_passes():
    with tempfile.TemporaryDirectory() as tmp:
        _rendered_project(tmp)
        report = validate_output(tmp)
        assert report.ok is True, [i.message for i in report.issues]
