"""知识库引擎（5.0.5-505-b）：领域事实知识条目 + 检索式注入

设计（与技能引擎解耦：知识是领域事实，技能是操作指引）：
- 知识条目 = knowledge/*.md（纯 Markdown 内容）+ 伴生 <key>.meta.json（title/category/tags/project/时间戳）。
- 持久化：<workspace>/knowledge/（由 Electron 传入 workspace，运行时 init_dir 指定）。
- 检索式注入：search(query, category, project, top_k) 按关键词/分类/项目召回 Top-K（默认 5）
  + get_knowledge_prompt(query, project) 拼接为系统提示词上下文段（供 505-c 注入）。
- API：list_entries / get_entry / add_entry / update_entry / delete_entry / search。
- 知识变更（add/update/delete）调用 prompts.loader.invalidate_system_prompt_cache，
  使会话内 system prompt 在下次对话刷新（复用记忆/技能的失效机制）。
"""
import json
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# 默认知识库目录（未 init_dir 时的回落；运行时由 workspace 覆盖）
KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"

# 检索默认 Top-K 与关键词得分阈值（可配）
KNOWLEDGE_DEFAULT_TOP_K = 5
KNOWLEDGE_MIN_SCORE = 0.5        # 低于该得分视为无关，不召回（query 非空时生效）
KNOWLEDGE_TITLE_HIT = 3.0        # 标题命中
KNOWLEDGE_TEXT_HIT = 1.5         # 正文/标签/分类命中
KNOWLEDGE_PROJECT_BOOST = 2.0    # 项目精确匹配加成
KNOWLEDGE_CATEGORY_BOOST = 1.0   # 分类匹配加成
KNOWLEDGE_MISS_PENALTY = 0.5     # 词未命中惩罚

KNOWLEDGE_META_SCHEMA = "mc.knowledge-meta/1"


def _now() -> str:
    from datetime import datetime
    return datetime.now().isoformat()


