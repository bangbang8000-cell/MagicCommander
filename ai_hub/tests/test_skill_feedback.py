"""5.0.3-503-b：技能自学习闭环测试（反馈持久化 / 成功率 / 自学习修订 / run_stream 接线 / skill_optimize 工具 / 传输兼容）

覆盖：
- record_feedback：成功/失败计数、成功率、最近样本（含上限截断）、持久化（reload 恢复）
- save_skill 保留既有技能元数据（覆盖内容不丢反馈/修订）
- delete_skill 连带删除伴生 meta
- maybe_self_improve：达阈值（失败次数/失败率）修订技能定义（追加改进记录 + 递增修订版本）；
  样本不足/质量达标不修订
- run_stream 接线：get_skill 工具执行 → record_usage + record_feedback；失败工具 → 失败样本
- skill_optimize 工具：注册/权限/执行（触发自学习修订）
- transfer：导出含技能级元数据、导入还原 meta、旧包（v1）兼容导入
"""
import asyncio
import json
import os
import sys
from unittest import mock

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from ai_hub.skills.engine import (
    get_skills_engine,
    SKILL_FEEDBACK_MIN_SAMPLES,
)


def setup_module():
    """工具注册表需 init_tools（与 test_skill_tools 一致）"""
    from ai_hub.agent.tools import init_tools
    init_tools()


@pytest.fixture
def isolated_skills(tmp_path, monkeypatch):
    """将技能引擎隔离到临时目录（不触碰真实技能库）。"""
    import ai_hub.skills.engine as skills_engine
    orig_dir = skills_engine.SKILLS_DIR
    orig_engine = skills_engine._engine
    skills_engine.SKILLS_DIR = tmp_path
    skills_engine._engine = None
    yield tmp_path
    skills_engine.SKILLS_DIR = orig_dir
    skills_engine._engine = orig_engine


def _seed_skill(name="alpha", content="技能A内容"):
    eng = get_skills_engine()
    if not eng.skills:
        eng.load_all()
    if name not in eng.skills:
        eng.save_skill(name, content)
    return eng.skills[name]


# ============================================================
# record_feedback：计数 / 成功率 / 样本
# ============================================================

class TestRecordFeedback:
    def test_record_success_and_failure_counts(self, isolated_skills):
        _seed_skill("alpha")
        eng = get_skills_engine()
        eng.record_feedback("alpha", True, "创建成功")
        eng.record_feedback("alpha", True, "创建成功")
        eng.record_feedback("alpha", False, "参数缺失")
        fb = eng.get_feedback("alpha")
        assert fb["success_count"] == 2
        assert fb["fail_count"] == 1
        assert fb["total"] == 3
        assert fb["success_rate"] == pytest.approx(2 / 3, abs=1e-3)
        assert len(fb["recent_samples"]) == 3
        assert fb["recent_samples"][-1]["detail"] == "参数缺失"
        assert fb["recent_samples"][-1]["success"] is False

    def test_feedback_persists_across_reload(self, isolated_skills):
        _seed_skill("alpha")
        eng = get_skills_engine()
        eng.record_feedback("alpha", False, "失败样本")
        assert (isolated_skills / "alpha.meta.json").exists()
        # 重新加载：从伴生 meta 恢复统计
        eng.reload()
        fb = get_skills_engine().get_feedback("alpha")
        assert fb["fail_count"] == 1
        assert fb["total"] == 1

    def test_recent_samples_capped(self, isolated_skills):
        from ai_hub.skills.engine import SKILL_FEEDBACK_MAX_SAMPLES
        _seed_skill("alpha")
        eng = get_skills_engine()
        for i in range(30):
            eng.record_feedback("alpha", i % 2 == 0, f"样本{i}")
        fb = eng.get_feedback("alpha")
        assert len(fb["recent_samples"]) == SKILL_FEEDBACK_MAX_SAMPLES

    def test_record_feedback_unknown_name_persists_tool_domain(self, isolated_skills):
        eng = get_skills_engine()
        fb = eng.record_feedback("render_config", True, "工具成功")
        assert fb["success_count"] == 1
        assert get_skills_engine().get_feedback("render_config")["total"] == 1


# ============================================================
# save_skill / delete_skill 与元数据
# ============================================================

class TestSkillMetaLifecycle:
    def test_save_skill_preserves_feedback(self, isolated_skills):
        eng = get_skills_engine()
        eng.save_skill("alpha", "v1")
        eng.record_feedback("alpha", False, "失败")
        eng.record_feedback("alpha", True, "成功")
        # 覆盖内容 → 反馈/修订保留
        skill = eng.save_skill("alpha", "v2")
        assert skill.content == "v2"
        assert skill.feedback["total"] == 2
        assert skill.revision == 0

    def test_delete_skill_removes_meta(self, isolated_skills):
        eng = get_skills_engine()
        eng.save_skill("alpha", "v1")
        eng.record_feedback("alpha", False, "x")
        assert (isolated_skills / "alpha.meta.json").exists()
        assert eng.delete_skill("alpha") is True
        assert not (isolated_skills / "alpha.meta.json").exists()


