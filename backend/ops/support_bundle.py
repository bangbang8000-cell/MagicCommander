"""5.4.14-F54-14-1：支持包一键导出（与 AL 同构）。

把「版本信息 + 配置快照 + 日志尾部 + 审计尾部」打包成时间戳 zip。
- 只取文件尾部（tail_n）；缺失文件静默标记跳过
- 纯标准库实现，可单测
"""
from __future__ import annotations

import json
import os
import time
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional


@dataclass
class SupportBundleSources:
    version_info: Optional[dict] = None
    config_snapshot: Optional[dict] = None
    log_files: Optional[List[str]] = None
    audit_files: Optional[List[str]] = None
    tail_n: int = 200


def _read_tail(path: str, n: int) -> Optional[str]:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        return "".join(lines[-n:])
    except OSError:
        return None


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def export_support_bundle(dst_path: str, sources: SupportBundleSources) -> dict:
    os.makedirs(os.path.dirname(os.path.abspath(dst_path)) or ".", exist_ok=True)
    manifest: Dict[str, object] = {
        "schema": "mc.ops.support-bundle/1",
        "exportedAt": _stamp(),
        "app": sources.version_info or {},
        "files": {},
    }
    with zipfile.ZipFile(dst_path, "w", zipfile.ZIP_DEFLATED) as zf:
        if sources.config_snapshot is not None:
            zf.writestr("config_snapshot.json", json.dumps(sources.config_snapshot, ensure_ascii=False, indent=2))
            manifest["files"]["config_snapshot.json"] = "ok"
        for label, paths in (("log", sources.log_files or []), ("audit", sources.audit_files or [])):
            for p in paths:
                name = os.path.basename(p)
                tail = _read_tail(p, sources.tail_n)
                arc = f"{label}/{name}.tail"
                if tail is None:
                    manifest["files"][arc] = "missing"
                    continue
                zf.writestr(arc, tail)
                manifest["files"][arc] = "ok"
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    manifest["bundle"] = dst_path
    return manifest


__all__ = ["SupportBundleSources", "export_support_bundle", "_read_tail"]
