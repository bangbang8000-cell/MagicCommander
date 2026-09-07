"""5.1.4-514-c：异步任务层测试（渲染/导出工具 → task_id + 进度轮询）。

覆盖：
- submit_task：耗时工具包装为异步任务，返回 task_id
- query_progress：任务状态（pending/running/done/error）+ 进度
- 超时/取消语义
- 长任务不阻塞其他请求
"""
import asyncio
import json
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_hub.mcp_server.tasks import AsyncTaskManager, reset_tasks  # noqa: E402


@pytest.fixture(autouse=True)
def _clean():
    reset_tasks()
    yield
    reset_tasks()


class TestAsyncTask:
    def test_submit_and_complete(self):
        """提交异步任务 → 完成返回结果。"""
        mgr = AsyncTaskManager()

        async def _slow():
            await asyncio.sleep(0.05)
            return {"ok": True, "count": 42}

        task_id = mgr.submit("render_project", _slow)
        assert task_id
        # 等待完成
        for _ in range(20):
            st = mgr.query(task_id)
            if st["status"] == "done":
                break
            time.sleep(0.02)
        st = mgr.query(task_id)
        assert st["status"] == "done"
        assert st["result"]["count"] == 42
        assert st["tool"] == "render_project"

    def test_query_pending(self):
        """刚提交的状态为 pending/running。"""
        mgr = AsyncTaskManager()

        async def _slow():
            await asyncio.sleep(0.2)
            return {"ok": True}

        task_id = mgr.submit("render_project", _slow)
        st = mgr.query(task_id)
        assert st["status"] in ("pending", "running")
        assert st["task_id"] == task_id

    def test_error_task(self):
        """任务异常 → status=error + 错误信息。"""
        mgr = AsyncTaskManager()

        async def _boom():
            raise RuntimeError("渲染失败：超时")

        task_id = mgr.submit("render_project", _boom)
        for _ in range(20):
            st = mgr.query(task_id)
            if st["status"] in ("done", "error"):
                break
            time.sleep(0.02)
        st = mgr.query(task_id)
        assert st["status"] == "error"
        assert "超时" in st["error"]

    def test_unknown_task(self):
        """未知 task_id → 结构化错误。"""
        mgr = AsyncTaskManager()
        assert mgr.query("no_such") is None

    def test_task_count_and_list(self):
        """任务列表可枚举。"""
        mgr = AsyncTaskManager()

        async def _fast():
            return {"ok": True}

        t1 = mgr.submit("render_a", _fast)
        t2 = mgr.submit("export_b", _fast)
        assert len(mgr.list_tasks()) == 2
        ids = {t["task_id"] for t in mgr.list_tasks()}
        assert {t1, t2}.issubset(ids)

    def test_parallel_tasks(self):
        """多个任务并行执行，互不阻塞。"""
        mgr = AsyncTaskManager()
        order: list[str] = []

        async def _t1():
            await asyncio.sleep(0.05)
            order.append("t1")
            return {"ok": 1}

        async def _t2():
            await asyncio.sleep(0.02)
            order.append("t2")
            return {"ok": 2}

        t1 = mgr.submit("render_1", _t1)
        t2 = mgr.submit("render_2", _t2)
        time.sleep(0.15)
        assert mgr.query(t2)["status"] == "done"
        assert mgr.query(t1)["status"] == "done"
        # 并行：t2 先完成
        assert order == ["t2", "t1"]

    def test_progress_update(self):
        """任务执行中可更新进度（percent + message）。"""
        mgr = AsyncTaskManager()

        async def _slow():
            # 从任务列表确定性取自身 task_id（避免闭包赋值竞态）
            mine = mgr.list_tasks()[0]["task_id"]
            mgr.update_progress(mine, 40, "渲染模板…")
            await asyncio.sleep(0.05)
            mgr.update_progress(mine, 80, "写入输出…")
            return {"ok": True}

        tid = mgr.submit("render_project", _slow)
        # 等待进度被写入
        seen_progress = False
        for _ in range(20):
            st = mgr.query(tid)
            if st["progress"]["percent"] >= 40:
                seen_progress = True
                break
            time.sleep(0.02)
        assert seen_progress, "未观察到进度更新"
        st = mgr.wait(tid, timeout=3)
        assert st["status"] == "done"
        assert st["progress"]["percent"] in (80, 100)
        assert "写入输出" in st["progress"]["message"]

    def test_wait_helper(self):
        """wait() 同步阻塞返回最终状态。"""
        mgr = AsyncTaskManager()

        async def _slow():
            await asyncio.sleep(0.03)
            return {"ok": True, "count": 7}

        tid = mgr.submit("export_project", _slow)
        st = mgr.wait(tid, timeout=3)
        assert st["status"] == "done"
        assert st["result"]["count"] == 7

    def test_cancel_running_task(self):
        """取消运行中任务 → status=error（Task cancelled）。"""
        mgr = AsyncTaskManager()

        async def _long():
            await asyncio.sleep(30)
            return {"ok": True}

        tid = mgr.submit("render_project", _long)
        time.sleep(0.1)  # 确保已开始
        assert mgr.cancel(tid) is True
        st = mgr.wait(tid, timeout=3)
        assert st["status"] == "error"
        assert "cancel" in st["error"].lower()

    def test_cancel_done_returns_false(self):
        """已完成任务不可取消。"""
        mgr = AsyncTaskManager()

        async def _fast():
            return {"ok": True}

        tid = mgr.submit("render_project", _fast)
        assert mgr.wait(tid, timeout=3)["status"] == "done"
        assert mgr.cancel(tid) is False

    def test_singleton_and_reset(self):
        """get_task_manager 返回单例；reset_tasks 重建。"""
        from ai_hub.mcp_server.tasks import get_task_manager

        mgr1 = get_task_manager()
        mgr2 = get_task_manager()
        assert mgr1 is mgr2
        reset_tasks()
        mgr3 = get_task_manager()
        assert mgr3 is not mgr1

    def test_evict_oldest_done(self):
        """超限时淘汰最旧已完成任务，保持记录数受控。"""
        mgr = AsyncTaskManager(max_tasks=2)

        async def _fast():
            return {"ok": True}

        t1 = mgr.submit("render_a", _fast)
        assert mgr.wait(t1, timeout=3)["status"] == "done"
        t2 = mgr.submit("render_b", _fast)
        assert mgr.wait(t2, timeout=3)["status"] == "done"
        t3 = mgr.submit("render_c", _fast)
        assert mgr.wait(t3, timeout=3)["status"] == "done"
        ids = {t["task_id"] for t in mgr.list_tasks()}
        assert t1 not in ids  # 最旧已完成被淘汰
        assert t2 in ids and t3 in ids


