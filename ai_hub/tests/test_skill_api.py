"""AI Hub Skill HTTP 端点测试：/skill/save 与 /skill/delete 对称契约

覆盖维度（PRD v3.0 AI-6 / 技能 / 打磨对称性）：
- save 后 delete 返回 deleted=true，技能文件消失、prompt 不再包含该技能
- 删除不存在的技能返回 deleted=false 不报错
- 配置 auth_token 后无/错误 X-MC-Auth-Token 返回 401，正确 token 通过
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from ai_hub.api.chat import router as chat_router
from ai_hub.config import settings
from ai_hub.skills import engine as skills_engine
from ai_hub.skills.engine import get_skills_engine


def _build_app(with_auth=False):
    app = FastAPI(title="Test AI Hub")
    if with_auth:
        @app.middleware("http")
        async def require_auth_token(request, call_next):
            token = request.headers.get("X-MC-Auth-Token", "")
            if token != settings.auth_token:
                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
            return await call_next(request)
    app.include_router(chat_router)
    return app


def _isolate_skills(tmp_path, monkeypatch):
    monkeypatch.setattr(skills_engine, "SKILLS_DIR", tmp_path)
    skills_engine._engine = None


def test_skill_save_then_delete(tmp_path, monkeypatch):
    _isolate_skills(tmp_path, monkeypatch)
    app = _build_app()
    with TestClient(app) as client:
        r = client.post("/api/chat/skill/save", json={"name": "netcheck", "content": "检查网络配置"})
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        assert (tmp_path / "netcheck.md").exists()

        r2 = client.post("/api/chat/skill/delete", json={"name": "netcheck"})
        assert r2.status_code == 200
        body = r2.json()
        assert body["status"] == "ok"
        assert body["deleted"] is True
        assert not (tmp_path / "netcheck.md").exists()
        assert "netcheck" not in get_skills_engine().get_skills_prompt()


def test_skill_delete_missing_returns_false(tmp_path, monkeypatch):
    _isolate_skills(tmp_path, monkeypatch)
    app = _build_app()
    with TestClient(app) as client:
        r = client.post("/api/chat/skill/delete", json={"name": "nonexistent"})
        assert r.status_code == 200
        assert r.json()["deleted"] is False


def test_skill_api_auth_401(tmp_path, monkeypatch):
    _isolate_skills(tmp_path, monkeypatch)
    settings.auth_token = "skill-api-token"
    try:
        app = _build_app(with_auth=True)
        with TestClient(app) as client:
            r = client.post("/api/chat/skill/delete", json={"name": "x"})
            assert r.status_code == 401
            r2 = client.post(
                "/api/chat/skill/delete",
                json={"name": "x"},
                headers={"X-MC-Auth-Token": "skill-api-token"},
            )
            assert r2.status_code == 200
            assert r2.json()["deleted"] is False
    finally:
        settings.auth_token = ""
