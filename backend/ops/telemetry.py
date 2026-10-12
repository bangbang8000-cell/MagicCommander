"""5.4.14-F54-14-2：本地遥测（默认关 / 脱敏 / 可导出；与 AL 同构）。

- 开关持久化在 ops_config.json（enable_telemetry，默认 False）
- 事件追加到 telemetry.jsonl（JSON 行），仅本地落盘，不联网
- 写前脱敏：password/token/api_key/secret 等字段值 → ***
"""
from __future__ import annotations

import json
import os
import re
import time
from typing import Any, Dict, List, Optional

_SENSITIVE_KEY_RE = re.compile(
    r"(password|passwd|pwd|token|api[_-]?key|secret|authorization|credential|private[_-]?key)",
    re.IGNORECASE,
)


def sanitize_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """递归脱敏：键名命中敏感词 → 值替换为 ***。原事件不被修改。"""
    out: Dict[str, Any] = {}
    for k, v in event.items():
        if isinstance(v, dict):
            out[k] = sanitize_event(v)
        elif _SENSITIVE_KEY_RE.search(str(k)):
            out[k] = "***"
        else:
            out[k] = v
    return out


class Telemetry:
    def __init__(self, config_path: str, log_path: str) -> None:
        self.config_path = config_path
        self.log_path = log_path

    def _load_config(self) -> dict:
        try:
            with open(self.config_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return {}

    def is_enabled(self) -> bool:
        return bool(self._load_config().get("enable_telemetry", False))

    def set_enabled(self, enabled: bool) -> bool:
        cfg = self._load_config()
        cfg["enable_telemetry"] = bool(enabled)
        os.makedirs(os.path.dirname(self.config_path) or ".", exist_ok=True)
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        return bool(enabled)

    def record(self, event: Dict[str, Any]) -> Optional[int]:
        if not self.is_enabled():
            return None
        line = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "event": sanitize_event(event),
        }
        os.makedirs(os.path.dirname(self.log_path) or ".", exist_ok=True)
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")
        return self.count()

    def count(self) -> int:
        try:
            with open(self.log_path, "r", encoding="utf-8") as f:
                return sum(1 for _ in f)
        except OSError:
            return 0

    def export(self, limit: int = 100) -> List[dict]:
        try:
            with open(self.log_path, "r", encoding="utf-8") as f:
                lines = [json.loads(ln) for ln in f if ln.strip()]
        except (OSError, ValueError):
            return []
        return lines[-limit:]

    def clear(self) -> None:
        try:
            os.remove(self.log_path)
        except OSError:
            pass


_default_dir = os.path.join(os.path.expanduser("~"), ".magiccommander", "ops")
default_telemetry = Telemetry(
    config_path=os.path.join(_default_dir, "ops_config.json"),
    log_path=os.path.join(_default_dir, "telemetry.jsonl"),
)

__all__ = ["Telemetry", "sanitize_event", "default_telemetry"]
