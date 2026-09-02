#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""4.5.0（F5-1 ~ F5-5）MC 数据准确性与校验体系 —— 统一校验模块。

- consistency.validate_consistency : T1 一致性校验引擎（参数/模板/产物）
- output_check.validate_output    : T2 导出数据核对（渲染批次 ↔ 参数/模板）
- ip_validate.validate_ip         : T3 IP 规划校验（子网/网关/掩码/分配）
- ai_hub.agent.accuracy           : T4 AI 规划器准确性校验（工具返回 ↔ 实际状态）
- models.ValidationReport         : 结构化问题列表（severity/类别/定位/建议）

统一入口 validate_project() 供 CLI / CI 门禁 / 测试复用。
"""
from __future__ import annotations

import os

from .models import ValidationIssue, ValidationReport  # noqa: F401
from .consistency import validate_consistency
from .output_check import validate_output
from .ip_validate import validate_ip

__all__ = [
    "ValidationIssue",
    "ValidationReport",
    "validate_consistency",
    "validate_output",
    "validate_ip",
    "validate_project",
]

SCOPES = ("consistency", "output", "ip", "all")


def validate_project(project_dir: str, scope: str = "all") -> ValidationReport:
    """执行项目校验（T1-T3），scope ∈ {consistency, output, ip, all}。"""
    if scope not in SCOPES:
        scope = "all"
    if scope == "consistency":
        return validate_consistency(project_dir)
    if scope == "output":
        return validate_output(project_dir)
    if scope == "ip":
        return validate_ip(project_dir)

    report = ValidationReport(ok=True, project=os.path.basename(project_dir.rstrip("/\\")),
                              scope="all")
    for fn in (validate_consistency, validate_output, validate_ip):
        sub = fn(project_dir)
        report.checks.extend(sub.checks)
        for issue in sub.issues:
            report.add_issue(issue)
    return report
