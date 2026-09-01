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

    def test_update_user_profile_triggers_prompt_invalidation(self, tmp_path):
        """4.3 F3-3（A-4）：用户画像变更应使会话内 system prompt 失效（下次对话刷新）"""
        eng = MemoryEngine()
        eng.init_dir(str(tmp_path))
        v0 = get_system_prompt_version()
        eng.update_user_profile(preferred_vendors=["huawei", "cisco"])
        assert get_system_prompt_version() == v0 + 1

    def test_multi_project_debounce_independent(self, tmp_path):
        """4.3 F3-3（A-4）：不同项目去抖独立、flush 后各自落盘"""
        eng = MemoryEngine()
        eng.init_dir(str(tmp_path))
        eng.record_operation("P1", "op1")
        eng.record_operation("P2", "op2")
        f1 = tmp_path / "memory" / "project_history" / "P1.json"
        f2 = tmp_path / "memory" / "project_history" / "P2.json"
        assert not f1.exists() and not f2.exists()
        eng.flush()
        assert f1.exists() and f2.exists()
        assert json.loads(f1.read_text(encoding="utf-8"))["last_operations"] == ["op1"]
        assert json.loads(f2.read_text(encoding="utf-8"))["last_operations"] == ["op2"]

    def test_flush_is_idempotent(self, tmp_path):
        """4.3 F3-3（A-4）：重复 flush 不重复写、不抛错"""
        eng = MemoryEngine()
        eng.init_dir(str(tmp_path))
        eng.record_operation("P3", "x")
        eng.flush()
        eng.flush()
        f = tmp_path / "memory" / "project_history" / "P3.json"
        assert f.exists()
        data = json.loads(f.read_text(encoding="utf-8"))
        assert data["last_operations"] == ["x"]

    def test_debounce_merges_burst_operations(self, tmp_path):
        """4.3 F3-3（A-4）：高频 burst 合并为一次落盘（不丢操作）"""
        eng = MemoryEngine()
        eng.init_dir(str(tmp_path))
        for i in range(50):
            eng.record_operation("P4", f"op{i}")
        f = tmp_path / "memory" / "project_history" / "P4.json"
        assert not f.exists()  # 去抖窗口内未写盘
        eng.flush()
        data = json.loads(f.read_text(encoding="utf-8"))
        # 仅保留最近 20 条（与 record_operation 上限一致）
        assert data["last_operations"] == [f"op{i}" for i in range(30, 50)]
