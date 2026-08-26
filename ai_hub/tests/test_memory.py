"""AI Hub 记忆引擎测试（M7d：去抖写盘 + flush + system prompt 缓存失效）"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.memory.engine import MemoryEngine, _SAVE_DEBOUNCE
from ai_hub.prompts.loader import invalidate_system_prompt_cache, get_system_prompt_version


class TestMemoryDebounce:
    def test_profile_write_immediate(self, tmp_path):
        eng = MemoryEngine()
        eng.init_dir(str(tmp_path))
        eng.update_user_profile(preferred_vendors=["huawei"])
        assert os.path.exists(tmp_path / "memory" / "user_profile.json")

    def test_record_operation_debounced_then_flush(self, tmp_path):
        eng = MemoryEngine()
        eng.init_dir(str(tmp_path))
        # 高频操作：去抖窗口内不落盘
        eng.record_operation("P1", "op1")
        eng.record_operation("P1", "op2")
        fpath = tmp_path / "memory" / "project_history" / "P1.json"
        assert not fpath.exists()  # 去抖窗口内未立即写盘
        # flush 强制落盘
        eng.flush()
        assert fpath.exists()
        data = json.loads(fpath.read_text(encoding="utf-8"))
        assert data["last_operations"] == ["op1", "op2"]

    def test_flush_cancels_timers(self, tmp_path):
        eng = MemoryEngine()
        eng.init_dir(str(tmp_path))
        eng.record_operation("P2", "x")
        eng.flush()
        # flush 后定时器已取消，等待窗口后仍应已写盘（由 flush 完成）
        fpath = tmp_path / "memory" / "project_history" / "P2.json"
        assert fpath.exists()

    def test_prompt_cache_invalidation(self):
        v0 = get_system_prompt_version()
        invalidate_system_prompt_cache()
        assert get_system_prompt_version() == v0 + 1
