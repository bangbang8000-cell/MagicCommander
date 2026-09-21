"""MC v5.2.2 修复版本：Agent Connect 对外契约用例（T1.11 / T2.17）。

覆盖（每条对应用户反馈条目，均按"改前失败 → 改后通过"双向留痕编写）：
- 越权 4：`toolName` 泄漏消除、只读工具不可路由到删除类、模式守卫兜底、源码态专用工具编译态不可达
- schema 3：inputSchema 为真实参数、含参数说明、含 enum 透传
- 错误语义 5：失败 isError=true / 成功 isError=false / 扁平化单层 / error_code 结构化 / 未知工具
- 屏蔽规则 3：语义规则命中真实注册名、编译态无破坏性工具、规则未命中即拒绝启动（fail-fast）
- 门禁矩阵 4：notify 灰度不阻断且记账、enforce 缺凭据拒绝、enforce 带凭据放行、
  非 confirm 档不受门禁影响
- 开关 2：stdio 入口遵守总开关（exit 2）、selfcheck 真实读开关
- 注解 2：tools/list 带 annotations、只读工具 readOnlyHint=true

----------------------------------------------------------------------------
flaky 根因结论（仅测试层问题，非业务逻辑缺陷，勿据此改业务引擎）：
``TestPermissionGate::test_notify_mode_records_without_blocking`` 历史上偶发
``assert gate_hits >= 1`` 得 0。定位结论为**时序竞态**，而非共享状态污染：
- ``render_config`` 既是 confirm 档（schemas.py）又是长耗时工具（capabilities.LONG_RUNNING_TOOLS）。
- 长耗时工具走 ``AgentConnectManager._invoke(long_running=True)``：主线程先以
  ``record=False`` 过门（**不记账**），随即把真实执行 submit 到独立 daemon 后台事件
  循环线程（mcp_server/tasks.py），调用当场返回 task_id 回执。
- 真正的 ``self._gate_hits.append(...)`` 发生在后台线程跑 ``_execute_wrapped`` →
  ``_permission_gate(record=True)`` 时。
- 原用例在调用返回后立刻同步断言 ``gate_hits >= 1``，此时后台线程往往尚未调度执行，
  于是偶发读到 0；重跑时线程调度恰好先落账则通过。本机连跑 10 次 9 败 1 过可复现。
- ``reset_manager()`` 每用例都新建 manager（``_gate_hits=[]``），gate 记录本身无跨用例残留。
修复方式：仅在测试层对该断言做**有界轮询等待后台记账**（``_wait_gate_hit``），
不改任何业务引擎 / 导出契约 / 业务逻辑。
----------------------------------------------------------------------------
"""
import asyncio
import json
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


# =========================================================================
# 夹具
# =========================================================================

@pytest.fixture(autouse=True)
def _reset_all():
    """每用例前后重置管理器、工具守卫与注册表，避免全局状态串扰。"""
    from ai_hub.agent import tools
    from ai_hub.mcp_server.manager import reset_manager

    reset_manager()
    tools.set_execution_guard(None)
    yield
    reset_manager()
    tools.set_execution_guard(None)


def _enable_compiled():
    from ai_hub.agent.tools import init_tools
    from ai_hub.mcp_server.manager import get_agent_connect_manager

    init_tools()
    mgr = get_agent_connect_manager()
    ok, msg = mgr.enable(agent_mode="compiled")
    assert ok, msg
    return mgr


def _tool_names(mgr):
    return sorted(mgr.mcp._tool_manager._tools.keys())


# =========================================================================
# 一、越权（MC-S1）——4 条
# =========================================================================

