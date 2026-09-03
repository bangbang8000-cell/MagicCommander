"""Agent v2 技能引擎：Skill 加载/管理/半自动生成 + 5.0.3-503-b 技能自学习闭环

- Skill 元数据：伴生 <name>.meta.json（保持 skills/*.md 纯 md 兼容），含反馈统计/修订记录。
- record_feedback(name, success, detail)：持久化反馈样本（成功/失败次数、最近样本、成功率）。
- maybe_self_improve(name)：达阈值（失败次数/失败率）自动追加结构化「自学习改进记录」到技能 md 尾部。
"""
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)
SKILLS_DIR = Path(__file__).parent / "skills"

# ============================================================
# 5.0.3-503-b：自学习阈值（保守：达阈值才修订技能定义）
# ============================================================
SKILL_FEEDBACK_MIN_SAMPLES = 5          # 最少样本数才触发自学习
SKILL_FEEDBACK_FAIL_RATE_THRESHOLD = 0.4  # 失败率阈值（>= 触发修订）
SKILL_FEEDBACK_FAIL_COUNT_THRESHOLD = 3   # 失败次数阈值（>= 触发修订）
SKILL_FEEDBACK_MAX_SAMPLES = 20          # 最近样本保留上限
SKILL_META_SCHEMA = "mc.skill-meta/1"


class Skill:
    def __init__(self, name: str, file_path: Path, content: str):
        self.name = name
        self.file_path = file_path
        self.content = content
        self.enabled = True
        self.use_count = 0
        self.last_used: str = ""
        # 5.0.3-503-b：技能级元数据（伴生 meta 文件；保持 .md 纯文本兼容）
        self.revision: int = 0
        self.feedback: dict = _empty_feedback()

    def get_prompt_text(self) -> str:
        return f"\n## 技能: {self.name}\n\n{self.content}\n"


def _empty_feedback() -> dict:
    return {
        "success_count": 0,
        "fail_count": 0,
        "total": 0,
        "success_rate": 0.0,
        "recent_samples": [],
        "updated_at": "",
    }


def _now() -> str:
    from datetime import datetime
    return datetime.now().isoformat()


