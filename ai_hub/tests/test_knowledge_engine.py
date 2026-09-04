"""5.0.5-505-b 知识库引擎测试：CRUD / 检索召回 / 注入拼接 / 持久化 / 缓存失效

覆盖：
- add/get/update/delete/list/categories CRUD + 磁盘持久化（md + meta）
- search：关键词 Top-K 召回、分类/项目过滤、Top-K 截断、无关条目不召回
- get_knowledge_prompt：拼接知识库上下文段 / 空库返回空串 / 指定 ids / 项目偏好加成
- 知识变更触发 system prompt 缓存失效（invalidate_system_prompt_cache 版本递增）
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import ai_hub.knowledge.engine as kb_engine
from ai_hub.knowledge.engine import KnowledgeEngine, get_knowledge_engine


def _make_engine(tmp_path, monkeypatch) -> KnowledgeEngine:
    monkeypatch.setattr(kb_engine, "KNOWLEDGE_DIR", tmp_path)
    eng = KnowledgeEngine()
    eng.load_all()
    return eng


def _prompt_version():
    from ai_hub.prompts.loader import get_system_prompt_version
    return get_system_prompt_version()


# --- CRUD ---

def test_add_entry_persists_md_and_meta(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    entry = eng.add_entry(
        title="RoCE 网络规划",
        content="RoCE 使用 PFC 与 ECN 保证无损传输。",
        category="网络",
        tags=["roce", "无损"],
        project="proj-a",
    )
    assert entry["key"] == "roce-网络规划"
    assert entry["title"] == "RoCE 网络规划"
    assert entry["category"] == "网络"
    assert entry["tags"] == ["roce", "无损"]
    assert entry["project"] == "proj-a"
    assert (tmp_path / "roce-网络规划.md").exists()
    meta = json.loads((tmp_path / "roce-网络规划.meta.json").read_text(encoding="utf-8"))
    assert meta["title"] == "RoCE 网络规划"
    assert meta["project"] == "proj-a"


def test_add_entry_empty_title_rejected(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    import pytest
    with pytest.raises(ValueError):
        eng.add_entry(title="   ", content="x")


def test_add_entry_key_conflict_appends_suffix(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.add_entry(title="同标题", content="a")
    entry2 = eng.add_entry(title="同标题", content="b")
    assert entry2["key"] != "同标题"
    assert entry2["content"] == "b"
    assert len(eng.entries) == 2


def test_get_entry_returns_content(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.add_entry(title="VLAN 规划", content="VLAN 100 为业务网", tags=["vlan"])
    detail = eng.get_entry("vlan-规划")
    assert detail is not None
    assert detail["content"] == "VLAN 100 为业务网"
    assert eng.get_entry("no_such") is None


def test_update_entry(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.add_entry(title="旧标题", content="旧内容", category="general")
    updated = eng.update_entry("旧标题", title="新标题", content="新内容", category="网络", tags=["x"])
    assert updated is not None
    assert updated["title"] == "新标题"
    assert updated["content"] == "新内容"
    assert updated["category"] == "网络"
    assert updated["tags"] == ["x"]
    assert (tmp_path / "旧标题.md").read_text(encoding="utf-8") == "新内容"
    assert eng.update_entry("no_such", content="x") is None


def test_delete_entry(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.add_entry(title="待删除", content="x")
    assert eng.delete_entry("待删除") is True
    assert "待删除" not in eng.entries
    assert not (tmp_path / "待删除.md").exists()
    assert not (tmp_path / "待删除.meta.json").exists()
    assert eng.delete_entry("待删除") is False


def test_list_entries_and_categories(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.add_entry(title="条目A", content="a", category="网络", project="p1")
    eng.add_entry(title="条目B", content="b", category="存储", project="p2")
    eng.add_entry(title="条目C", content="c", category="网络", project="p2")
    items = eng.list_entries()
    assert len(items) == 3
    assert all("content" not in i for i in items)
    net = eng.list_entries(category="网络")
    assert {i["key"] for i in net} == {"条目a", "条目c"}
    p2 = eng.list_entries(project="p2")
    assert {i["key"] for i in p2} == {"条目b", "条目c"}
    assert eng.categories() == ["存储", "网络"]


def test_reload_restores_entries_from_disk(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.add_entry(title="持久化条目", content="内容", category="网络", tags=["a"], project="p1")
    eng2 = _make_engine(tmp_path, monkeypatch)
    assert "持久化条目" in eng2.entries
    detail = eng2.get_entry("持久化条目")
    assert detail["content"] == "内容"
    assert detail["category"] == "网络"
    assert detail["project"] == "p1"


# --- search ---

def test_search_keyword_rank_and_topk(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.add_entry(title="RoCE 无损网络", content="PFC 与 ECN 保证无损", tags=["roce"])
    eng.add_entry(title="IB 无损网络", content="IB 拥塞控制", tags=["ib"])
    eng.add_entry(title="存储相关", content="NFS 挂载", tags=["storage"])
    hits = eng.search(query="无损", top_k=5)
    keys = [h["key"] for h in hits]
    assert "roce-无损网络" in keys
    assert "ib-无损网络" in keys
    assert "存储相关" not in keys
    assert all("content" in h for h in hits)


def test_search_topk_limits_results(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    for i in range(8):
        eng.add_entry(title=f"网络条目{i}", content="网络 内容", category="网络")
    hits = eng.search(query="网络", top_k=3)
    assert len(hits) == 3


def test_search_category_project_filter(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.add_entry(title="网络A", content="网络内容", category="网络", project="p1")
    eng.add_entry(title="网络B", content="网络内容", category="存储", project="p2")
    hits = eng.search(query="网络内容", category="网络", project="p1")
    assert [h["key"] for h in hits] == ["网络a"]
    hits2 = eng.search(query="网络内容", project="p2")
    assert [h["key"] for h in hits2] == ["网络b"]


def test_search_no_match_returns_empty(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.add_entry(title="VLAN", content="VLAN 规划", category="网络")
    hits = eng.search(query="完全不相关的关键词xyz")
    assert hits == []


def test_search_empty_query_returns_recent(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.add_entry(title="早条目", content="a")
    eng.add_entry(title="晚条目", content="b")
    hits = eng.search()
    assert hits[0]["key"] == "晚条目"


def test_search_negative_score_excluded(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.add_entry(title="网络", content="网络内容")
    # 大量无关词命中惩罚 → 得分低于阈值不召回
    hits = eng.search(query="zzz yyy xxx")
    assert hits == []


# --- get_knowledge_prompt 注入 ---

def test_knowledge_prompt_concatenates(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.add_entry(title="RoCE 规划", content="RoCE 无损配置要点", category="网络", project="proj-a")
    prompt = eng.get_knowledge_prompt(query="RoCE", project_name="proj-a")
    assert "## 知识库上下文" in prompt
    assert "RoCE 规划" in prompt
    assert "RoCE 无损配置要点" in prompt
    assert "网络" in prompt


def test_knowledge_prompt_empty_library(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    assert eng.get_knowledge_prompt(query="任意") == ""


def test_knowledge_prompt_specific_ids(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.add_entry(title="条目X", content="X内容")
    eng.add_entry(title="条目Y", content="Y内容")
    prompt = eng.get_knowledge_prompt(ids=["条目y"])
    assert "条目Y" in prompt
    assert "条目X" not in prompt


def test_knowledge_prompt_project_boost_prefers_match(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.add_entry(title="共享知识", content="通用内容", project="p1")
    eng.add_entry(title="无关知识", content="无关内容", project="p2")
    prompt = eng.get_knowledge_prompt(query="通用", project_name="p1")
    assert "共享知识" in prompt


def test_knowledge_prompt_project_fallback(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    eng.add_entry(title="项目文档", content="项目专属内容", project="my-project")
    prompt = eng.get_knowledge_prompt(query="", project_name="my-project")
    assert "项目文档" in prompt


# --- 缓存失效 ---

def test_knowledge_change_invalidates_prompt_cache(tmp_path, monkeypatch):
    eng = _make_engine(tmp_path, monkeypatch)
    v0 = _prompt_version()
    eng.add_entry(title="缓存失效", content="x")
    v1 = _prompt_version()
    assert v1 > v0
    eng.update_entry("缓存失效", content="y")
    v2 = _prompt_version()
    assert v2 > v1
    eng.delete_entry("缓存失效")
    v3 = _prompt_version()
    assert v3 > v2


# --- 单例 ---

def test_get_knowledge_engine_singleton(tmp_path, monkeypatch):
    monkeypatch.setattr(kb_engine, "KNOWLEDGE_DIR", tmp_path)
    kb_engine._engine = None
    a = get_knowledge_engine()
    b = get_knowledge_engine()
    assert a is b
    kb_engine._engine = None


def test_init_dir_sets_knowledge_dir(tmp_path, monkeypatch):
    eng = KnowledgeEngine()
    eng.init_dir(str(tmp_path))
    assert eng.knowledge_dir == tmp_path / "knowledge"
    assert (tmp_path / "knowledge").is_dir()
    assert eng.entries == {}
