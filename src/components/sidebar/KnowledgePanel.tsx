/**
 * 5.0.5-505-b：知识库面板（文档工作台内子视图）
 * - 列表（标题/分类/标签/更新时间）+ 分类过滤
 * - 关键词检索（Top-K 召回含内容）
 * - 新增 / 编辑 / 删除（持久化 <workspace>/knowledge/）
 * - 点击条目展开内容预览
 */
import { useState, useEffect, useCallback } from 'react'
import clsx from 'clsx'
import { Search, Plus, Pencil, Trash2, BookMarked, Loader2, X } from 'lucide-react'
import { showSuccess, showError } from '@/components/ui/Toast'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/ui.store'
import type { KnowledgeEntryFull, KnowledgeEntryMeta } from '@/types/ipc'

interface EditorState {
  key?: string
  title: string
  content: string
  category: string
  tags: string
  project: string
}

const EMPTY_EDITOR: EditorState = { title: '', content: '', category: '', tags: '', project: '' }

export function KnowledgePanel() {
  const { t } = useTranslation('common')
  const isDark = useUIStore((s) => s.isDark)
  const [entries, setEntries] = useState<KnowledgeEntryMeta[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Record<string, string>>({})
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)

  const searchLabel = t('doc.knowledge.searchPlaceholder', { defaultValue: '检索关键词…' })
  const addLabel = t('doc.knowledge.add', { defaultValue: '新增知识' })
  const emptyLabel = t('doc.knowledge.empty', { defaultValue: '暂无知识条目，点击右上角新增' })
  const categoryAll = t('doc.knowledge.categoryAll', { defaultValue: '全部分类' })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const r = await window.electron.aihub.knowledgeList(category || undefined, undefined)
      setEntries(r.entries || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [category])

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  // 分类选项：挂载时从检索结果聚合一次
  useEffect(() => {
    window.electron.aihub
      .knowledgeSearch('', undefined, undefined, 100)
      .then((r) => {
        const cats = new Set<string>()
        for (const h of r.hits) if (h.category) cats.add(h.category)
        setCategories([...cats].sort())
      })
      .catch(() => {})
  }, [])

  const handleSearch = async () => {
    if (!query.trim()) {
      await load()
      return
    }
    setLoading(true)
    setError('')
    try {
      const r = await window.electron.aihub.knowledgeSearch(query.trim(), category || undefined, undefined, 20)
      setEntries(r.hits || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (entry: KnowledgeEntryMeta) => {
    try {
      const r = await window.electron.aihub.knowledgeDelete(entry.key)
      if (r.deleted === false) {
        showError(t('doc.knowledge.deleteFailed', { defaultValue: '删除失败' }))
        return
      }
      showSuccess(t('doc.knowledge.deleted', { defaultValue: '已删除知识条目' }))
      setEntries((prev) => prev.filter((e) => e.key !== entry.key))
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    }
  }

  const openEditor = async (entry?: KnowledgeEntryMeta) => {
    if (!entry) {
      setEditor({ ...EMPTY_EDITOR })
      return
    }
    try {
      const detail = await window.electron.aihub.knowledgeGet(entry.key)
      const e = detail.entry || (entry as KnowledgeEntryFull)
      setEditor({
        key: entry.key,
        title: e.title || '',
        content: e.content || '',
        category: e.category || '',
        tags: (e.tags || []).join(', '),
        project: e.project || '',
      })
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleSave = async () => {
    if (!editor) return
    if (!editor.title.trim()) {
      showError(t('doc.knowledge.titleRequired', { defaultValue: '标题不能为空' }))
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: editor.title.trim(),
        content: editor.content,
        category: editor.category.trim() || 'general',
        tags: editor.tags
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean),
        project: editor.project.trim(),
      }
      if (editor.key) {
        await window.electron.aihub.knowledgeUpdate(editor.key, payload)
      } else {
        await window.electron.aihub.knowledgeAdd(payload)
      }
      showSuccess(t('doc.knowledge.saved', { defaultValue: '已保存知识条目' }))
      setEditor(null)
      await load()
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleExpand = async (entry: KnowledgeEntryMeta) => {
    if (expanded[entry.key] !== undefined) {
      setExpanded((prev) => {
        const next = { ...prev }
        delete next[entry.key]
        return next
      })
      return
    }
    try {
      const detail = await window.electron.aihub.knowledgeGet(entry.key)
      setExpanded((prev) => ({ ...prev, [entry.key]: detail.entry?.content || '' }))
    } catch {
      /* 展开失败静默 */
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 工具栏：搜索 + 分类 + 新增 */}
      <div className="p-2 space-y-1.5 border-b border-gray-200 dark:border-gray-700/60 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 flex items-center gap-1 rounded border border-gray-300 dark:border-gray-600 px-2 py-1 bg-white dark:bg-gray-800">
            <Search size={12} className="text-gray-400 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={searchLabel}
              className="flex-1 min-w-0 bg-transparent text-xs outline-none text-gray-700 dark:text-gray-200"
            />
          </div>
          <button
            onClick={() => void handleSearch()}
            className="shrink-0 px-2 py-1 text-[11px] rounded border border-primary-300 dark:border-primary-700 text-primary-600 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/30"
          >
            {t('doc.knowledge.search', { defaultValue: '检索' })}
          </button>
          <button
            onClick={() => openEditor()}
            title={addLabel}
            className="shrink-0 p-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Plus size={13} />
          </button>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setCategory('')}
            className={clsx(
              'px-2 py-0.5 text-[10px] rounded-full border transition-colors',
              category === ''
                ? 'border-primary-400 text-primary-600 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30'
                : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400',
            )}
          >
            {categoryAll}
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={clsx(
                'px-2 py-0.5 text-[10px] rounded-full border transition-colors',
                category === c
                  ? 'border-primary-400 text-primary-600 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30'
                  : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {loading && (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 size={14} className="animate-spin mr-1.5" />
            {t('doc.knowledge.loading', { defaultValue: '加载中…' })}
          </div>
        )}
        {!loading && error && (
          <div className="px-2 py-3 text-[11px] text-red-500 bg-red-50 dark:bg-red-900/20 rounded">{error}</div>
        )}
        {!loading && !error && entries.length === 0 && (
          <div className="flex flex-col items-center py-8 text-gray-400 gap-2">
            <BookMarked size={22} />
            <span className="text-[11px]">{emptyLabel}</span>
          </div>
        )}
        {!loading &&
          !error &&
          entries.map((entry) => {
            const content = expanded[entry.key]
            return (
              <div
                key={entry.key}
                className="rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/60"
              >
                <div className="flex items-start gap-2 p-2 cursor-pointer" onClick={() => void toggleExpand(entry)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">
                        {entry.title}
                      </span>
                      {entry.category && (
                        <span className="shrink-0 px-1.5 py-px text-[9px] rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                          {entry.category}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                      {entry.project && <span>{entry.project}</span>}
                      {(entry.tags || []).slice(0, 3).map((tag) => (
                        <span key={tag} className="text-gray-400">
                          #{tag}
                        </span>
                      ))}
                      {entry.updated_at && (
                        <span className="ml-auto">{entry.updated_at.slice(0, 16).replace('T', ' ')}</span>
                      )}
                    </div>
                  </div>
                </div>
                {content !== undefined && (
                  <pre className="px-2 pb-2 text-[10px] text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                    {content || t('doc.knowledge.noContent', { defaultValue: '（无正文）' })}
                  </pre>
                )}
                <div className="flex items-center gap-1 px-2 pb-1.5">
                  <button
                    onClick={() => void openEditor(entry)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <Pencil size={10} /> {t('doc.knowledge.edit', { defaultValue: '编辑' })}
                  </button>
                  <button
                    onClick={() => void handleDelete(entry)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                  >
                    <Trash2 size={10} /> {t('doc.knowledge.delete', { defaultValue: '删除' })}
                  </button>
                </div>
              </div>
            )
          })}
      </div>

      {/* 新增/编辑弹层 */}
      {editor && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 p-3">
          <div
            className={clsx(
              'w-full max-w-md rounded-lg border p-3 shadow-lg',
              isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                {editor.key
                  ? t('doc.knowledge.editTitle', { defaultValue: '编辑知识' })
                  : t('doc.knowledge.addTitle', { defaultValue: '新增知识' })}
              </span>
              <button
                onClick={() => setEditor(null)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
              >
                <X size={13} />
              </button>
            </div>
            <div className="space-y-2">
              <input
                value={editor.title}
                onChange={(e) => setEditor((s) => s && { ...s, title: e.target.value })}
                placeholder={t('doc.knowledge.titlePlaceholder', { defaultValue: '标题 *' })}
                className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 outline-none text-gray-700 dark:text-gray-200"
              />
              <textarea
                value={editor.content}
                onChange={(e) => setEditor((s) => s && { ...s, content: e.target.value })}
                placeholder={t('doc.knowledge.contentPlaceholder', { defaultValue: '知识正文（Markdown）' })}
                rows={5}
                className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 outline-none text-gray-700 dark:text-gray-200 resize-y"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={editor.category}
                  onChange={(e) => setEditor((s) => s && { ...s, category: e.target.value })}
                  placeholder={t('doc.knowledge.categoryPlaceholder', { defaultValue: '分类' })}
                  className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 outline-none text-gray-700 dark:text-gray-200"
                />
                <input
                  value={editor.project}
                  onChange={(e) => setEditor((s) => s && { ...s, project: e.target.value })}
                  placeholder={t('doc.knowledge.projectPlaceholder', { defaultValue: '关联项目' })}
                  className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 outline-none text-gray-700 dark:text-gray-200"
                />
              </div>
              <input
                value={editor.tags}
                onChange={(e) => setEditor((s) => s && { ...s, tags: e.target.value })}
                placeholder={t('doc.knowledge.tagsPlaceholder', { defaultValue: '标签（逗号分隔）' })}
                className="w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 outline-none text-gray-700 dark:text-gray-200"
              />
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setEditor(null)}
                className="px-3 py-1 text-[11px] rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {t('doc.knowledge.cancel', { defaultValue: '取消' })}
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="px-3 py-1 text-[11px] rounded bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {saving
                  ? t('doc.knowledge.saving', { defaultValue: '保存中…' })
                  : t('doc.knowledge.save', { defaultValue: '保存' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
