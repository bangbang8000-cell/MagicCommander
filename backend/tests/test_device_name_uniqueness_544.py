"""5.4.4（F1）设备名全局唯一性检查测试：跨工作表扫描"设备名"列，重复项告警。"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd

from pre_processing import _check_device_name_uniqueness


def _write_para(project_dir, rows):
    pd.DataFrame(rows).to_excel(
        os.path.join(project_dir, "para.xlsx"),
        sheet_name="project_para",
        index=False,
    )


def _write_sheet(project_dir, workbook, sheet_name, rows):
    os.makedirs(os.path.join(project_dir, "excel"), exist_ok=True)
    pd.DataFrame(rows).to_excel(
        os.path.join(project_dir, "excel", workbook),
        sheet_name=sheet_name,
        index=False,
    )


def _load_para(project_dir):
    return pd.read_excel(
        os.path.join(project_dir, "para.xlsx"),
        sheet_name=None,
        keep_default_na=False,
    )


def test_no_duplicate_no_warning():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        _write_sheet(tmp, "hostname.xlsx", "主机表", [
            {"设备名": "SW-01", "角色": "ASW"},
            {"设备名": "SW-02", "角色": "ASW"},
        ])
        warnings_out = _check_device_name_uniqueness(tmp, _load_para(tmp), "project_para")
        assert warnings_out == []


def test_duplicate_within_sheet_warns():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        _write_sheet(tmp, "hostname.xlsx", "主机表", [
            {"设备名": "SW-01", "角色": "ASW"},
            {"设备名": "SW-01", "角色": "ASW"},
        ])
        warnings_out = _check_device_name_uniqueness(tmp, _load_para(tmp), "project_para")
        assert len(warnings_out) == 1
        assert warnings_out[0]["type"] == "device_name_duplicate"
        assert "SW-01" in warnings_out[0]["message"]
        assert len(warnings_out[0]["locations"]) == 2


def test_duplicate_across_sheets_warns():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
            {"工作簿名称": "ip.xlsx", "工作表名称": "IP表", "工作表类型": "对称表",
             "对称列数": 2, "key列数": 1},
        ])
        _write_sheet(tmp, "hostname.xlsx", "主机表", [
            {"设备名": "SW-01", "角色": "ASW"},
        ])
        _write_sheet(tmp, "ip.xlsx", "IP表", [
            {"设备名": "SW-01", "角色": "ASW"},
            {"设备名": "SW-02", "角色": "ASW"},
        ])
        warnings_out = _check_device_name_uniqueness(tmp, _load_para(tmp), "project_para")
        assert len(warnings_out) == 1
        assert "SW-01" in warnings_out[0]["message"]
        assert warnings_out[0]["locations"][0].startswith("hostname.xlsx")
        assert warnings_out[0]["locations"][1].startswith("ip.xlsx")


def test_empty_name_skipped():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "主机表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        _write_sheet(tmp, "hostname.xlsx", "主机表", [
            {"设备名": "", "角色": "ASW"},
            {"设备名": "", "角色": "ASW"},
        ])
        warnings_out = _check_device_name_uniqueness(tmp, _load_para(tmp), "project_para")
        assert warnings_out == []


def test_missing_sheet_or_file_no_error():
    with tempfile.TemporaryDirectory() as tmp:
        _write_para(tmp, [
            {"工作簿名称": "hostname.xlsx", "工作表名称": "不存在表", "工作表类型": "赋值表",
             "对称列数": 0, "key列数": 1},
        ])
        warnings_out = _check_device_name_uniqueness(tmp, _load_para(tmp), "project_para")
        assert warnings_out == []