class TestPrivilegeEscalation:
    """用户反馈 P0-1：``toolName`` 入参可覆盖闭包绑定名 → 只读工具可路由到删除类工具。"""

    def test_no_tool_exposes_toolname_parameter(self):
        """改前：48/48 个工具的 inputSchema 含 toolName；改后：0 个。"""
        mgr = _enable_compiled()
        tm = mgr.mcp._tool_manager
        leaking = [
            n for n in tm._tools
            if "toolName" in json.dumps(tm.get_tool(n).parameters, ensure_ascii=False)
        ]
        assert leaking == [], f"以下工具仍暴露 toolName 入参：{leaking}"

    def test_readonly_tool_cannot_be_rerouted(self):
        """改前：list_projects 传 toolName=delete_project 会真的执行删除；
        改后：toolName 被参数模型丢弃，调用仍在 list_projects 上完成。"""
        mgr = _enable_compiled()
        tm = mgr.mcp._tool_manager
        res = asyncio.run(tm.call_tool(
            "list_projects",
            {"projectName": "___nonexistent___", "toolName": "delete_project"},
            convert_result=True,
        ))
        text = res.content[0].text
        assert "无效的项目ID格式" not in text, "仍被越权路由到 delete_project"
        assert "项目列表获取成功" in text

    def test_execution_guard_blocks_unselected_tool(self):
        """模式守卫兜底：编译态下直接调 execute_tool('run_cli') 被拒。"""
        from ai_hub.agent.tools import execute_tool

        _enable_compiled()
        res = asyncio.run(execute_tool("run_cli", {"command": "ls"}))
        assert res["success"] is False
        assert res["error_code"] == "AC_ERR_TOOL_NOT_ALLOWED"

    def test_source_only_tools_absent_in_compiled(self):
        """编译态不暴露源码态专用工具与破坏性工具。"""
        from ai_hub.agent.tools import get_tool_definitions
        from ai_hub.mcp_server.capabilities import SOURCE_ONLY_TOOLS, filter_tools_for_mode

        names = {t["name"] for t in filter_tools_for_mode("compiled", get_tool_definitions())}
        assert not (names & set(SOURCE_ONLY_TOOLS))
        for n in ("delete_project", "template_delete", "delete_files", "delete_labels"):
            assert n not in names, f"{n} 不应在编译态暴露"


# =========================================================================
# 二、schema（MC-A1）——3 条
# =========================================================================

class TestInputSchema:
    """用户反馈 P0-2：``tools/list`` 的 inputSchema 是空壳（只有 arguments/toolName）。"""

    def test_schema_reflects_real_parameters(self):
        mgr = _enable_compiled()
        t = mgr.mcp._tool_manager.get_tool("create_project")
        props = t.parameters.get("properties") or {}
        assert "projectName" in props
        assert t.parameters.get("required") == ["projectName"]

    def test_schema_keeps_parameter_description(self):
        mgr = _enable_compiled()
        t = mgr.mcp._tool_manager.get_tool("create_project")
        assert t.parameters["properties"]["projectName"].get("description")

    def test_schema_keeps_enum(self):
        """参数 enum 不再被 schema 归一化丢弃（改前只保留 type/properties/required）。"""
        from ai_hub.mcp_server.capabilities import normalize_mcp_schema

        raw = {
            "type": "object",
            "properties": {"fileType": {"type": "string", "enum": ["output", "yaml"]}},
            "required": ["projectName"],
        }
        normalized = normalize_mcp_schema(raw)
        assert normalized["properties"]["fileType"]["enum"] == ["output", "yaml"]

        # 端到端：编译态工具中若存在带 enum 的真实参数，也必须原样保留
        mgr = _enable_compiled()
        tm = mgr.mcp._tool_manager
        for name in tm._tools:
            for prop in (tm.get_tool(name).parameters.get("properties") or {}).values():
                if isinstance(prop, dict) and prop.get("enum"):
                    return
        pytest.fail("编译态没有任何保留 enum 的参数（归一化仍在丢弃 enum）")


# =========================================================================
# 三、错误语义（MC-A2）——5 条
# =========================================================================

class TestErrorSemantics:

    def _call(self, mgr, name, args):
        return asyncio.run(mgr.mcp._tool_manager.call_tool(name, args, convert_result=True))

    def test_failure_sets_iserror_true(self):
        mgr = _enable_compiled()
        res = self._call(mgr, "get_project_info", {})  # 缺必填参数
        assert res.isError is True

    def test_success_sets_iserror_false(self):
        mgr = _enable_compiled()
        res = self._call(mgr, "list_projects", {})
        assert res.isError is False

    def test_response_is_single_layer(self):
        """改前：result 是转义 JSON 字符串；改后：result 直接是对象。"""
        mgr = _enable_compiled()
        res = self._call(mgr, "list_projects", {})
        body = json.loads(res.content[0].text)
        assert body["success"] is True
        assert isinstance(body["result"], dict), "result 仍为字符串（未扁平化）"

    def test_failure_carries_error_code(self):
        mgr = _enable_compiled()
        res = self._call(mgr, "get_project_info", {})
        body = json.loads(res.content[0].text)
        assert body["success"] is False
        assert body["error_code"] == "AC_ERR_INVALID_ARGS"
        assert body["error"]

    def test_unknown_tool_error(self):
        from ai_hub.agent.tools import execute_tool

        res = asyncio.run(execute_tool("no_such_tool_xyz", {}))
        assert res["success"] is False
        assert res["error_code"] == "AC_ERR_UNKNOWN_TOOL"


