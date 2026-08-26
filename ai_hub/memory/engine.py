"""Agent v2 记忆引擎：用户画像 + 项目历史 + 操作习惯"""
import json
import logging
import threading
from pathlib import Path
from ai_hub.memory.schemas import UserProfile, ProjectHistory, OperationHabit, now_iso

logger = logging.getLogger(__name__)

# M7d（回灌 AL 增强）：写盘去抖窗口（秒）——高频 record 合并为一次落盘，降低磁盘 IO
_SAVE_DEBOUNCE = 0.8

class MemoryEngine:
    def __init__(self):
        self.memory_dir = Path(".")
        self.user_profile = UserProfile()
        self.project_histories: dict[str, ProjectHistory] = {}
        self.habits = OperationHabit()
        self._loaded = False
        # M7d: 去抖写盘状态（pending 数据 + 每文件定时器 + 锁）
        self._pending_saves: dict[str, dict] = {}
        self._save_timers: dict[str, threading.Timer] = {}
        self._save_lock = threading.Lock()

    def init_dir(self, base_dir: str):
        self.memory_dir = Path(base_dir) / "memory"
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        (self.memory_dir / "project_history").mkdir(parents=True, exist_ok=True)
        self._load_all()

    def _load_all(self):
        if self._loaded: return
        self._loaded = True
        for fname, cls in [("user_profile.json", UserProfile), ("habits.json", OperationHabit)]:
            path = self.memory_dir / fname
            if path.exists():
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                    setattr(self, fname.replace(".json", ""), cls(**data))
                except Exception as e:
                    logger.warning(f"Failed to load {fname}: {e}")
        ph_dir = self.memory_dir / "project_history"
        if ph_dir.exists():
            for f in ph_dir.glob("*.json"):
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                    self.project_histories[f.stem] = ProjectHistory(**data)
                except Exception as e:
                    logger.warning(f"Failed to load {f}: {e}")

    def update_user_profile(self, **kwargs):
        for k, v in kwargs.items():
            if hasattr(self.user_profile, k):
                setattr(self.user_profile, k, v)
        self.user_profile.updated_at = now_iso()
        self._save_json("user_profile.json", self.user_profile.__dict__)
        # M7d: 用户画像变更影响记忆 prompt，使会话内 system prompt 失效（下次对话刷新）
        from ai_hub.prompts.loader import invalidate_system_prompt_cache
        invalidate_system_prompt_cache()

    def record_operation(self, project_name: str, operation: str):
        if project_name not in self.project_histories:
            self.project_histories[project_name] = ProjectHistory(project_name=project_name)
        ph = self.project_histories[project_name]
        ph.last_operations.append(operation)
        if len(ph.last_operations) > 20:
            ph.last_operations = ph.last_operations[-20:]
        ph.updated_at = now_iso()
        # M7d: 去抖写盘（高频操作合并为一次落盘）
        self._schedule_save(f"project_history/{project_name}.json", ph.__dict__)

    # M7d: 去抖调度写盘
    def _schedule_save(self, rel_path: str, data: dict):
        self._pending_saves[rel_path] = data
        with self._save_lock:
            timer = self._save_timers.get(rel_path)
            if timer and timer.is_alive():
                timer.cancel()
            new_timer = threading.Timer(_SAVE_DEBOUNCE, self._flush_saves)
            new_timer.daemon = True
            self._save_timers[rel_path] = new_timer
            new_timer.start()

    # M7d: 落盘所有 pending 数据
    def _flush_saves(self):
        with self._save_lock:
            pending = dict(self._pending_saves)
            self._pending_saves.clear()
        for rel_path, data in pending.items():
            self._save_json(rel_path, data)
        with self._save_lock:
            self._save_timers = {k: t for k, t in self._save_timers.items() if t.is_alive()}

    # M7d: 程序退出前调用，确保去抖待写数据全部落盘（不丢失）
    def flush(self):
        with self._save_lock:
            for t in self._save_timers.values():
                try:
                    t.cancel()
                except Exception:
                    pass
        self._flush_saves()

    def get_memory_prompt(self, project_name: str = "") -> str:
        parts = []
        if self.user_profile.preferred_vendors:
            parts.append(f"- 常用厂商: {', '.join(self.user_profile.preferred_vendors)}")
        if project_name and project_name in self.project_histories:
            ph = self.project_histories[project_name]
            if ph.templates:
                parts.append(f"- 项目 {project_name} 模板: {', '.join(ph.templates)}")
        if parts:
            return "## 用户记忆\n" + "\n".join(parts)
        return ""

    def _save_json(self, rel_path: str, data: dict):
        try:
            path = self.memory_dir / rel_path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error(f"Failed to save {rel_path}: {e}")

_engine: MemoryEngine | None = None

def get_memory_engine() -> MemoryEngine:
    global _engine
    if _engine is None:
        _engine = MemoryEngine()
    return _engine