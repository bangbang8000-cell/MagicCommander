/**
 * 5.0.5-505-a：文档工作台（doc 一级导航视图）
 * 集中聚合：
 * - 文档：项目评审报告/评审包/评审 PDF 生成与导出（复用 review.py/handlers）+ 生成产物列表（时间/类型/状态）
 * - 指南：用户指南查看（guide:getContent + MarkdownViewer）
 * - 知识库：知识条目管理（5.0.5-505-b 子视图）
 */
import { useState, useEffect, useCallback } from 'react'
import clsx from 'clsx'
import { FileText, Package, FileDown, FolderOpen, BookOpen, RefreshCw, BookMarked, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
import { showSuccess, showError } from '@/components/ui/Toast'
import { MarkdownViewer } from '@/components/common/MarkdownViewer'
import { KnowledgePanel } from './KnowledgePanel'
import type { DocArtifact } from '@/types/ipc'

type DocTab = 'docs' | 'guide' | 'knowledge'

const TYPE_LABEL: Record<DocArtifact['type'], string> = {
  review: '评审报告',
  readme: 'README',
  package: '评审包',
  pdf: '评审 PDF',
  other: '文档',
}

function DocsSection() {
  const { t } = useTranslation('common')
  const selectedProject = useProjectStore((s) => s.selectedProject)
  const [artifacts, setArtifacts] = useState<DocArtifact[]>([])
  const [docsDir, setDocsDir] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const projectName = selectedProject?.name ?? ''

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await window.electron.doc.list()
      setArtifacts(r.artifacts || [])
      setDocsDir(r.docsDir || '')
    } catch {
      /* 列表失败静默 */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  const handleGenerate = async (kind: 'review' | 'readme') => {
    if (!projectName) {
      showError(t('doc.selectProject', { defaultValue: '请先在项目浏览器中选择一个项目' }))
      return
    }
    setBusy(true)
    try {
      await window.electron.doc.generate(projectName, kind)
      showSuccess(t('doc.generated', { defaultValue: '文档已生成' }))
      await load()
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async (kind: 'package' | 'pdf') => {
    if (!projectName) {
      showError(t('doc.selectProject', { defaultValue: '请先在项目浏览器中选择一个项目' }))
      return
    }
    setBusy(true)
    try {
      const r =
        kind === 'package'
          ? await window.electron.project.exportReviewPackage(projectName)
          : await window.electron.project.exportReviewPdf(projectName)
      showSuccess(r.data ? `${kind === 'package' ? '评审包' : '评审 PDF'}已导出: ${r.data.path}` : '已导出')
      await load()
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleOpenDir = async () => {
    try {
      await window.electron.doc.openDir()
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleReveal = async (artifact: DocArtifact) => {
    try {
      await window.electron.shell.showItemInFolder(artifact.path)
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    }
  }

  const actionBtn =
    'inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50'

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 当前项目操作区 */}
      <div className="p-2 border-b border-gray-200 dark:border-gray-700/60 shrink-0 space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
            {t('doc.currentProject', { defaultValue: '当前项目' })}:{' '}
            <span className="font-medium text-gray-700 dark:text-gray-200">{projectName || '—'}</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => void handleGenerate('review')} disabled={busy || !projectName} className={actionBtn}>
            <FileText size={12} />
            {t('doc.generateReview', { defaultValue: '生成评审报告' })}
          </button>
          <button onClick={() => void handleGenerate('readme')} disabled={busy || !projectName} className={actionBtn}>
            <BookOpen size={12} />
            {t('doc.generateReadme', { defaultValue: '生成 README' })}
          </button>
          <button onClick={() => void handleExport('package')} disabled={busy || !projectName} className={actionBtn}>
            <Package size={12} />
            {t('doc.exportPackage', { defaultValue: '导出评审包' })}
          </button>
          <button onClick={() => void handleExport('pdf')} disabled={busy || !projectName} className={actionBtn}>
            <FileDown size={12} />
            {t('doc.exportPdf', { defaultValue: '导出评审 PDF' })}
          </button>
          <button onClick={() => void handleOpenDir()} className={actionBtn}>
            <FolderOpen size={12} />
            {t('doc.openDir', { defaultValue: '打开目录' })}
          </button>
          <button
            onClick={() => void load()}
            className={clsx(actionBtn, 'ml-auto')}
            title={t('doc.refresh', { defaultValue: '刷新' })}
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* 生成产物列表（时间/类型/状态） */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
            {t('doc.artifacts', { defaultValue: '生成产物' })}
            <span className="ml-1 text-gray-400">({artifacts.length})</span>
          </span>
        </div>
        {loading && (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 size={14} className="animate-spin mr-1.5" />
            {t('doc.loading', { defaultValue: '加载中…' })}
          </div>
        )}
        {!loading && artifacts.length === 0 && (
          <div className="flex flex-col items-center py-8 text-gray-400 gap-2">
            <FileText size={22} />
            <span className="text-[11px]">{t('doc.noArtifacts', { defaultValue: '暂无生成产物' })}</span>
          </div>
        )}
        {!loading &&
          artifacts.map((a) => (
            <div
              key={a.path}
              className="rounded-md border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/60 p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => void handleReveal(a)}
              title={a.path}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate flex-1">{a.name}</span>
                <span className="shrink-0 px-1.5 py-px text-[9px] rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                  {TYPE_LABEL[a.type]}
                </span>
                <span className="shrink-0 px-1.5 py-px text-[9px] rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                  {t('doc.ready', { defaultValue: '已生成' })}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                <span>{a.project || '—'}</span>
                <span>{new Date(a.mtime).toLocaleString()}</span>
                <span className="ml-auto">{(a.size / 1024).toFixed(1)} KB</span>
              </div>
            </div>
          ))}
      </div>
      {docsDir && (
        <div className="px-3 py-1.5 border-t border-gray-200 dark:border-gray-700/60 text-[10px] text-gray-400 truncate shrink-0">
          {docsDir}
        </div>
      )}
    </div>
  )
}

function GuideSection() {
  const { t } = useTranslation('common')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const lang = useUIStore.getState().language || 'zh-CN'
    window.electron.guide
      .getContent(lang)
      .then((r) => {
        if (!cancelled) {
          setContent(r.content)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <Loader2 size={14} className="animate-spin mr-1.5" />
        {t('doc.guideLoading', { defaultValue: '加载指南中…' })}
      </div>
    )
  }
  if (error) {
    return <div className="flex items-center justify-center h-full text-[11px] text-red-500">{error}</div>
  }
  return (
    <div className="h-full overflow-hidden">
      <MarkdownViewer content={content} title={t('doc.guideTitle', { defaultValue: '用户指南' })} inline />
    </div>
  )
}

export function DocPanel() {
  const { t } = useTranslation('common')
  const isDark = useUIStore((s) => s.isDark)
  const [tab, setTab] = useState<DocTab>('docs')

  const tabs: Array<{ id: DocTab; label: string; icon: React.ReactNode }> = [
    { id: 'docs', label: t('doc.tabDocs', { defaultValue: '文档' }), icon: <FileText size={12} /> },
    { id: 'guide', label: t('doc.tabGuide', { defaultValue: '指南' }), icon: <BookOpen size={12} /> },
    { id: 'knowledge', label: t('doc.tabKnowledge', { defaultValue: '知识库' }), icon: <BookMarked size={12} /> },
  ]

  return (
    <div
      className={clsx(
        'flex flex-col h-full overflow-hidden',
        isDark ? 'bg-gray-900 text-gray-200' : 'bg-white text-gray-800',
      )}
    >
      <div className="flex gap-1 p-2 border-b border-gray-200 dark:border-gray-700/60 shrink-0">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={clsx(
              'inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded transition-colors',
              tab === tb.id
                ? 'bg-primary-500 text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
            )}
          >
            {tb.icon}
            {tb.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden relative">
        {tab === 'docs' && <DocsSection />}
        {tab === 'guide' && <GuideSection />}
        {tab === 'knowledge' && <KnowledgePanel />}
      </div>
    </div>
  )
}