# =========================================================================
# 四、屏蔽规则（MC-S2）——3 条
# =========================================================================

class TestBlockedRules:
    """用户反馈 P0-3：屏蔽表用枚举名单（delete_template）与实际注册名（template_delete）不符。"""

    def test_semantic_rules_match_real_registered_names(self):
        from ai_hub.mcp_server.capabilities import audit_block_rules, is_destructive_tool

        # 实际注册名是 template_delete（不是 delete_template）
        assert is_destructive_tool("template_delete") is True
        assert is_destructive_tool("delete_project") is True
        assert is_destructive_tool("delete_files") is True
        assert is_destructive_tool("clear_device_library") is True
        # 正常工具不应误伤
        assert is_destructive_tool("list_projects") is False
        assert is_destructive_tool("undo_render") is False
        audit = audit_block_rules(["delete_project", "template_delete", "list_projects"], "compiled")
        assert "template_delete" in audit["compiled_blocked"]

    def test_compiled_selection_contains_no_destructive_tool(self):
        from ai_hub.agent.tools import get_tool_definitions
        from ai_hub.mcp_server.capabilities import (
            assert_compiled_selection_safe,
            filter_tools_for_mode,
        )

        defs = get_tool_definitions()
        names = [(d.get("function") or d).get("name") for d in defs]
        selected = [t["name"] for t in filter_tools_for_mode("compiled", defs)]
        assert assert_compiled_selection_safe(selected, names) == []

    def test_rules_hitting_nothing_refuses_to_start(self, monkeypatch):
        """fail-fast：规则未命中任何注册工具时拒绝启动（防规则静默失效）。"""
        from ai_hub.mcp_server import capabilities

        monkeypatch.setattr(capabilities, "_DESTRUCTIVE_PATTERNS", ())
        monkeypatch.setattr(capabilities, "_SOURCE_ONLY_PATTERNS", ())
        monkeypatch.setattr(capabilities, "SOURCE_ONLY_TOOLS", [])
        monkeypatch.setattr(capabilities, "COMPILED_BLOCKED_TOOLS", [])
        mgr = _enable_compiled_err()
        assert mgr is not None  # 断言失败时 enable 返回 (False, msg)
        ok, msg = mgr
        assert ok is False
        assert "安全断言失败" in msg


def _enable_compiled_err():
    from ai_hub.agent.tools import init_tools
    from ai_hub.mcp_server.manager import get_agent_connect_manager

    init_tools()
    return get_agent_connect_manager().enable(agent_mode="compiled")


# =========================================================================
# 五、门禁矩阵（MC-S4）——4 条
# =========================================================================

class TestPermissionGate:

    def _call(self, mgr, name, args):
        return asyncio.run(mgr.mcp._tool_manager.call_tool(name, args, convert_result=True))

    @staticmethod
    def _wait_gate_hit(mgr, timeout: float = 3.0) -> None:
        """等待后台任务线程完成一次 gate 记账（有界轮询，消除时序竞态）。

        长耗时 confirm 工具的 ``_gate_hits.append`` 发生在后台 daemon 任务线程
        （``_execute_wrapped`` → ``_permission_gate(record=True)``），主线程调用路径以
        ``record=False`` 过门后立即返回 task_id。调用当场读 ``gate_hits`` 偶发为 0（flaky），
        故此处在断言前轮询等待后台落账。仅测试层同步手段，不改业务逻辑。
        """
        deadline = time.time() + timeout
        while time.time() < deadline:
            if mgr.status_report()["gate_hits"] >= 1:
                return
            time.sleep(0.01)

    def test_notify_mode_records_without_blocking(self):
        mgr = _enable_compiled()
        mgr.set_gate_mode("notify")
        res = self._call(mgr, "render_config", {"projectName": "___nonexistent___"})
        body = json.loads(res.content[0].text)
        assert body.get("error_code") != "AC_ERR_PERMISSION_REQUIRED"
        self._wait_gate_hit(mgr)  # 等后台线程落账，消除长耗时工具的同步断言竞态
        assert mgr.status_report()["gate_hits"] >= 1

    def test_enforce_mode_blocks_without_token(self):
        mgr = _enable_compiled()
        mgr.set_gate_mode("enforce")
        res = self._call(mgr, "render_config", {"projectName": "___nonexistent___"})
        assert res.isError is True
        body = json.loads(res.content[0].text)
        assert body["error_code"] == "AC_ERR_PERMISSION_REQUIRED"

    def test_enforce_mode_passes_with_token(self):
        mgr = _enable_compiled()
        mgr.set_gate_mode("enforce")
        res = self._call(mgr, "render_config", {"projectName": "___nonexistent___", "approvalToken": "ok"})
        body = json.loads(res.content[0].text)
        assert body.get("error_code") != "AC_ERR_PERMISSION_REQUIRED"

    def test_auto_permission_unaffected_by_gate(self):
        mgr = _enable_compiled()
        mgr.set_gate_mode("enforce")
        res = self._call(mgr, "list_projects", {})
        assert res.isError is False