# ============================================================
# maybe_self_improve：自学习修订
# ============================================================

class TestMaybeSelfImprove:
    def test_insufficient_samples_no_revision(self, isolated_skills):
        _seed_skill("alpha")
        eng = get_skills_engine()
        for _ in range(SKILL_FEEDBACK_MIN_SAMPLES - 1):
            eng.record_feedback("alpha", False, "失败")
        result = eng.maybe_self_improve("alpha")
        assert result["revised"] is False
        assert "样本不足" in result["reason"]
        assert "自学习改进记录" not in eng.skills["alpha"].content

    def test_fail_count_threshold_triggers_revision(self, isolated_skills):
        _seed_skill("alpha")
        eng = get_skills_engine()
        for _ in range(SKILL_FEEDBACK_MIN_SAMPLES):
            eng.record_feedback("alpha", False, "重复失败样本")
        result = eng.maybe_self_improve("alpha")
        assert result["revised"] is True
        assert "失败次数达阈值" in result["reason"]
        # 技能定义尾部追加结构化改进记录 + 修订版本递增
        assert "自学习改进记录" in eng.skills["alpha"].content
        assert eng.skills["alpha"].revision == 1
        assert (isolated_skills / "alpha.meta.json").exists()

    def test_low_success_rate_triggers_revision(self, isolated_skills, monkeypatch):
        # 提高失败次数阈值到 100，仅让「成功率过低」分支触发（10 样本 4 成功 → 40%）
        import ai_hub.skills.engine as eng_mod
        monkeypatch.setattr(eng_mod, "SKILL_FEEDBACK_FAIL_COUNT_THRESHOLD", 100)
        _seed_skill("alpha")
        eng = get_skills_engine()
        for i in range(10):
            eng.record_feedback("alpha", i < 4, f"样本{i}")
        result = eng.maybe_self_improve("alpha")
        assert result["revised"] is True
        assert "成功率过低" in result["reason"]

    def test_quality_ok_no_revision(self, isolated_skills):
        _seed_skill("alpha")
        eng = get_skills_engine()
        for _ in range(10):
            eng.record_feedback("alpha", True, "成功")
        result = eng.maybe_self_improve("alpha")
        assert result["revised"] is False
        assert "质量达标" in result["reason"]

    def test_unknown_skill_returns_not_revised(self, isolated_skills):
        result = get_skills_engine().maybe_self_improve("no_such")
        assert result["revised"] is False
        assert "技能不存在" in result["reason"]


# ============================================================
# run_stream 接线：反馈采集
# ============================================================

class MockStreamProvider:
    last_reasoning_content = ""

    def __init__(self, chunks):
        self._chunks = list(chunks)

    async def chat_stream(self, messages, system_prompt="", temperature=0.7, max_tokens=4096):
        for c in self._chunks:
            yield c


TOOL_GET_SKILL = (
    '<tool_calls><invoke name="get_skill">'
    '<parameter name="skillName">alpha</parameter>'
    "</invoke></tool_calls>"
)
TOOL_LIST = "<tool_calls><invoke name=\"list_projects\"></invoke></tool_calls>"


class TestRunStreamFeedbackWiring:
    def _collect(self, session):
        async def run():
            out = []
            async for c in session.run_stream(max_tool_rounds=1):
                out.append(c)
            return out
        return asyncio.run(run())

    def test_skill_tool_records_usage_and_success_feedback(self, isolated_skills):
        from ai_hub.agent.agent import AgentSession
        _seed_skill("alpha")
        session = AgentSession()
        session.provider = MockStreamProvider([TOOL_GET_SKILL])

        async def fake_execute(name, args):
            return {"success": True, "result": "技能内容"}

        with mock.patch("ai_hub.agent.agent.execute_tool", new=fake_execute):
            self._collect(session)
        eng = get_skills_engine()
        assert eng.skills["alpha"].use_count == 1
        assert eng.get_feedback("alpha")["success_count"] == 1

    def test_failed_tool_records_failure_feedback(self, isolated_skills):
        from ai_hub.agent.agent import AgentSession
        _seed_skill("alpha")
        session = AgentSession()
        session.provider = MockStreamProvider([TOOL_GET_SKILL])

        async def fake_execute(name, args):
            return {"success": False, "error": "技能不存在"}

        with mock.patch("ai_hub.agent.agent.execute_tool", new=fake_execute):
            self._collect(session)
        assert get_skills_engine().get_feedback("alpha")["fail_count"] == 1

    def test_generic_tool_records_tool_domain_feedback(self, isolated_skills):
        from ai_hub.agent.agent import AgentSession
        session = AgentSession()
        session.provider = MockStreamProvider([TOOL_LIST])

        async def fake_execute(name, args):
            return {"success": True, "result": "ok"}

        with mock.patch("ai_hub.agent.agent.execute_tool", new=fake_execute):
            self._collect(session)
        assert get_skills_engine().get_feedback("list_projects")["success_count"] == 1


