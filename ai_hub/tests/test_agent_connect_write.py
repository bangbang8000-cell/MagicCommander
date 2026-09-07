"""5.1.3-513-b/c：写入语义层（L2 校验闸门 + L3 幂等）测试。

覆盖：
- is_write_tool / requires_l2_validation 判定
- idempotency_key 提取（projectId / planHash / name）
- check_idempotent 幂等命中 → "已存在"
- validate_result L2 语义校验（结构非法 / 业务 error / 通过）
"""
import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_hub.mcp_server.write_gate import (  # noqa: E402
    check_idempotent,
    idempotency_key,
    is_write_tool,
    requires_l2_validation,
    validate_result,
)


@pytest.fixture(autouse=True)
def _restore_execute_tool():
    """每用例后恢复 tools.execute_tool，防止 fake 泄漏到其他测试文件。"""
    import ai_hub.agent.tools as tools_mod

    orig = tools_mod.execute_tool
    yield
    tools_mod.execute_tool = orig


class TestWriteToolDetect:
    def test_write_tools_detected(self):
        for name in ("create_project", "update_project", "import_plan", "delete_project", "save_template", "apply_patch", "repair_design"):
            assert is_write_tool(name), name

    def test_read_tools_not_write(self):
        for name in ("list_projects", "get_project", "query_device", "validate_plan", "check_config", "export_bom", "dry_run_render"):
            assert not is_write_tool(name), name

    def test_l2_validation_required(self):
        for name in ("create_project", "update_project", "import_plan", "apply_patch", "repair_design"):
            assert requires_l2_validation(name), name

    def test_l2_not_required_for_others(self):
        assert not requires_l2_validation("save_template")
        assert not requires_l2_validation("list_projects")


class TestIdempotency:
    def test_key_from_project_id(self):
        assert idempotency_key({"projectId": "49a-abc-0001"}) == "id=49a-abc-0001"

    def test_key_from_project_id_underscore(self):
        assert idempotency_key({"project_id": "49a-abc-0002"}) == "id=49a-abc-0002"

    def test_key_with_plan_hash(self):
        assert idempotency_key({"projectId": "p1", "planHash": "h1"}) == "id=p1;hash=h1"

    def test_key_from_name_fallback(self):
        assert idempotency_key({"name": "proj-a"}) == "name=proj-a"

    def test_no_key(self):
        assert idempotency_key({"a": 1}) is None
        assert idempotency_key({}) is None

    def test_idempotent_hit(self):
        records: dict = {}
        key = idempotency_key({"projectId": "p1"})
        records["create_project:id=p1"] = True
        res = check_idempotent(records, "create_project", {"projectId": "p1"})
        assert res is not None
        assert res["idempotent"] is True
        assert "已存在" in res["result"]["message"]

    def test_idempotent_miss(self):
        records: dict = {}
        res = check_idempotent(records, "create_project", {"projectId": "p1"})
        assert res is None


class TestL2Validation:
    def test_validate_ok(self):
        res = validate_result("create_project", {"success": True, "result": {"projectId": "p1"}})
        assert res["success"] is True

    def test_validate_failed_result(self):
        res = validate_result("create_project", {"success": False, "error": "参数错误"})
        assert res["success"] is False
        assert "参数错误" in res["error"]

    def test_validate_non_dict(self):
        res = validate_result("create_project", "not-a-dict")
        assert res["success"] is False
        assert "结构非法" in res["error"]

    def test_validate_business_error(self):
        res = validate_result("create_project", {"success": True, "result": {"status": "error", "error": "校验失败"}})
        assert res["success"] is False
        assert "校验失败" in res["error"]


# ============================================================
# 集成：MCP Server 执行路径接入 L2/L3
# ============================================================

class TestExecutionGate:
    async def _call(self, mgr, name, args):
        return await mgr._execute_wrapped(name, args)

    def test_write_tool_l3_idempotent(self):
        """L3：同 projectId 重复创建 → 第二次返回"已存在"。"""
        from ai_hub.mcp_server.manager import AgentConnectManager, reset_manager

        reset_manager()
        mgr = AgentConnectManager()

        async def _fake_execute(name, arguments):
            return {"success": True, "result": {"projectId": arguments.get("projectId"), "status": "created"}}

        import ai_hub.agent.tools as tools_mod
        tools_mod.execute_tool = _fake_execute  # 替换为确定性假实现

        r1 = asyncio.run(self._call(mgr, "create_project", {"projectId": "p1"}))
        assert r1["success"] is True
        r2 = asyncio.run(self._call(mgr, "create_project", {"projectId": "p1"}))
        assert r2["success"] is True
        assert r2["idempotent"] is True
        assert "已存在" in r2["result"]["message"]

    def test_write_tool_l2_failure(self):
        """L2：写入工具返回业务 error → 结构化失败。"""
        from ai_hub.mcp_server.manager import AgentConnectManager, reset_manager

        reset_manager()
        mgr = AgentConnectManager()

        async def _fake_execute(name, arguments):
            return {"success": True, "result": {"status": "error", "error": "机房布局校验未通过"}}

        import ai_hub.agent.tools as tools_mod
        tools_mod.execute_tool = _fake_execute

        res = asyncio.run(self._call(mgr, "create_project", {"projectId": "p2"}))
        assert res["success"] is False
        assert "机房布局校验未通过" in res["error"]

    def test_read_tool_no_gate(self):
        """只读工具不过幂等/L2 闸门。"""
        from ai_hub.mcp_server.manager import AgentConnectManager, reset_manager

        reset_manager()
        mgr = AgentConnectManager()

        async def _fake_execute(name, arguments):
            return {"success": True, "result": ["p1"]}

        import ai_hub.agent.tools as tools_mod
        tools_mod.execute_tool = _fake_execute

        res = asyncio.run(self._call(mgr, "list_projects", {}))
        assert res["success"] is True
        assert "idempotent" not in res
