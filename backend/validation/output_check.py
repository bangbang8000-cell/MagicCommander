#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""4.5.0（F5-2）导出数据核对：核对渲染批次（output/）产物与项目参数/模板状态一致性。

核对维度：
- 数量：最新渲染批次产物设备数与参数表设备数一致
- 命名：产物文件名（设备名）与参数表设备名差集（缺失/多余即漂移）
- 引用：产物文本中对端设备/终端引用在参数表中存在
- 漂移：参数表 / 模板文件修改时间晚于最新渲染批次时间（产物过期风险）

可对指定项目执行：validate_output(project_dir)。
"""
from __future__ import annotations

import logging
import os

from .models import ValidationReport
from .consistency import load_para_rows, load_sheet, _str

logger = logging.getLogger(__name__)


def latest_output_dir(project_dir: str) -> str | None:
    """返回 output/ 下最新时间戳子目录绝对路径；无则 None。"""
    output_dir = os.path.join(project_dir, "output")
    if not os.path.isdir(output_dir):
        return None
    ts_dirs = [d for d in os.listdir(output_dir)
               if os.path.isdir(os.path.join(output_dir, d))]
    if not ts_dirs:
        return None
    latest = max(ts_dirs)
    return os.path.join(output_dir, latest)


def list_output_devices(base: str) -> list:
    """列出渲染批次下所有 .txt 设备配置：{name, role, path}。"""
    devices = []
    for root, _, files in os.walk(base):
        for f in sorted(files):
            if not f.endswith(".txt"):
                continue
            role = os.path.basename(root)
            devices.append({
                "name": os.path.splitext(f)[0],
                "role": role,
                "path": os.path.join(root, f),
            })
    return devices


def _para_device_names(project_dir: str, para_rows: list) -> set:
    """参数表中声明的设备名集合。"""
    names: set = set()
    for row in para_rows:
        workbook = _str(row.get("工作簿名称"))
        sheet_name = _str(row.get("工作表名称"))
        if not workbook or not sheet_name:
            continue
        df = load_sheet(project_dir, workbook, sheet_name)
        if df is None or "设备名" not in df.columns:
            continue
        for v in df["设备名"].dropna():
            s = _str(v)
            if s:
                names.add(s)
    return names


def _para_terminal_map(project_dir: str, para_rows: list) -> dict:
    """参数表「己端设备 → 该设备应引用的终端/对端名称」关联映射。

    以连接类表（含 己端设备 + 终端名称/对端设备）为基准：某设备产物应包含其
    直接关联的终端/对端名称，避免「全部终端 × 全部产物」式误报。
    """
    mapping: dict = {}
    for row in para_rows:
        workbook = _str(row.get("工作簿名称"))
        sheet_name = _str(row.get("工作表名称"))
        if not workbook or not sheet_name:
            continue
        df = load_sheet(project_dir, workbook, sheet_name)
        if df is None or "己端设备" not in df.columns:
            continue
        ref_cols = [c for c in ("终端名称", "对端设备", "对端接口所属设备") if c in df.columns]
        if not ref_cols:
            continue
        for _, r in df.iterrows():
            self_dev = _str(r.get("己端设备"))
            if not self_dev:
                continue
            for col in ref_cols:
                v = _str(r.get(col))
                if v:
                    mapping.setdefault(self_dev, set()).add(v)
    return mapping


def check_output_consistency(project_dir: str, report: ValidationReport) -> None:
    """导出数据核对主流程。"""
    report.checks.append("output: 数量/命名/引用/漂移核对")
    para_rows = load_para_rows(project_dir)
    base = latest_output_dir(project_dir)
    if base is None:
        report.add("warning", "output", "output/",
                   "没有渲染批次（output/ 为空或不存在）",
                   "先执行渲染（render project）生成配置产物")
        return

    devices = list_output_devices(base)
    batch_name = os.path.basename(base)
    loc = f"output/{batch_name}"

    para_names = _para_device_names(project_dir, para_rows) if para_rows else set()
    out_names = {d["name"] for d in devices}

    if not para_names:
        report.add("warning", "output", "output/",
                   "参数表为空，无法核对数量/命名",
                   "补充参数表数据后重新渲染")
        return

    # 数量核对
    if len(out_names) != len(para_names):
        report.add("error", "output", loc,
                   f"产物设备数({len(out_names)})与参数表设备数({len(para_names)})不一致",
                   "重新渲染或核对参数表/产物是否漂移")
    # 命名核对（差集）
    missing = sorted(para_names - out_names)
    if missing:
        report.add("error", "output", loc,
                   f"产物缺失设备: {', '.join(missing)}",
                   "重新渲染补齐缺失设备配置")
    extra = sorted(out_names - para_names)
    if extra:
        report.add("warning", "output", loc,
                   f"产物存在参数表外设备: {', '.join(extra)}",
                   "参数表与渲染输入不一致，请核对")

    # 引用核对：按「己端设备 → 关联终端/对端」映射，仅核对各设备自身的关联引用
    ref_map = _para_terminal_map(project_dir, para_rows)
    if ref_map:
        for d in devices:
            expected = ref_map.get(d["name"], set())
            if not expected:
                continue
            try:
                with open(d["path"], "r", encoding="utf-8") as f:
                    text = f.read()
            except OSError:
                continue
            missing = sorted(e for e in expected if e not in text)
            if missing:
                report.add("warning", "output",
                           f"output/{batch_name}/{d['role']}/{d['name']}.txt",
                           f"产物未引用其关联终端/对端: {', '.join(missing[:5])}",
                           "核对模板是否遗漏该终端/对端的配置段落")

    # 漂移核对：参数表/模板 mtime 晚于最新批次 → 产物过期风险
    _check_drift(project_dir, batch_name, report)


def _check_drift(project_dir: str, batch_name: str, report: ValidationReport) -> None:
    base = os.path.join(project_dir, "output", batch_name)
    if not os.path.isdir(base):
        return
    batch_mtime = os.path.getmtime(base)
    drift_sources = ["para.xlsx"]
    excel_dir = os.path.join(project_dir, "excel")
    if os.path.isdir(excel_dir):
        drift_sources.extend(os.path.join("excel", f) for f in sorted(os.listdir(excel_dir)))
    templates_dir = os.path.join(project_dir, "templates")
    if os.path.isdir(templates_dir):
        drift_sources.extend(os.path.join("templates", f) for f in sorted(os.listdir(templates_dir)))

    newer = []
    for rel in drift_sources:
        p = os.path.join(project_dir, rel)
        if os.path.isfile(p) and os.path.getmtime(p) > batch_mtime:
            newer.append(rel)
    if newer:
        report.add("warning", "output", f"output/{batch_name}",
                   f"参数/模板晚于最新渲染批次，产物可能过期: {', '.join(newer[:5])}",
                   "重新渲染以同步最新参数/模板")


def validate_output(project_dir: str) -> ValidationReport:
    """执行导出数据核对（T2，scope='output'）。"""
    report = ValidationReport(ok=True, project=os.path.basename(project_dir.rstrip("/\\")),
                              scope="output")
    check_output_consistency(project_dir, report)
    return report
