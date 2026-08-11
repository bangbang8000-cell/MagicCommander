"""智能校对与依赖分析测试"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pandas as pd
import pytest

from analyzer import analyze_project
from proofread import proofread_project


@pytest.fixture
def sample_project(tmp_path):
    """构造最小项目：一个模板 + 一个 Excel 表"""
    proj = tmp_path / "demo"
    (proj / "templates").mkdir(parents=True)
    (proj / "excel").mkdir()
    (proj / "templates" / "ASW.j2").write_text(
        "sysname {{ info['设备名'] }}\n"
        "ip address {{ info['管理IP'] }}\n",
        encoding="utf-8",
    )
    df = pd.DataFrame({
        "设备名": ["SW-A", "SW-B"],
        "管理IP": ["10.0.0.1", ""],   # SW-B 管理IP 为空 → 校对应报 empty_value
        "未用列": ["x", "y"],          # 未被模板引用 → 依赖分析应报 unused
    })
    df.to_excel(str(proj / "excel" / "hostname.xlsx"), index=False)
    return proj


def test_analyze_dependencies(sample_project):
    report = analyze_project(str(sample_project))
    deps = report["dependencies"]
    assert deps["template_columns"]["ASW.j2"] == ["管理IP", "设备名"]  # 按 Unicode 排序
    assert "设备名" in deps["column_templates"]
    # 未用列按表记录
    assert "unused_columns_by_sheet"
    assert report["cross_reference"]["excel_columns_unused_in_templates"]


def test_proofread_reports_missing_values(sample_project):
    report = proofread_project(str(sample_project))
    assert report["status"] == "success"
    empty_value = [i for i in report["issues"] if i["type"] == "empty_value"]
    assert empty_value, "应检测到 SW-B 管理IP 为空"
    assert empty_value[0]["device"] == "SW-B"


def test_proofread_syntax_error(tmp_path):
    proj = tmp_path / "bad"
    (proj / "templates").mkdir(parents=True)
    (proj / "templates" / "ASW.j2").write_text("{% if %}", encoding="utf-8")
    report = proofread_project(str(proj))
    syntax = [i for i in report["issues"] if i["type"] == "syntax"]
    assert syntax, "应检测到模板语法错误"
    assert report["summary"]["errors"] >= 1
