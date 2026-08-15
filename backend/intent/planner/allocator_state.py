"""
地址分配器状态账本（D23：确定性分配 + 预留表持久化）。

项目级 `allocator_state.json`（与 plan.json 同目录，gitignore，派生内容不入仓）：

    {
      "version": 1,
      "segments":  {"loopback": "10.1.0.0/20", ..., "interconnect": "10.1.72.0/21"},  # 当前地址段（可编辑换段）
      "reserved":  {"interconnect": ["10.1.72.100", "10.1.72.101"], "loopback": [], ...},  # 预留（分配器跳过）
      "allocated": {"interconnect": [["10.1.72.0", "10.1.72.1"], ...], ...}                 # 本次分配审计
    }

- **换段**：编辑 `segments` 字段（优先于 plan.ipSegments）→ 重跑 `plan import` 全量重建；
- **预留**：编辑 `reserved` 字段 → 重跑，分配器自动跳过含预留地址的网段；
- 首次运行由 `plan_builder` 以 plan.ipSegments 为默认写入，之后 `segments` 以本文件为准。
"""

import json
import os

SEG_KEYS = ('loopback', 'compute', 'storage', 'biz', 'oob', 'interconnect')


class AllocatorState:
    """地址分配器状态账本：读取（优先）+ 写回（保留用户编辑的 segments/reserved）。"""

    def __init__(self, project_dir: str):
        self.project_dir = project_dir
        self.path = os.path.join(project_dir, 'allocator_state.json')
        self.segments: dict = {}
        self.reserved: dict = {}
        self.allocated: dict = {}
        self._load()

    def _load(self):
        if not os.path.exists(self.path):
            return
        try:
            with open(self.path, encoding='utf-8') as f:
                data = json.load(f)
            self.segments = data.get('segments', {}) or {}
            self.reserved = data.get('reserved', {}) or {}
            self.allocated = data.get('allocated', {}) or {}
        except Exception:  # noqa: BLE001 状态文件损坏时以默认重建
            pass

    def effective_segments(self, plan_segments: dict) -> dict:
        """生效地址段：allocator_state.segments 优先，fallback 到 plan.ipSegments。"""
        if self.segments:
            return {k: self.segments.get(k, plan_segments.get(k)) for k in SEG_KEYS}
        return dict(plan_segments)

    def save(self, segments: dict, allocated: dict):
        """写回：segments/allocated 为本次运行值；reserved 保留用户编辑。"""
        if segments:
            self.segments = {k: segments.get(k) for k in SEG_KEYS if segments.get(k)}
        if allocated:
            self.allocated = allocated
        os.makedirs(self.project_dir, exist_ok=True)
        with open(self.path, 'w', encoding='utf-8') as f:
            json.dump({
                'version': 1,
                'segments': self.segments,
                'reserved': self.reserved,
                'allocated': self.allocated,
            }, f, ensure_ascii=False, indent=2)
