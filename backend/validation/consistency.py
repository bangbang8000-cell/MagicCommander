#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""4.5.0（F5-1）一致性校验引擎：参数表完整性 / 模板渲染产物与参数一致性 / 配置字段校验。

- 参数表完整性（para）：para.xlsx 存在且含 project_para 表；必填列齐全；
  工作表类型为合法枚举；引用的工作簿/工作表真实存在；excel/、templates/ 目录存在。
- 模板与参数一致性（template）：hostname 表中的角色 → templates/<角色>.j2 映射存在；
  模板中 info['字段'] 引用在参数表字段集中存在；模板可被 Jinja2 解析。
- 配置字段校验（field）：设备名/角色等关键字段非空；管理 IP 合法。

问题结构见 validation/models.py（severity/类别/定位/建议），供 UI 与测试复用。
"""
from __future__ import annotations

import logging
import os
import re

import pandas as pd

from .models import ValidationReport

logger = logging.getLogger(__name__)

# 工作表类型合法枚举（与 pre_processing 分发逻辑一致）
SHEET_TYPES = ("赋值表", "对称表", "参数表")

# project_para 表必填列
PARA_REQUIRED_COLUMNS = ("工作簿名称", "工作表名称", "工作表类型", "对称列数", "key列数")

# 角色映射：以 hostname 赋值表中的「角色」列值为准 → templates/<角色>.j2
ROLE_COLUMN_ALIASES = ("角色",)

# 模板变量引用模式：info['字段'] 或 info["字段"]
TEMPLATE_VAR_RE = re.compile(r"info\s*\[\s*['\"]([^'\"]+)['\"]\s*\]")

# 关键设备字段（field 校验）：非空 + 格式
KEY_DEVICE_FIELDS = ("设备名", "角色")
IP_LIKE_FIELDS = ("管理IP", "网关IP")


def load_para_rows(project_dir: str):
    """读取 para.xlsx 的 project_para 表，返回行列表（dict）。失败返回 []。"""
    path = os.path.join(project_dir, "para.xlsx")
    if not os.path.isfile(path):
        return []
    try:
        df = pd.read_excel(path, sheet_name="project_para", keep_default_na=False)
    except Exception as e:  # 工作表缺失 / 读取失败
        logger.warning("读取 project_para 失败: %s", e)
        return []
    rows = []
    for _, row in df.iterrows():
        rows.append({str(k): v for k, v in row.items()})
    return rows


def load_sheet(project_dir: str, workbook: str, sheet_name: str):
    """读取 excel/<workbook>/<sheet> 为 DataFrame；失败返回 None。"""
    path = os.path.join(project_dir, "excel", workbook)
    if not os.path.isfile(path):
        return None
    try:
        return pd.read_excel(path, sheet_name=sheet_name, keep_default_na=False)
    except Exception as e:
        logger.warning("读取 %s/%s 失败: %s", workbook, sheet_name, e)
        return None


def _str(v) -> str:
    return "" if v is None else str(v).strip()


def _collect_field_names(project_dir: str, para_rows: list) -> set:
    """汇总所有被引用工作表的列名 → 字段集（模板变量引用对照基准）。"""
    fields: set = set()
    for row in para_rows:
        workbook = _str(row.get("工作簿名称"))
        sheet_name = _str(row.get("工作表名称"))
        if not workbook or not sheet_name:
            continue
        df = load_sheet(project_dir, workbook, sheet_name)
        if df is None:
            continue
        for col in df.columns:
            fields.add(_str(col))
    return fields


def _collect_roles(project_dir: str, para_rows: list) -> set:
    """汇总赋值表中「角色」列的值 → 角色集（模板映射基准）。"""
    roles: set = set()
    for row in para_rows:
        workbook = _str(row.get("工作簿名称"))
        sheet_name = _str(row.get("工作表名称"))
        if not workbook or not sheet_name:
            continue
        df = load_sheet(project_dir, workbook, sheet_name)
        if df is None or "角色" not in df.columns:
            continue
        for v in df["角色"].dropna():
            s = _str(v)
            if s:
                roles.add(s)
    return roles


def _extract_template_vars(source: str) -> set:
    return set(TEMPLATE_VAR_RE.findall(source))


def check_para_completeness(project_dir: str, report: ValidationReport) -> None:
    """参数表完整性校验。"""
    report.checks.append("para: para.xlsx 与 project_para 完整性")
    para_path = os.path.join(project_dir, "para.xlsx")
    if not os.path.isfile(para_path):
        report.add("error", "para", "para.xlsx",
                   "缺少 para.xlsx 参数文件",
                   "创建 para.xlsx 并包含 project_para 工作表（声明 Excel 读取清单）")
        return

    if not os.path.isdir(os.path.join(project_dir, "excel")):
        report.add("error", "para", "excel/",
                   "缺少 excel 目录（参数工作簿应放在 excel/ 下）",
                   "新建 excel/ 目录并放入 hostname/connection/ipaddress/parameter 等工作簿")
    if not os.path.isdir(os.path.join(project_dir, "templates")):
        report.add("error", "para", "templates/",
                   "缺少 templates 目录（Jinja2 模板应放在 templates/ 下）",
                   "新建 templates/ 目录并放入与设备角色同名的 .j2 模板")

    para_rows = load_para_rows(project_dir)
    if not para_rows:
        report.add("error", "para", "para.xlsx/project_para",
                   "project_para 工作表为空或不存在",
                   "在 para.xlsx 中声明要读取的工作簿/工作表清单")
        return

    for idx, row in enumerate(para_rows, start=2):
        loc = f"para.xlsx/project_para/第{idx}行"
        missing = [c for c in PARA_REQUIRED_COLUMNS if c not in row]
        if missing:
            report.add("error", "para", loc,
                       f"缺少必填列: {', '.join(missing)}",
                       "补齐 工作簿名称/工作表名称/工作表类型/对称列数/key列数")
            continue

        workbook = _str(row.get("工作簿名称"))
        sheet_name = _str(row.get("工作表名称"))
        sheet_type = _str(row.get("工作表类型"))

        if sheet_type and sheet_type not in SHEET_TYPES:
            report.add("error", "para", loc,
                       f"工作表类型 '{sheet_type}' 非法（应为 {'/'.join(SHEET_TYPES)}）",
                       "修正工作表类型为 赋值表/对称表/参数表")

        if workbook:
            excel_path = os.path.join(project_dir, "excel", workbook)
            if not os.path.isfile(excel_path):
                report.add("error", "para", loc,
                           f"引用的工作簿不存在: excel/{workbook}",
                           "确认 excel/ 目录存在该文件，或修正 工作簿名称")
                continue
            if sheet_name:
                df = load_sheet(project_dir, workbook, sheet_name)
                if df is None:
                    report.add("error", "para", loc,
                               f"工作表 '{sheet_name}' 在 {workbook} 中不存在或读取失败",
                               "确认工作表名称与工作簿内 Sheet 一致")
                elif len(df) == 0:
                    report.add("warning", "para", loc,
                               f"工作表 '{sheet_name}' 为空",
                               "补充数据或删除该行声明")


def check_template_consistency(project_dir: str, report: ValidationReport) -> None:
    """模板渲染产物与参数一致性校验。"""
    report.checks.append("template: 角色→模板映射与模板变量引用")
    para_rows = load_para_rows(project_dir)
    if not para_rows:
        return

    roles = _collect_roles(project_dir, para_rows)
    templates_dir = os.path.join(project_dir, "templates")
    for role in sorted(roles):
        if not os.path.isdir(templates_dir):
            break
        tpl = os.path.join(templates_dir, f"{role}.j2")
        if not os.path.isfile(tpl):
            report.add("error", "template", f"templates/{role}.j2",
                       f"角色 '{role}' 缺少对应模板 {role}.j2",
                       f"创建 templates/{role}.j2，或调整参数表中的 角色 值")

    # 模板变量引用 ↔ 参数表字段集 一致性
    fields = _collect_field_names(project_dir, para_rows)
    if not fields:
        return
    if not os.path.isdir(templates_dir):
        return
    for fname in sorted(os.listdir(templates_dir)):
        if not fname.endswith(".j2"):
            continue
        fpath = os.path.join(templates_dir, fname)
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                source = f.read()
        except OSError as e:
            report.add("error", "template", f"templates/{fname}",
                       f"无法读取模板: {e}",
                       "检查模板文件编码与权限")
            continue
        # Jinja2 语法解析
        try:
            from jinja2 import Environment, FileSystemLoader
            Environment(loader=FileSystemLoader(templates_dir)).parse(source)
        except Exception as e:
            report.add("error", "template", f"templates/{fname}",
                       f"模板语法错误: {e}",
                       "修正 Jinja2 语法后重新校验")
        # 变量引用
        missing_vars = sorted(_extract_template_vars(source) - fields)
        if missing_vars:
            report.add("warning", "template", f"templates/{fname}",
                       f"模板引用的字段在参数表中不存在: {', '.join(missing_vars)}",
                       "在参数表中补充对应列，或修正模板中的 info['字段'] 引用")


def check_field_validity(project_dir: str, report: ValidationReport) -> None:
    """配置字段校验：关键字段非空 + IP 格式。"""
    report.checks.append("field: 关键字段非空与 IP 格式")
    para_rows = load_para_rows(project_dir)
    if not para_rows:
        return
    seen_devices = set()
    for row in para_rows:
        workbook = _str(row.get("工作簿名称"))
        sheet_name = _str(row.get("工作表名称"))
        if not workbook or not sheet_name:
            continue
        df = load_sheet(project_dir, workbook, sheet_name)
        if df is None:
            continue
        for r_idx, (_, r) in enumerate(df.iterrows(), start=2):
            loc = f"{workbook}/{sheet_name}/第{r_idx}行"
            for col in KEY_DEVICE_FIELDS:
                if col in df.columns:
                    v = _str(r.get(col))
                    if not v:
                        report.add("warning", "field", loc,
                                   f"关键字段 '{col}' 为空",
                                   f"补全 '{col}' 字段")
            for col in IP_LIKE_FIELDS:
                if col in df.columns:
                    v = _str(r.get(col))
                    if v and not _is_valid_ipv4(v):
                        report.add("error", "field", loc,
                                   f"字段 '{col}' 不是合法 IPv4: {v}",
                                   "修正为合法 IPv4 地址（如 192.168.1.1）")
            if "设备名" in df.columns:
                name = _str(r.get("设备名"))
                if name:
                    if name in seen_devices:
                        report.add("warning", "field", loc,
                                   f"设备名重复: {name}",
                                   "确保设备名全局唯一")
                    seen_devices.add(name)


def _is_valid_ipv4(value) -> bool:
    s = _str(value)
    if not s:
        return False
    parts = s.split(".")
    if len(parts) != 4:
        return False
    for p in parts:
        if not p.isdigit():
            return False
        if not 0 <= int(p) <= 255:
            return False
    return True


def validate_consistency(project_dir: str) -> ValidationReport:
    """执行一致性校验（T1，scope='consistency'）。"""
    report = ValidationReport(ok=True, project=os.path.basename(project_dir.rstrip("/\\")),
                              scope="consistency")
    check_para_completeness(project_dir, report)
    check_template_consistency(project_dir, report)
    check_field_validity(project_dir, report)
    return report
