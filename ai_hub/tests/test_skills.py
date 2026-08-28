"""AI Hub 技能引擎测试：加载/落盘/prompt 拼装/reload/使用统计

覆盖维度（PRD v3.0 AI-6 / 技能）：
- load_all：从 skills/*.md 加载技能（名称=文件名 stem）
- save_skill：落盘到 SKILLS_DIR，名称清洗（空格/斜杠 → 连字符）
- get_skills_prompt：拼装"可用技能"块，禁用技能不输出，空技能返回空串
- reload：重新扫描磁盘（删除后的技能不再残留）
- record_usage：使用次数/最后使用时间统计
- delete_skill：正式删除 API（返回 bool），删除后文件消失/prompt 不含该技能/reload 不残留，
  不存在的技能返回 False 不崩溃，拒绝路径穿越（含 .. 的名称）

缺口记录：删除维度已由正式 delete_skill API 覆盖。
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.skills import engine as skills_engine
from ai_hub.skills.engine import SkillsEngine


def _make_engine(tmp_path, monkeypatch) -> SkillsEngine:
    monkeypatch.setattr(skills_engine, "SKILLS_DIR", tmp_path)
    return SkillsEngine()


# --- load_all ---

def test_load_all_from_skills_dir(tmp_path, monkeypatch):
    (tmp_path / "alpha.md").write_text("技能A内容", encoding="utf-8")
    (tmp_path / "beta.md").write_text("技能B内容", encoding="utf-8")
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    assert set(eng.skills.keys()) == {"alpha", "beta"}
    assert eng.skills["alpha"].content == "技能A内容"
    assert eng.skills["beta"].content == "技能B内容"


def test_load_all_missing_dir_no_crash(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path / "not_exists", monkeypatch)
    eng.load_all()
    assert eng.skills == {}


def test_load_all_ignores_non_md(tmp_path, monkeypatch):
    (tmp_path / "alpha.md").write_text("A", encoding="utf-8")
    (tmp_path / "readme.txt").write_text("x", encoding="utf-8")
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    assert set(eng.skills.keys()) == {"alpha"}


# --- save_skill ---

def test_save_skill_writes_file_and_registers(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    skill = eng.save_skill("my skill", "技能内容XYZ")
    assert skill.name == "my-skill"
    assert (tmp_path / "my-skill.md").exists()
    assert (tmp_path / "my-skill.md").read_text(encoding="utf-8") == "技能内容XYZ"
    assert eng.skills["my-skill"].content == "技能内容XYZ"


def test_save_skill_sanitizes_slash(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    skill = eng.save_skill("a/b", "内容")
    assert skill.name == "a-b"
    assert (tmp_path / "a-b.md").exists()


# --- get_skills_prompt ---

def test_get_skills_prompt_assembles_available_skills(tmp_path, monkeypatch):
    (tmp_path / "alpha.md").write_text("技能A内容", encoding="utf-8")
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    prompt = eng.get_skills_prompt()
    assert "可用技能" in prompt
    assert "## 技能: alpha" in prompt
    assert "技能A内容" in prompt


def test_get_skills_prompt_disabled_skill_excluded(tmp_path, monkeypatch):
    (tmp_path / "alpha.md").write_text("A", encoding="utf-8")
    (tmp_path / "beta.md").write_text("B", encoding="utf-8")
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    eng.skills["beta"].enabled = False
    prompt = eng.get_skills_prompt()
    assert "## 技能: alpha" in prompt
    assert "beta" not in prompt


def test_get_skills_prompt_empty_when_no_skills(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    assert eng.get_skills_prompt() == ""


# --- reload（删除维度间接覆盖） ---

def test_reload_clears_removed_skills(tmp_path, monkeypatch):
    (tmp_path / "alpha.md").write_text("A", encoding="utf-8")
    (tmp_path / "beta.md").write_text("B", encoding="utf-8")
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    assert "alpha" in eng.skills and "beta" in eng.skills
    # 删除磁盘文件后 reload 不应残留
    (tmp_path / "alpha.md").unlink()
    eng.reload()
    assert "alpha" not in eng.skills
    assert "beta" in eng.skills


# --- record_usage ---

def test_record_usage_tracks_count_and_last_used(tmp_path, monkeypatch):
    (tmp_path / "alpha.md").write_text("A", encoding="utf-8")
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    eng.record_usage("alpha")
    eng.record_usage("alpha")
    assert eng.skills["alpha"].use_count == 2
    assert eng.skills["alpha"].last_used != ""


def test_record_usage_unknown_skill_no_crash(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.record_usage("no_such_skill")  # 不应抛异常


# --- delete_skill ---

def test_delete_skill_removes_file_and_prompt(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.save_skill("alpha", "技能内容A")
    assert (tmp_path / "alpha.md").exists()
    assert eng.delete_skill("alpha") is True
    assert not (tmp_path / "alpha.md").exists()
    assert "alpha" not in eng.skills
    assert "alpha" not in eng.get_skills_prompt()


def test_delete_skill_missing_returns_false(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    assert eng.delete_skill("no_such_skill") is False


def test_delete_skill_no_residue_after_reload(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.save_skill("alpha", "技能内容A")
    eng.save_skill("beta", "技能内容B")
    assert eng.delete_skill("alpha") is True
    eng.reload()
    assert "alpha" not in eng.skills
    assert "beta" in eng.skills


def test_delete_skill_rejects_path_traversal(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.save_skill("alpha", "技能内容A")
    # 路径穿越名称（含 ..）应被拒绝，不删除任何文件
    assert eng.delete_skill("../alpha") is False
    assert eng.delete_skill("..\\alpha") is False
    assert (tmp_path / "alpha.md").exists()
    assert not (tmp_path.parent / "alpha.md").exists()
    assert not (tmp_path.parent / ".." / "alpha.md").exists()