class TestTaskToolIntegration:
    """5.1.4-514-c 集成：任务工具经 execute_tool 全链路（提交→轮询→完成）。"""

    @pytest.fixture(autouse=True)
    def _init(self, tmp_path):
        import ai_hub.agent.tools as tools_mod
        from ai_hub.agent.tools import init_tools, set_workspace_dir
        from ai_hub.mcp_server.manager import reset_manager
        from ai_hub.mcp_server.tasks import reset_tasks

        set_workspace_dir(str(tmp_path))
        reset_manager()
        reset_tasks()
        init_tools()
        orig_execute = tools_mod.execute_tool
        yield
        tools_mod.execute_tool = orig_execute  # 恢复，防 fake 泄漏到其他用例
        reset_tasks()

    @staticmethod
    def _json(s: str) -> dict:
        return json.loads(s)

    def test_task_tools_present_in_compiled(self):
        """编译态工具集包含 5 个任务工具。"""
        from ai_hub.agent.tools import get_tool_definitions
        from ai_hub.mcp_server.capabilities import filter_tools_for_mode

        defs = filter_tools_for_mode("compiled", get_tool_definitions())
        names = {d["name"] for d in defs}
        assert {"task_submit", "task_query", "task_list", "task_wait", "task_cancel"}.issubset(names)

    def test_submit_query_roundtrip(self):
        """task_submit → task_id → task_query 轮询至 done。"""
        import ai_hub.agent.tools as tools_mod
        from ai_hub.agent.tools import execute_tool

        async def _fake_execute(name, arguments):
            await asyncio.sleep(0.02)
            return {"success": True, "result": {"projectName": arguments.get("projectName"), "status": "ok"}}

        tools_mod.execute_tool = _fake_execute
        res = asyncio.run(execute_tool("task_submit", {"tool": "render_config", "arguments": {"projectName": "p1"}}))
        assert res["success"] is True
        data = self._json(res["result"])
        assert data["status"] == "ok"
        task_id = data["task_id"]
        st = None
        for _ in range(40):
            q = asyncio.run(execute_tool("task_query", {"taskId": task_id}))
            st = self._json(q["result"])["task"]
            if st["status"] in ("done", "error"):
                break
            time.sleep(0.05)
        assert st["status"] == "done"
        assert st["tool"] == "render_config"

    def test_submit_unknown_tool_rejected(self):
        """task_submit 拒绝当前模式不可用工具。"""
        from ai_hub.agent.tools import execute_tool

        res = asyncio.run(execute_tool("task_submit", {"tool": "no_such_tool", "arguments": {}}))
        assert res["success"] is False
        assert "不可用" in res["error"]

    def test_task_query_unknown(self):
        """task_query 未知 task_id → 结构化错误。"""
        from ai_hub.agent.tools import execute_tool

        res = asyncio.run(execute_tool("task_query", {"taskId": "no-such-task"}))
        assert res["success"] is False
        assert "任务不存在" in res["error"]

    def test_long_tool_auto_submit(self):
        """5.1.4-514-a：长耗时工具自动提交为异步任务（后台保留 L2/L3 + 审计）。"""
        import ai_hub.agent.tools as tools_mod
        from ai_hub.mcp_server.manager import AgentConnectManager, reset_manager
        from ai_hub.mcp_server.tasks import get_task_manager, reset_tasks

        reset_manager()
        reset_tasks()
        mgr = AgentConnectManager()

        async def _fake_execute(name, arguments):
            return {"success": True, "result": {"projectName": arguments.get("projectName"), "status": "rendered"}}

        tools_mod.execute_tool = _fake_execute
        payload = mgr._submit_long_task("render_config", {"projectName": "p1"})
        assert payload["status"] == "submitted"
        assert "task_id" in payload
        st = get_task_manager().wait(payload["task_id"], timeout=3)
        assert st["status"] == "done"
        assert st["tool"] == "render_config"
        assert st["result"]["success"] is True

    def test_cancel_via_tool(self):
        """task_cancel 取消运行中任务。"""
        import ai_hub.agent.tools as tools_mod
        from ai_hub.agent.tools import execute_tool

        async def _slow_execute(name, arguments):
            await asyncio.sleep(30)
            return {"success": True, "result": {}}

        tools_mod.execute_tool = _slow_execute
        res = asyncio.run(execute_tool("task_submit", {"tool": "render_config", "arguments": {"projectName": "p1"}}))
        task_id = self._json(res["result"])["task_id"]
        time.sleep(0.1)
        c = asyncio.run(execute_tool("task_cancel", {"taskId": task_id}))
        assert c["success"] is True
        q = asyncio.run(execute_tool("task_query", {"taskId": task_id}))
        st = self._json(q["result"])["task"]
        assert st["status"] == "error"
