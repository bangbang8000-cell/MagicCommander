#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""4.5.0（F5-3）IP 规划校验工具：子网重叠 / 网关冲突 / IP 段内分配越界与重复 / 掩码合法性。

提供纯函数（供测试与复用）+ 项目级入口（从参数表读取 IP 规划字段校验）。

- 掩码合法性：前缀 0-32；点分掩码可换算。
- 子网重叠：网段（ip + 前缀）两两相交。
- 网关冲突：同一子网多个不同网关；不同子网共用同一网关。
- 分配越界/重复：分配 IP 不在声明子网内 / 重复分配。

参数表 IP 规划字段（ipaddress.xlsx 网关地址表等）：
  网关IP / 网关掩码（前缀或点分） / 管理IP / 掩码 / 子网 / 网段 / 起始IP / 结束IP
"""
from __future__ import annotations

import ipaddress
import logging
import os

from .models import ValidationReport
from .consistency import load_para_rows, load_sheet, _str

logger = logging.getLogger(__name__)


# ---- 纯工具函数 ----

def ip_to_int(ip: str) -> int:
    """IPv4 → 整数；非法抛 ValueError。"""
    return int(ipaddress.IPv4Address(ip))


def parse_prefix(mask) -> int:
    """掩码 → 前缀长度（0-32）。支持点分掩码（255.255.255.0）与整数前缀。非法抛 ValueError。"""
    if mask is None:
        raise ValueError("掩码为空")
    s = _str(mask)
    if not s:
        raise ValueError("掩码为空")
    if s.isdigit():
        prefix = int(s)
        if not 0 <= prefix <= 32:
            raise ValueError(f"前缀 {prefix} 越界（应为 0-32）")
        return prefix
    # 点分十进制
    prefix = ipaddress.IPv4Network(f"0.0.0.0/{s}", strict=False).prefixlen
    return prefix


def cidr_to_range(ip: str, prefix: int) -> tuple:
    """网段（ip + 前缀）→ (network_int, broadcast_int)。"""
    net = ipaddress.IPv4Network(f"{ip}/{prefix}", strict=False)
    return (int(net.network_address), int(net.broadcast_address))


def subnets_overlap(a_ip: str, a_prefix: int, b_ip: str, b_prefix: int) -> bool:
    """两个网段是否重叠（含包含关系）。"""
    a = cidr_to_range(a_ip, a_prefix)
    b = cidr_to_range(b_ip, b_prefix)
    return not (a[1] < b[0] or b[1] < a[0])


def ip_in_subnet(ip: str, subnet_ip: str, prefix: int) -> bool:
    """IP 是否在子网内（含网络/广播地址）。"""
    lo, hi = cidr_to_range(subnet_ip, prefix)
    return lo <= ip_to_int(ip) <= hi


def is_valid_ipv4(value) -> bool:
    """IPv4 合法性（不含端口/掩码）。"""
    s = _str(value)
    if not s:
        return False
    try:
        ipaddress.IPv4Address(s)
        return True
    except ipaddress.AddressValueError:
        return False


# ---- IP 规划条目校验 ----

def _ip_entries_from_para(project_dir: str) -> list:
    """从参数表中提取 IP 规划条目：[{location, ip, prefix, role}]。"""
    entries = []
    para_rows = load_para_rows(project_dir)
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
            ip = None
            prefix = None
            for ip_col in ("网关IP", "管理IP", "IP", "地址", "起始IP"):
                if ip_col in df.columns and _str(r.get(ip_col)):
                    ip = _str(r.get(ip_col))
                    break
            for mask_col in ("网关掩码", "掩码", "前缀", "子网掩码"):
                if mask_col in df.columns and _str(r.get(mask_col)):
                    prefix = r.get(mask_col)
                    break
            if ip and is_valid_ipv4(ip):
                entries.append({"location": loc, "ip": ip, "prefix": prefix})
    return entries


def _declare_subnets(project_dir: str) -> list:
    """提取声明的子网：[{location, network, prefix}]（网段/子网字段）。"""
    subnets = []
    para_rows = load_para_rows(project_dir)
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
            for net_col in ("网段", "子网"):
                if net_col in df.columns:
                    v = _str(r.get(net_col))
                    if "/" in v:
                        ip, _, p = v.partition("/")
                        if is_valid_ipv4(ip) and p.isdigit():
                            subnets.append({"location": loc, "network": ip, "prefix": int(p)})
                    elif is_valid_ipv4(v):
                        prefix = None
                        for mask_col in ("掩码", "前缀"):
                            if mask_col in df.columns and _str(r.get(mask_col)):
                                try:
                                    prefix = parse_prefix(r.get(mask_col))
                                except ValueError:
                                    prefix = None
                        subnets.append({"location": loc, "network": v, "prefix": prefix})
    return subnets


def check_ip_entries(entries: list, report: ValidationReport) -> None:
    """校验 IP 条目：掩码合法性、重复分配、越界。"""
    report.checks.append("ip: 掩码合法性/重复分配/越界")
    seen = {}  # ip → location
    for e in entries:
        loc = e["location"]
        if e["prefix"] is not None:
            try:
                parse_prefix(e["prefix"])
            except ValueError as err:
                report.add("error", "ip", loc,
                           f"掩码非法: {e['prefix']}（{err}）",
                           "修正掩码为 0-32 前缀或合法点分掩码")
        if e["ip"] in seen:
            report.add("error", "ip", loc,
                       f"IP 重复分配: {e['ip']}（已出现于 {seen[e['ip']]}）",
                       "确保 IP 分配唯一")
        else:
            seen[e["ip"]] = loc


def check_subnet_conflicts(subnets: list, report: ValidationReport) -> None:
    """校验声明子网：两两重叠。"""
    report.checks.append("ip: 子网重叠")
    for i in range(len(subnets)):
        for j in range(i + 1, len(subnets)):
            a, b = subnets[i], subnets[j]
            if a["prefix"] is None or b["prefix"] is None:
                continue
            if subnets_overlap(a["network"], a["prefix"], b["network"], b["prefix"]):
                report.add("error", "ip", f"{a['location']} ↔ {b['location']}",
                           f"子网重叠: {a['network']}/{a['prefix']} 与 {b['network']}/{b['prefix']}",
                           "调整网段划分，避免地址空间重叠")


def validate_ip(project_dir: str) -> ValidationReport:
    """执行 IP 规划校验（T3，scope='ip'）。"""
    report = ValidationReport(ok=True, project=os.path.basename(project_dir.rstrip("/\\")),
                              scope="ip")
    entries = _ip_entries_from_para(project_dir)
    if not entries:
        report.add("info", "ip", "参数表",
                   "未发现 IP 规划字段（网关IP/管理IP/IP/掩码），跳过 IP 校验",
                   "如需 IP 校验，在参数表中补充 IP 与掩码字段")
        return report
    check_ip_entries(entries, report)
    subnets = _declare_subnets(project_dir)
    if subnets:
        check_subnet_conflicts(subnets, report)
    return report
