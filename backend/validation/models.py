#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""4.5.0（F5-1）校验引擎统一数据结构：结构化问题 + 校验报告。

约定（前端校验面板 / pytest / CLI / CI 门禁共用）：
- severity: error（阻断）/ warning（提示）/ info（信息）
- category: para（参数表完整性）/ template（模板与参数一致性）/ output（导出数据核对）
            / ip（IP 规划）/ field（配置字段）/ ai（AI 规划器准确性）
- location: 可定位字段（文件 / 工作表 / 行号 / 设备名 / 字段名）
- message / suggestion: 中文可读 + 修复建议
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional

SEVERITIES = ("error", "warning", "info")
CATEGORIES = ("para", "template", "output", "ip", "field", "ai")

# 问题类别 → 中文名（报告/面板展示用）
CATEGORY_LABELS = {
    "para": "参数表完整性",
    "template": "模板与参数一致性",
    "output": "导出数据核对",
    "ip": "IP 规划",
    "field": "配置字段",
    "ai": "AI 规划器准确性",
}

SEVERITY_LABELS = {"error": "错误", "warning": "警告", "info": "信息"}


@dataclass
class ValidationIssue:
    """单条校验问题。"""

    severity: str = "error"
    category: str = "field"
    location: str = ""
    message: str = ""
    suggestion: str = ""

    def __post_init__(self):
        if self.severity not in SEVERITIES:
            self.severity = "error"
        if self.category not in CATEGORIES:
            self.category = "field"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ValidationReport:
    """一次校验的完整报告。"""

    ok: bool = True
    project: str = ""
    scope: str = "all"
    checks: list = field(default_factory=list)
    issues: list = field(default_factory=list)

    @property
    def summary(self) -> dict:
        total = len(self.issues)
        errors = sum(1 for i in self.issues if i.severity == "error")
        warnings = sum(1 for i in self.issues if i.severity == "warning")
        infos = total - errors - warnings
        return {"total": total, "errors": errors, "warnings": warnings, "infos": infos}

    def add(self, severity: str, category: str, location: str, message: str,
            suggestion: str = "") -> None:
        self.issues.append(
            ValidationIssue(severity=severity, category=category, location=location,
                            message=message, suggestion=suggestion)
        )
        if severity == "error":
            self.ok = False

    def add_issue(self, issue: ValidationIssue) -> None:
        self.issues.append(issue)
        if issue.severity == "error":
            self.ok = False

    def by_category(self) -> dict:
        """按类别分组（面板展示用）：{category: [issue_dict, ...]}"""
        grouped: dict = {}
        for issue in self.issues:
            grouped.setdefault(issue.category, []).append(issue.to_dict())
        return grouped

    def by_severity(self) -> dict:
        """按严重度分组：{error: [...], warning: [...], info: [...]}"""
        grouped: dict = {"error": [], "warning": [], "info": []}
        for issue in self.issues:
            grouped.setdefault(issue.severity, []).append(issue.to_dict())
        return grouped

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "project": self.project,
            "scope": self.scope,
            "checks": list(self.checks),
            "summary": self.summary,
            "issues": [i.to_dict() for i in self.issues],
        }

    def to_json(self) -> str:
        import json
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)
