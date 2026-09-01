"""4.3 F3-3（测试计划 A-4）：技能库补齐——skills list/详情/启用禁用（持久化）

覆盖：
- list_skills：返回全部技能元信息（含启用状态/使用统计）
- get_skill：单个技能详情（含内容）
- set_enabled / enable / disable：启用状态切换 + 磁盘 .disabled 标记持久化
- load_all：重启后从 .disabled 标记恢复禁用状态
- 技能可被 AI 工具调用（list_skills/get_skill/enable_skill/disable_skill）见 test_skill_tools.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.skills import engine as skills_engine
from ai_hub.skills.engine import SkillsEngine


def _make_engine(tmp_path, monkeypatch) -> SkillsEngine:
    monkeypatch.setattr(skills_engine, "SKILLS_DIR", tmp_path)
    return SkillsEngine()


# --- list_skills ---

def test_list_skills_returns_metadata(tmp_path, monkeypatch):
    (tmp_path / "alpha.md").write_text("A内容", encoding="utf-8")
    (tmp_path / "beta.md").write_text("B内容", encoding="utf-8")
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    items = eng.list_skills()
    names = {i["name"] for i in items}
    assert names == {"alpha", "beta"}
    for i in items:
        assert i["enabled"] is True
        assert i["use_count"] == 0
        assert "last_used" in i


def test_list_skills_empty(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    assert eng.list_skills() == []


# --- get_skill ---

def test_get_skill_returns_detail(tmp_path, monkeypatch):
    (tmp_path / "alpha.md").write_text("A内容", encoding="utf-8")
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    detail = eng.get_skill("alpha")
    assert detail is not None
    assert detail["name"] == "alpha"
    assert detail["content"] == "A内容"
    assert detail["enabled"] is True


def test_get_skill_missing_returns_none(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    assert eng.get_skill("no_such") is None


# --- set_enabled / enable / disable（含持久化）---

def test_disable_skill_persists_marker(tmp_path, monkeypatch):
    (tmp_path / "alpha.md").write_text("A内容", encoding="utf-8")
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    eng.set_enabled("alpha", False)
    assert eng.skills["alpha"].enabled is False
    assert (tmp_path / "alpha.md.disabled").exists()
    # 禁用后 prompt 不含该技能
    assert "alpha" not in eng.get_skills_prompt()


def test_enable_skill_removes_marker(tmp_path, monkeypatch):
    (tmp_path / "alpha.md").write_text("A内容", encoding="utf-8")
    (tmp_path / "alpha.md.disabled").write_text("", encoding="utf-8")
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    eng.set_enabled("alpha", True)
    assert eng.skills["alpha"].enabled is True
    assert not (tmp_path / "alpha.md.disabled").exists()


def test_enable_disable_helpers(tmp_path, monkeypatch):
    (tmp_path / "alpha.md").write_text("A内容", encoding="utf-8")
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    assert eng.disable_skill("alpha") is True
    assert eng.skills["alpha"].enabled is False
    assert eng.enable_skill("alpha") is True
    assert eng.skills["alpha"].enabled is True


def test_set_enabled_unknown_skill_returns_false(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    assert eng.set_enabled("no_such", False) is False


def test_load_all_restores_disabled_state(tmp_path, monkeypatch):
    (tmp_path / "alpha.md").write_text("A内容", encoding="utf-8")
    (tmp_path / "beta.md").write_text("B内容", encoding="utf-8")
    (tmp_path / "beta.md.disabled").write_text("", encoding="utf-8")
    eng = _make_engine(tmp_path, monkeypatch)
    eng.load_all()
    assert eng.skills["alpha"].enabled is True
    assert eng.skills["beta"].enabled is False
