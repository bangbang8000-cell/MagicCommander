"""5.0.5-505-b：知识库 HTTP 端点测试（CRUD / 检索 / 分类 / 404）

覆盖：
- POST /knowledge 新增 + GET /knowledge 列表 + GET /knowledge/categories
- GET /knowledge/{key} 获取（含内容）；不存在 404
- PUT /knowledge/{key} 更新；DELETE /knowledge/{key} 删除
- POST /knowledge/search 检索召回
- 配置 auth_token 后无/错误 token 返回 401，正确 token 通过
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from ai_hub.api.chat import router as chat_router
from ai_hub.config import settings
from ai_hub.knowledge import engine as kb_engine


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


def _isolate_knowledge(tmp_path, monkeypatch):
    monkeypatch.setattr(kb_engine, "KNOWLEDGE_DIR", tmp_path)
    kb_engine._engine = None


def test_knowledge_crud_via_api(tmp_path, monkeypatch):
    _isolate_knowledge(tmp_path, monkeypatch)
    app = _build_app()
    with TestClient(app) as client:
        # add
        r = client.post("/api/chat/knowledge", json={
            "title": "RoCE 规划", "content": "PFC 与 ECN 无损", "category": "网络", "tags": ["roce"],
        })
        assert r.status_code == 200
        entry = r.json()["entry"]
        key = entry["key"]
        assert entry["title"] == "RoCE 规划"
        # list
        r2 = client.get("/api/chat/knowledge")
        assert r2.status_code == 200
        assert r2.json()["total"] == 1
        assert r2.json()["entries"][0]["key"] == key
        # categories
        r3 = client.get("/api/chat/knowledge/categories")
        assert r3.json()["categories"] == ["网络"]
        # get
        r4 = client.get(f"/api/chat/knowledge/{key}")
        assert r4.status_code == 200
        assert r4.json()["entry"]["content"] == "PFC 与 ECN 无损"
        # search
        r5 = client.post("/api/chat/knowledge/search", json={"query": "无损"})
        assert r5.json()["total"] >= 1
        # update
        r6 = client.put(f"/api/chat/knowledge/{key}", json={"title": "RoCE 规划", "content": "更新后的内容"})
        assert r6.json()["entry"]["content"] == "更新后的内容"
        # delete
        r7 = client.delete(f"/api/chat/knowledge/{key}")
        assert r7.json()["deleted"] is True
        assert client.get("/api/chat/knowledge").json()["total"] == 0


def test_knowledge_get_missing_404(tmp_path, monkeypatch):
    _isolate_knowledge(tmp_path, monkeypatch)
    app = _build_app()
    with TestClient(app) as client:
        r = client.get("/api/chat/knowledge/no_such")
        assert r.status_code == 404


def test_knowledge_delete_missing_returns_false(tmp_path, monkeypatch):
    _isolate_knowledge(tmp_path, monkeypatch)
    app = _build_app()
    with TestClient(app) as client:
        r = client.delete("/api/chat/knowledge/no_such")
        assert r.status_code == 200
        assert r.json()["deleted"] is False


def test_knowledge_search_filter(tmp_path, monkeypatch):
    _isolate_knowledge(tmp_path, monkeypatch)
    app = _build_app()
    with TestClient(app) as client:
        client.post("/api/chat/knowledge", json={"title": "网络A", "content": "内容A", "category": "网络", "project": "p1"})
        client.post("/api/chat/knowledge", json={"title": "网络B", "content": "内容B", "category": "存储", "project": "p2"})
        r = client.post("/api/chat/knowledge/search", json={"query": "内容", "category": "网络", "project": "p1"})
        hits = r.json()["hits"]
        assert len(hits) == 1
        assert hits[0]["title"] == "网络A"


def test_knowledge_api_auth_401(tmp_path, monkeypatch):
    _isolate_knowledge(tmp_path, monkeypatch)
    settings.auth_token = "knowledge-api-token"
    try:
        app = _build_app(with_auth=True)
        with TestClient(app) as client:
            r = client.get("/api/chat/knowledge")
            assert r.status_code == 401
            r2 = client.get("/api/chat/knowledge", headers={"X-MC-Auth-Token": "knowledge-api-token"})
            assert r2.status_code == 200
    finally:
        settings.auth_token = ""
