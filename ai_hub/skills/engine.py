"""Agent v2 技能引擎：Skill 加载/管理/半自动生成"""
import logging
from pathlib import Path

logger = logging.getLogger(__name__)
SKILLS_DIR = Path(__file__).parent / "skills"

class Skill:
    def __init__(self, name: str, file_path: Path, content: str):
        self.name = name
        self.file_path = file_path
        self.content = content
        self.enabled = True
        self.use_count = 0
        self.last_used: str = ""

    def get_prompt_text(self) -> str:
        return f"\n## 技能: {self.name}\n\n{self.content}\n"

class SkillsEngine:
    def __init__(self):
        self.skills: dict[str, Skill] = {}
        self._loaded = False

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
        safe_name = name.lower().replace(" ", "-").replace("/", "-")
        file_path = SKILLS_DIR / f"{safe_name}.md"
        file_path.write_text(content, encoding="utf-8")
        skill = Skill(name=safe_name, file_path=file_path, content=content)
        self.skills[safe_name] = skill
        return skill

    def delete_skill(self, name: str) -> bool:
        """删除技能文件，返回是否删除成功；不存在的技能返回 False 不抛错。

        复用 save_skill 的名称清洗，并额外防护路径穿越：
        拒绝空名、含 .. 或 \\ 的名称（../ 等穿越攻击直接返回 False）。
        """
        safe_name = name.lower().replace(" ", "-").replace("/", "-")
        if not safe_name or ".." in safe_name or "\\" in safe_name:
            return False
        file_path = SKILLS_DIR / f"{safe_name}.md"
        if not file_path.exists():
            return False
        try:
            file_path.unlink()
        except OSError:
            return False
        self.skills.pop(safe_name, None)
        return True

    def record_usage(self, name: str):
        if name in self.skills:
            self.skills[name].use_count += 1
            from datetime import datetime
            self.skills[name].last_used = datetime.now().isoformat()

    # ====== 4.3 F3-3：技能库补齐（skills list / 详情 / 启用禁用）======

    def list_skills(self) -> list[dict]:
        """返回全部技能元信息（名称/启用状态/使用统计）"""
        return [
            {
                "name": skill.name,
                "enabled": skill.enabled,
                "use_count": skill.use_count,
                "last_used": skill.last_used,
                "file_path": str(skill.file_path),
            }
            for skill in self.skills.values()
        ]

    def get_skill(self, name: str) -> dict | None:
        """返回单个技能详情（含内容）；不存在返回 None"""
        safe_name = name.lower().replace(" ", "-").replace("/", "-")
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
        }

    def set_enabled(self, name: str, enabled: bool) -> bool:
        """启用/禁用技能并持久化（写/删 .disabled 标记文件）；技能不存在返回 False"""
        safe_name = name.lower().replace(" ", "-").replace("/", "-")
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

_engine: SkillsEngine | None = None

def get_skills_engine() -> SkillsEngine:
    global _engine
    if _engine is None:
        _engine = SkillsEngine()
        _engine.load_all()
    return _engine