class KnowledgeEntry:
    """知识条目：key（md stem）+ 元数据 + 内容"""

    def __init__(self, key: str, file_path: Path, content: str = ""):
        self.key = key
        self.file_path = file_path
        self.content = content
        self.title: str = key
        self.category: str = "general"
        self.tags: list[str] = []
        self.project: str = ""
        self.created_at: str = ""
        self.updated_at: str = ""

    def to_dict(self, with_content: bool = True) -> dict:
        data = {
            "key": self.key,
            "title": self.title,
            "category": self.category,
            "tags": list(self.tags),
            "project": self.project,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
        if with_content:
            data["content"] = self.content
        return data

    def search_text(self) -> str:
        parts = [self.title, self.category, self.content]
        parts.extend(self.tags)
        return "\n".join(parts).lower()


def _empty_meta() -> dict:
    return {
        "schema": KNOWLEDGE_META_SCHEMA,
        "title": "",
        "category": "general",
        "tags": [],
        "project": "",
        "created_at": "",
        "updated_at": "",
    }


def tokenize(query: str) -> list[str]:
    """关键词切分：中文按 2-gram + 英文按空白分词（小写）。空串返回 []。"""
    q = (query or "").strip().lower()
    if not q:
        return []
    # 中文字符（连续段按 2-gram 切分）
    cjk = re.findall(r"[\u4e00-\u9fff]+", q)
    terms: list[str] = []
    for seg in cjk:
        if len(seg) == 1:
            terms.append(seg)
        else:
            terms.extend(seg[i : i + 2] for i in range(len(seg) - 1))
            terms.append(seg)
    # 英文/数字词
    terms.extend(re.findall(r"[a-z0-9][a-z0-9_.\-]+", q))
    # 去重保序
    seen = set()
    out = []
    for t in terms:
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


class KnowledgeEngine:
    def __init__(self):
        self.knowledge_dir: Path = KNOWLEDGE_DIR
        self.entries: dict[str, KnowledgeEntry] = {}
        self._loaded = False

    # ---- 路径辅助 ----
    def _safe_key(self, key: str) -> str:
        return (key or "").strip().lower().replace(" ", "-").replace("/", "-").replace("\\", "-")

    def _meta_path(self, key: str) -> Path:
        return self.knowledge_dir / f"{key}.meta.json"

    def _md_path(self, key: str) -> Path:
        return self.knowledge_dir / f"{key}.md"

    # ---- 初始化 / 加载 ----
    def init_dir(self, base_dir: str):
        """设置知识库根目录（<base_dir>/knowledge）并加载条目"""
        self.knowledge_dir = Path(base_dir) / "knowledge"
        self.knowledge_dir.mkdir(parents=True, exist_ok=True)
        self._loaded = False
        self.load_all()

    def load_all(self):
        if self._loaded:
            return
        self._loaded = True
        if not self.knowledge_dir.exists():
            return
        for md_file in self.knowledge_dir.glob("*.md"):
            try:
                content = md_file.read_text(encoding="utf-8")
                key = md_file.stem
                entry = KnowledgeEntry(key=key, file_path=md_file, content=content)
                self._load_meta(entry)
                self.entries[key] = entry
            except Exception as e:
                logger.error(f"Failed to load knowledge entry {md_file}: {e}")
        logger.info(f"Loaded {len(self.entries)} knowledge entries from {self.knowledge_dir}")

    def _load_meta(self, entry: KnowledgeEntry) -> None:
        meta_path = self._meta_path(entry.key)
        if not meta_path.exists():
            return
        try:
            data = json.loads(meta_path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                return
            entry.title = str(data.get("title") or entry.key)
            entry.category = str(data.get("category") or "general")
            entry.tags = list(data.get("tags") or [])
            entry.project = str(data.get("project") or "")
            entry.created_at = str(data.get("created_at") or "")
            entry.updated_at = str(data.get("updated_at") or "")
        except (OSError, ValueError) as e:
            logger.warning(f"Failed to load knowledge meta {meta_path}: {e}")

    def _save_meta(self, entry: KnowledgeEntry) -> bool:
        try:
            meta_path = self._meta_path(entry.key)
            meta_path.parent.mkdir(parents=True, exist_ok=True)
            meta_path.write_text(json.dumps({
                "schema": KNOWLEDGE_META_SCHEMA,
                "title": entry.title,
                "category": entry.category,
                "tags": entry.tags,
                "project": entry.project,
                "created_at": entry.created_at,
                "updated_at": entry.updated_at,
            }, ensure_ascii=False, indent=2), encoding="utf-8")
            return True
        except OSError as e:
            logger.error(f"Failed to save knowledge meta {entry.key}: {e}")
            return False

    def _persist_entry(self, entry: KnowledgeEntry) -> None:
        """写 md 内容 + meta；任一步失败抛 OSError（CRUD 属于用户显式操作，失败应暴露）"""
        entry.file_path.parent.mkdir(parents=True, exist_ok=True)
        entry.file_path.write_text(entry.content, encoding="utf-8")
        if not self._save_meta(entry):
            raise OSError(f"写入知识元数据失败: {entry.key}")

    # ---- CRUD ----
    def list_entries(self, category: str = "", project: str = "") -> list[dict]:
        """列出条目元信息（不含内容），可按分类/项目过滤；无过滤时按更新时间倒序"""
        items = []
        for entry in self.entries.values():
            if category and entry.category != category:
                continue
            if project and entry.project != project:
                continue
            items.append(entry.to_dict(with_content=False))
        items.sort(key=lambda d: (d.get("updated_at") or ""), reverse=True)
        return items

    def categories(self) -> list[str]:
        """全部已用分类（去重排序）"""
        return sorted({e.category for e in self.entries.values() if e.category})

    def get_entry(self, key: str) -> dict | None:
        safe = self._safe_key(key)
        entry = self.entries.get(safe)
        if not entry:
            return None
        return entry.to_dict(with_content=True)

    def add_entry(
        self,
        title: str,
        content: str,
        category: str = "general",
        tags: list[str] | None = None,
        project: str = "",
    ) -> dict:
        """新增知识条目；key 由 title 生成（与既有 key 冲突时自动加序号避免覆盖）"""
        if not title or not str(title).strip():
            raise ValueError("知识标题不能为空")
        base = self._safe_key(title)
        if not base:
            raise ValueError("知识标题不能为空")
        key = base
        counter = 1
        while key in self.entries or self._md_path(key).exists():
            key = f"{base}-{counter}"
            counter += 1
        now = _now()
        entry = KnowledgeEntry(key=key, file_path=self._md_path(key), content=str(content or ""))
        entry.title = str(title).strip()
        entry.category = str(category or "general").strip() or "general"
        entry.tags = [str(t) for t in (tags or []) if str(t).strip()]
        entry.project = str(project or "").strip()
        entry.created_at = now
        entry.updated_at = now
        self._persist_entry(entry)
        self.entries[key] = entry
        self._invalidate()
        return entry.to_dict(with_content=True)

    def update_entry(self, key: str, **fields) -> dict | None:
        """更新条目（title/content/category/tags/project 任一）；不存在返回 None"""
        safe = self._safe_key(key)
        entry = self.entries.get(safe)
        if not entry:
            return None
        if "title" in fields and fields["title"] is not None:
            entry.title = str(fields["title"]).strip() or entry.title
        if "content" in fields and fields["content"] is not None:
            entry.content = str(fields["content"])
        if "category" in fields and fields["category"] is not None:
            entry.category = str(fields["category"]).strip() or "general"
        if "tags" in fields and fields["tags"] is not None:
            entry.tags = [str(t) for t in fields["tags"] if str(t).strip()]
        if "project" in fields and fields["project"] is not None:
            entry.project = str(fields["project"]).strip()
        entry.updated_at = _now()
        self._persist_entry(entry)
        self._invalidate()
        return entry.to_dict(with_content=True)

    def delete_entry(self, key: str) -> bool:
        """删除条目（md + meta）；不存在返回 False 不抛错"""
        safe = self._safe_key(key)
        entry = self.entries.get(safe)
        if not entry:
            return False
        try:
            entry.file_path.unlink()
            meta = self._meta_path(safe)
            if meta.exists():
                meta.unlink()
        except OSError:
            return False
        self.entries.pop(safe, None)
        self._invalidate()
        return True

    # ---- 检索 ----
    def search(
        self,
        query: str = "",
        category: str = "",
        project: str = "",
        top_k: int | None = None,
    ) -> list[dict]:
        """检索式召回：分类/项目为过滤器，关键词按得分排序取 Top-K（默认 5）。

        - category/project 任一提供时仅召回匹配条目（严格过滤）。
        - query 为空：过滤器内按更新时间倒序取 Top-K。
        - query 非空：得分 < KNOWLEDGE_MIN_SCORE 的条目不召回。
        """
        return self._search_scored(query, category, project, top_k=top_k, boost_project=project)

    def _search_scored(
        self,
        query: str,
        category: str = "",
        project: str = "",
        top_k: int | None = None,
        boost_project: str = "",
    ) -> list[dict]:
        """检索核心：project 为严格过滤；boost_project 单独控制项目得分加成（注入用软偏好）"""
        k = int(top_k) if top_k is not None else KNOWLEDGE_DEFAULT_TOP_K
        k = max(1, min(k, 100))
        terms = tokenize(query)
        scored = []
        for entry in self.entries.values():
            if category and entry.category != category:
                continue
            if project and entry.project != project:
                continue
            if terms:
                score = self._score(entry, terms, boost_project)
                if score < KNOWLEDGE_MIN_SCORE:
                    continue
            else:
                score = 0.0
            scored.append((score, entry))
        if terms:
            scored.sort(key=lambda x: x[0], reverse=True)
        else:
            scored.sort(key=lambda x: (x[1].updated_at or ""), reverse=True)
        return [entry.to_dict(with_content=True) for _, entry in scored[:k]]

    def _score(self, entry: KnowledgeEntry, terms: list[str], project: str = "") -> float:
        """关键词 + 项目/分类加成 计分"""
        text = entry.search_text()
        title = entry.title.lower()
        score = 0.0
        for term in terms:
            if term in title:
                score += KNOWLEDGE_TITLE_HIT
            elif term in text:
                score += KNOWLEDGE_TEXT_HIT
            else:
                score -= KNOWLEDGE_MISS_PENALTY
        if project and entry.project == project:
            score += KNOWLEDGE_PROJECT_BOOST
        elif entry.category and term_in_text(entry.category, terms):
            score += KNOWLEDGE_CATEGORY_BOOST
        return score

    # ---- 注入（供 505-c loader.py） ----
    def get_knowledge_prompt(
        self,
        query: str = "",
        project_name: str = "",
        top_k: int | None = None,
        ids: list[str] | None = None,
    ) -> str:
        """拼接知识库上下文段（检索 Top-K / 指定 ids）；无命中返回空串"""
        if not query and not project_name and not ids:
            return ""
        if ids:
            entries = []
            for key in ids:
                safe = self._safe_key(key)
                e = self.entries.get(safe)
                if e:
                    entries.append(e)
        else:
            # 注入用软偏好：项目名只做得分加成（boost），不做严格过滤
            hits = self._search_scored(query, category="", project="", top_k=top_k, boost_project=project_name)
            entries = []
            for h in hits:
                e = self.entries.get(h["key"])
                if e:
                    entries.append(e)
            if not entries and project_name:
                # 项目过滤兜底：query 无关但项目相关条目也注入
                entries = [self.entries[k] for k, e in self.entries.items()
                           if e.project == project_name][: (top_k or KNOWLEDGE_DEFAULT_TOP_K)]
        if not entries:
            return ""
        lines = ["## 知识库上下文"]
        for e in entries:
            lines.append(f"\n### [{e.title}]（{e.category}）")
            if e.project:
                lines.append(f"- 关联项目: {e.project}")
            if e.tags:
                lines.append(f"- 标签: {', '.join(e.tags)}")
            lines.append(str(e.content).strip())
        return "\n".join(lines)

    def _invalidate(self) -> None:
        """知识变更 → 使会话内 system prompt 缓存失效（下次对话刷新注入）"""
        try:
            from ai_hub.prompts.loader import invalidate_system_prompt_cache
            invalidate_system_prompt_cache()
        except Exception as e:
            logger.warning(f"Failed to invalidate system prompt cache: {e}")


def term_in_text(category: str, terms: list[str]) -> bool:
    """分类文本是否命中任一检索词（供计分辅助）"""
    c = category.lower()
    return any(t in c for t in terms)


_engine: KnowledgeEngine | None = None


def get_knowledge_engine() -> KnowledgeEngine:
    global _engine
    if _engine is None:
        _engine = KnowledgeEngine()
        _engine.load_all()
    return _engine