# =========================================================================
# 六、开关（MC-S3）——2 条
# =========================================================================

class TestSwitch:

    def test_stdio_entry_respects_switch(self, monkeypatch, tmp_path):
        """改前：stdio 入口直接 enable，开关关掉也能拉起；改后：开关关闭 → exit 2。"""
        from ai_hub.mcp_server import run as run_mod

        monkeypatch.setattr("ai_hub.config.get_enable_agent_connect", lambda: False, raising=False)
        monkeypatch.setattr(sys, "argv", ["run", "--mode", "compiled", "--workspace", str(tmp_path)])
        assert run_mod.main() == 2

    def test_selfcheck_reads_real_switch(self, monkeypatch):
        """改前：selfcheck 只看内存状态；改后：真实读开关。"""
        from ai_hub.mcp_server.manager import AgentConnectManager

        mgr = AgentConnectManager()
        monkeypatch.setattr(AgentConnectManager, "_read_switch", staticmethod(lambda: False))
        result = mgr.selfcheck()
        item = next(c for c in result["checks"] if c["name"] == "enabled")
        assert item["ok"] is False
        assert "开关=False" in item["message"]

    def test_selfcheck_includes_rule_and_gate_status(self):
        mgr = _enable_compiled()
        result = mgr.selfcheck()
        names = {c["name"] for c in result["checks"]}
        assert {"blocked_rules", "gate"} <= names
        rules = next(c for c in result["checks"] if c["name"] == "blocked_rules")
        assert rules["ok"] is True
        assert "编译态屏蔽" in rules["message"]
        gate = next(c for c in result["checks"] if c["name"] == "gate")
        assert gate["message"].startswith("写工具门禁=")


# =========================================================================
# 七、注解与资源（MC-S4 / MC-A3）——3 条
# =========================================================================

class TestAnnotationsAndResources:

    def test_all_tools_have_annotations(self):
        mgr = _enable_compiled()
        tm = mgr.mcp._tool_manager
        missing = [n for n in tm._tools if tm.get_tool(n).annotations is None]
        assert missing == [], f"缺少 annotations 的工具：{missing}"

    def test_readonly_tool_marked_readonly(self):
        mgr = _enable_compiled()
        t = mgr.mcp._tool_manager.get_tool("list_projects")
        assert t.annotations.readOnlyHint is True

    def test_prompts_and_resources_registered(self):
        mgr = _enable_compiled()
        prompts = sorted(mgr.mcp._prompt_manager._prompts.keys())
        resources = sorted(mgr.mcp._resource_manager._resources.keys())
        assert prompts, "未注册任何 prompt"
        assert resources, "未注册任何 resource"


# =========================================================================
# 八、兼容：旧 arguments 包裹
# =========================================================================

class TestBackwardCompat:

    def test_legacy_arguments_wrapper_still_works(self):
        """旧客户端沿用 {"arguments": {...}} 包裹时仍可正常调用。"""
        mgr = _enable_compiled()
        res = asyncio.run(mgr.mcp._tool_manager.call_tool(
            "list_projects", {"arguments": {}}, convert_result=True,
        ))
        assert res.isError is False