# ============================================================
# skill_optimize 工具
# ============================================================

class TestSkillOptimizeTool:
    def test_registered_and_permission(self, isolated_skills):
        from ai_hub.agent.tools import get_tool_definitions
        from ai_hub.agent.schemas import get_tool_permission, ToolPermission
        names = {d["function"]["name"] for d in get_tool_definitions()}
        assert "skill_optimize" in names
        assert get_tool_permission("skill_optimize") == ToolPermission.NOTIFY

    def test_optimize_tool_triggers_revision(self, isolated_skills):
        from ai_hub.agent.tools import execute_tool
        _seed_skill("alpha")
        eng = get_skills_engine()
        # 5 样本 + 3 失败（同时满足样本数与失败次数阈值）
        for i in range(5):
            eng.record_feedback("alpha", i < 2, f"样本{i}")
        result = asyncio.run(execute_tool("skill_optimize", {"skillName": "alpha"}))
        assert result["success"] is True
        payload = json.loads(result["result"])
        assert payload["revised"] is True
        assert "自学习改进记录" in eng.skills["alpha"].content

    def test_optimize_tool_missing_required_error(self, isolated_skills):
        from ai_hub.agent.tools import execute_tool
        result = asyncio.run(execute_tool("skill_optimize", {}))
        assert result["success"] is False
        assert "skillName" in result["error"]


# ============================================================
# transfer：技能级元数据 + 版本兼容
# ============================================================

class TestSkillTransferMeta:
    def _export(self, tmp_path, skills_dir):
        from ai_hub.skills.transfer import export_skills_package
        out = str(tmp_path / "skills.zip")
        return export_skills_package(out, skills_dir=str(skills_dir)), out

    def test_export_includes_meta_and_manifest_version(self, tmp_path, isolated_skills):
        from ai_hub.skills.transfer import SKILLS_PACKAGE_SCHEMA, SKILLS_PACKAGE_VERSION
        import zipfile
        eng = get_skills_engine()
        eng.save_skill("alpha", "# Alpha")
        eng.record_feedback("alpha", True, "ok")
        eng.record_feedback("alpha", False, "fail")
        manifest, out = self._export(tmp_path, isolated_skills)
        assert manifest["schema"] == SKILLS_PACKAGE_SCHEMA
        assert manifest["version"] == SKILLS_PACKAGE_VERSION == 2
        entry = next(s for s in manifest["skills"] if s["name"] == "alpha")
        assert entry["meta"]["feedback"]["total"] == 2
        with zipfile.ZipFile(out) as zf:
            assert "skills/alpha.meta.json" in zf.namelist()

    def test_import_restores_meta(self, tmp_path, isolated_skills):
        from ai_hub.skills.transfer import export_skills_package, import_skills_package
        eng = get_skills_engine()
        eng.save_skill("alpha", "# Alpha")
        eng.record_feedback("alpha", False, "fail")
        out = str(tmp_path / "skills.zip")
        export_skills_package(out, skills_dir=str(isolated_skills))
        target = str(tmp_path / "dst")
        r = import_skills_package(out, skills_dir=target)
        assert r["added"] == ["alpha"]
        # meta 随包还原
        assert os.path.exists(os.path.join(target, "alpha.meta.json"))
        meta = json.loads(open(os.path.join(target, "alpha.meta.json"), encoding="utf-8").read())
        assert meta["feedback"]["fail_count"] == 1

    def test_import_v1_package_backward_compatible(self, tmp_path):
        from ai_hub.skills.transfer import import_skills_package, SKILLS_PACKAGE_SCHEMA
        import zipfile
        # 手工构造 v1 旧包（schema=mc.skills/1，无 meta）
        pkg = str(tmp_path / "v1.zip")
        with zipfile.ZipFile(pkg, "w") as zf:
            zf.writestr("manifest.json", json.dumps({
                "schema": SKILLS_PACKAGE_SCHEMA, "version": 1, "kind": "skills",
                "count": 1, "skills": [{"name": "beta", "sha256": "x"}],
            }))
            zf.writestr("skills/beta.md", "# Beta")
        target = str(tmp_path / "dst_v1")
        r = import_skills_package(pkg, skills_dir=target)
        assert r["added"] == ["beta"]
        assert os.path.exists(os.path.join(target, "beta.md"))
        # 旧包无 meta：不应报错
        assert not os.path.exists(os.path.join(target, "beta.meta.json"))

    def test_import_rejects_unsupported_schema(self, tmp_path):
        from ai_hub.skills.transfer import import_skills_package
        import zipfile
        bad = str(tmp_path / "bad.zip")
        with zipfile.ZipFile(bad, "w") as zf:
            zf.writestr("manifest.json", json.dumps({"schema": "wrong", "skills": []}))
        with pytest.raises(ValueError):
            import_skills_package(bad, skills_dir=str(tmp_path / "t"))