class SkillsEngine:
    def __init__(self):
        self.skills: dict[str, Skill] = {}
        self._loaded = False

    # ---- 文件路径辅助 ----
    def _safe_name(self, name: str) -> str:
        return name.lower().replace(" ", "-").replace("/", "-")

    def _meta_path(self, safe_name: str) -> Path:
        return Path(SKILLS_DIR) / f"{safe_name}.meta.json"

    def _load_meta(self, skill: Skill) -> None:
        """加载伴生 meta（反馈统计/修订版本）；缺失/损坏时保持默认。"""
        meta_path = self._meta_path(skill.name)
        if not meta_path.exists():
            return
        try:
            data = json.loads(meta_path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                return
            skill.revision = int(data.get("revision") or 0)
            fb = data.get("feedback")
            if isinstance(fb, dict):
                skill.feedback = _empty_feedback()
                skill.feedback.update({k: v for k, v in fb.items() if k in _empty_feedback()})
        except (OSError, ValueError) as e:
            logger.warning(f"Failed to load skill meta {meta_path}: {e}")

    def _save_meta(self, skill: Skill) -> bool:
        """写回伴生 meta；失败不抛错（反馈采集不应阻断主流程）。"""
        try:
            meta_path = self._meta_path(skill.name)
            meta_path.parent.mkdir(parents=True, exist_ok=True)
            meta_path.write_text(json.dumps({
                "schema": SKILL_META_SCHEMA,
                "name": skill.name,
                "revision": skill.revision,
                "feedback": skill.feedback,
            }, ensure_ascii=False, indent=2), encoding="utf-8")
            return True
        except OSError as e:
            logger.error(f"Failed to save skill meta {skill.name}: {e}")
            return False

    # ---- 加载/保存 ----
    def load_all(self):
        if self._loaded: return
        self._loaded = True
        if not SKILLS_DIR.exists(): return
        for md_file in SKILLS_DIR.glob("*.md"):
            try:
                content = md_file.read_text(encoding="utf-8")
                name = md_file.stem
                skill = Skill(name=name, file_path=md_file, content=content)
                # 4.3 F3-3：恢复 .disabled 标记的禁用状态（跨重启保留）
                if (md_file.parent / f"{md_file.name}.disabled").exists():
                    skill.enabled = False
                self._load_meta(skill)
                self.skills[name] = skill
            except Exception as e:
                logger.error(f"Failed to load skill {md_file}: {e}")
        logger.info(f"Loaded {len(self.skills)} skills")

    def get_skills_prompt(self) -> str:
        if not self.skills: return ""
        parts = ["\n## 可用技能\n"]
        for skill in self.skills.values():
            if skill.enabled:
                parts.append(skill.get_prompt_text())
        return "\n".join(parts)

    def reload(self):
        self.skills.clear()
        self._loaded = False
        self.load_all()

    def save_skill(self, name: str, content: str) -> Skill:
        safe_name = self._safe_name(name)
        file_path = SKILLS_DIR / f"{safe_name}.md"
        # 5.0.3-503-b：覆盖前保留既有技能元数据（反馈统计/修订版本不丢）
        existing = self.skills.get(safe_name)
        old_meta = None
        if existing is not None:
            old_meta = {"revision": existing.revision, "feedback": existing.feedback}
        file_path.write_text(content, encoding="utf-8")
        skill = Skill(name=safe_name, file_path=file_path, content=content)
        if old_meta:
            skill.revision = old_meta["revision"]
            skill.feedback = old_meta["feedback"]
            self._save_meta(skill)
        self.skills[safe_name] = skill
        return skill

    def delete_skill(self, name: str) -> bool:
        """删除技能文件（含伴生 meta），返回是否删除成功；不存在的技能返回 False 不抛错。

        复用 save_skill 的名称清洗，并额外防护路径穿越：
        拒绝空名、含 .. 或 \\ 的名称（../ 等穿越攻击直接返回 False）。
        """
        safe_name = self._safe_name(name)
        if not safe_name or ".." in safe_name or "\\" in safe_name:
            return False
        file_path = SKILLS_DIR / f"{safe_name}.md"
        if not file_path.exists():
            return False
        try:
            file_path.unlink()
            meta_path = self._meta_path(safe_name)
            if meta_path.exists():
                meta_path.unlink()
        except OSError:
            return False
        self.skills.pop(safe_name, None)
        return True

    def record_usage(self, name: str):
        if name in self.skills:
            self.skills[name].use_count += 1
            self.skills[name].last_used = _now()

    # ====== 4.3 F3-3：技能库补齐（skills list / 详情 / 启用禁用）======

    def list_skills(self) -> list[dict]:
        """返回全部技能元信息（名称/启用状态/使用统计/反馈统计）"""
        return [
            {
                "name": skill.name,
                "enabled": skill.enabled,
                "use_count": skill.use_count,
                "last_used": skill.last_used,
                "file_path": str(skill.file_path),
                "revision": skill.revision,
                "feedback": skill.feedback,
            }
            for skill in self.skills.values()
        ]

    def get_skill(self, name: str) -> dict | None:
        """返回单个技能详情（含内容/反馈统计）；不存在返回 None"""
        safe_name = self._safe_name(name)
        skill = self.skills.get(safe_name)
        if not skill:
            return None
        return {
            "name": skill.name,
            "enabled": skill.enabled,
            "content": skill.content,
            "use_count": skill.use_count,
            "last_used": skill.last_used,
            "file_path": str(skill.file_path),
            "revision": skill.revision,
            "feedback": skill.feedback,
        }

    def set_enabled(self, name: str, enabled: bool) -> bool:
        """启用/禁用技能并持久化（写/删 .disabled 标记文件）；技能不存在返回 False"""
        safe_name = self._safe_name(name)
        skill = self.skills.get(safe_name)
        if not skill:
            return False
        skill.enabled = bool(enabled)
        marker = Path(str(skill.file_path) + ".disabled")
        try:
            if skill.enabled:
                if marker.exists():
                    marker.unlink()
            else:
                marker.write_text("", encoding="utf-8")
        except OSError as e:
            logger.error(f"Failed to persist skill enable state {name}: {e}")
            return False
        return True

    def enable_skill(self, name: str) -> bool:
        return self.set_enabled(name, True)

    def disable_skill(self, name: str) -> bool:
        return self.set_enabled(name, False)

    # ====== 5.0.3-503-b：技能自学习闭环（反馈采集 / 成功率 / 自学习修订）======

    def record_feedback(self, name: str, success: bool, detail: str = "") -> dict:
        """持久化一条反馈样本（成功/失败计数、最近样本、成功率）。

        - name 可为技能名或工具名（工具域反馈同样持久化到伴生 meta，供自学习参考）。
        - 返回该名称最新反馈统计；技能不存在/写入失败不抛错（采集不阻断主流程）。
        """
        safe_name = self._safe_name(name)
        skill = self.skills.get(safe_name)
        if skill is None:
            # 工具域反馈：不落在 skills 内存，仅写入伴生 meta（无 .md 也允许）
            skill = Skill(name=safe_name, file_path=SKILLS_DIR / f"{safe_name}.md", content="")
            self._load_meta(skill)
        fb = skill.feedback
        fb["success_count"] = int(fb.get("success_count") or 0) + (1 if success else 0)
        fb["fail_count"] = int(fb.get("fail_count") or 0) + (0 if success else 1)
        total = fb["success_count"] + fb["fail_count"]
        fb["total"] = total
        fb["success_rate"] = round(fb["success_count"] / total, 4) if total else 0.0
        samples = fb.get("recent_samples") or []
        samples.append({"success": bool(success), "detail": str(detail)[:500], "at": _now()})
        fb["recent_samples"] = samples[-SKILL_FEEDBACK_MAX_SAMPLES:]
        fb["updated_at"] = _now()
        self._save_meta(skill)
        return dict(fb)

    def get_feedback(self, name: str) -> dict:
        """返回指定名称（技能/工具）的反馈统计；无记录返回空统计。"""
        safe_name = self._safe_name(name)
        skill = self.skills.get(safe_name)
        if skill is None:
            probe = Skill(name=safe_name, file_path=SKILLS_DIR / f"{safe_name}.md", content="")
            self._load_meta(probe)
            return dict(probe.feedback)
        return dict(skill.feedback)

    def append_self_improvement(self, name: str, note: str) -> bool:
        """向技能 md 尾部追加一条结构化「自学习改进记录」，并递增修订版本。

        保守策略：仅追加（不改写既有内容），保证可回滚/可审计。
        返回是否成功追加；技能不存在返回 False。
        """
        safe_name = self._safe_name(name)
        skill = self.skills.get(safe_name)
        if not skill:
            return False
        from datetime import datetime
        stamp = datetime.now().isoformat()
        record = (
            f"\n---\n\n## 📈 自学习改进记录（修订 v{skill.revision + 1} · {stamp}）\n\n"
            f"{note.strip()}\n"
        )
        skill.content = skill.content.rstrip() + record
        try:
            skill.file_path.write_text(skill.content, encoding="utf-8")
        except OSError as e:
            logger.error(f"Failed to append self-improvement to {safe_name}: {e}")
            return False
        skill.revision += 1
        self._save_meta(skill)
        return True

    def maybe_self_improve(self, name: str) -> dict:
        """自学习触发器：达阈值（样本数 + 失败次数/失败率）自动修订技能定义。

        返回 {"revised": bool, "reason": str, "revision": int, "feedback": {...}}。
        保守策略：满足以下任一条件才追加改进记录——
        - total >= MIN_SAMPLES 且 fail_count >= FAIL_COUNT_THRESHOLD
        - total >= MIN_SAMPLES 且 success_rate < (1 - FAIL_RATE_THRESHOLD)
        """
        safe_name = self._safe_name(name)
        skill = self.skills.get(safe_name)
        if not skill:
            return {"revised": False, "reason": "技能不存在", "revision": 0, "feedback": self.get_feedback(safe_name)}
        fb = skill.feedback
        total = int(fb.get("total") or 0)
        fail_count = int(fb.get("fail_count") or 0)
        success_rate = float(fb.get("success_rate") or 0.0)
        reason = ""
        if total < SKILL_FEEDBACK_MIN_SAMPLES:
            reason = f"样本不足（{total}/{SKILL_FEEDBACK_MIN_SAMPLES}），未触发自学习"
        elif fail_count >= SKILL_FEEDBACK_FAIL_COUNT_THRESHOLD:
            reason = f"失败次数达阈值（{fail_count} >= {SKILL_FEEDBACK_FAIL_COUNT_THRESHOLD}）"
        elif success_rate < 1 - SKILL_FEEDBACK_FAIL_RATE_THRESHOLD:
            reason = f"成功率过低（{success_rate:.0%} < {1 - SKILL_FEEDBACK_FAIL_RATE_THRESHOLD:.0%}）"
        else:
            reason = "质量达标，无需修订"
        if reason.startswith(("样本不足", "质量达标")):
            return {"revised": False, "reason": reason, "revision": skill.revision, "feedback": dict(fb)}
        note = (
            f"自学习触发：{reason}。\n"
            f"- 反馈统计：成功 {fb['success_count']} / 失败 {fail_count} / 成功率 {success_rate:.0%}\n"
            f"- 最近失败样本：\n"
        )
        failed = [s for s in fb.get("recent_samples") or [] if not s.get("success")][-5:]
        for s in failed:
            note += f"  - {s.get('detail') or '（无详情）'}\n"
        note += "- 改进方向：复盘失败样本，补充失败场景的规避步骤与参数校验注意事项。\n"
        ok = self.append_self_improvement(safe_name, note)
        return {
            "revised": ok,
            "reason": reason,
            "revision": skill.revision,
            "feedback": dict(skill.feedback),
        }


_engine: SkillsEngine | None = None

def get_skills_engine() -> SkillsEngine:
    global _engine
    if _engine is None:
        _engine = SkillsEngine()
        _engine.load_all()
    return _engine
