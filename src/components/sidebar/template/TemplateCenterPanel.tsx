import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'
import { usePlatformStore } from '@/stores/platform.store'
import { showError, showSuccess } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import clsx from 'clsx'
import type { TemplateInfo, TemplateMeta } from '@/types/project'
import type { RemoteTemplate } from '@/api/platform'
import { TemplateCard } from './TemplateCard'
import { TemplateEditDialog } from './TemplateEditDialog'
import { TemplateListToolbar } from './TemplateListToolbar'

type TemplateCenterPanelProps = {
  onCreateProjectName?: (name: string) => string
}

export function TemplateCenterPanel({ onCreateProjectName }: TemplateCenterPanelProps) {
  const { t } = useTranslation('project')
  const isDark = useUIStore((s) => s.isDark)
  const templates = useProjectStore((s) => s.templates)
  const fetchTemplates = useProjectStore((s) => s.fetchTemplates)
  const createProject = useProjectStore((s) => s.createProject)
  const updateTemplateMeta = useProjectStore((s) => s.updateTemplateMeta)
  const deleteTemplate = useProjectStore((s) => s.deleteTemplate)

  // Platform remote templates
  const loggedIn = usePlatformStore((s) => s.loggedIn)
  const remoteTemplates = usePlatformStore((s) => s.remoteTemplates)
  const remoteLoading = usePlatformStore((s) => s.remoteLoading)
  const remoteError = usePlatformStore((s) => s.remoteError)
  const fetchRemoteTemplates = usePlatformStore((s) => s.fetchRemoteTemplates)

  const [tab, setTab] = useState<'local' | 'remote'>('local')
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'updatedAt' | 'sourceProject'>('name')
  const [category, setCategory] = useState<string>('all')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<TemplateInfo | null>(null)

  // 创建项目弹窗
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [createDialogName, setCreateDialogName] = useState('')
  const [createDialogTemplate, setCreateDialogTemplate] = useState<TemplateInfo | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchTemplates().catch((err) => showError(t('template.readFailed', { message: (err as Error).message })))
  }, [fetchTemplates])

  const visibleTemplates = useMemo(() => {
    const lower = query.trim().toLowerCase()
    let filtered = lower
      ? templates.filter((item) =>
          [item.name, item.description, item.scenario, item.sourceProject]
            .join(' ')
            .toLowerCase()
            .includes(lower),
        )
      : templates
    if (category !== 'all') {
      filtered = filtered.filter((item) => item.scenario === category)
    }
    return [...filtered].sort((a, b) => {
      if (sortBy === 'updatedAt') return b.updatedAt.localeCompare(a.updatedAt)
      if (sortBy === 'sourceProject') return a.sourceProject.localeCompare(b.sourceProject)
      return a.name.localeCompare(b.name)
    })
  }, [query, sortBy, templates, category])

  const categories = useMemo(() => {
    const cats = new Set(templates.map((item) => item.scenario).filter(Boolean))
    return ['all', ...Array.from(cats).sort()]
  }, [templates])

  const openCreateDialog = (template: TemplateInfo) => {
    const defaultName = onCreateProjectName
      ? onCreateProjectName(template.name)
      : `${template.name}-project`
    setCreateDialogName(defaultName)
    setCreateDialogTemplate(template)
    setCreateDialogOpen(true)
  }

  const handleCreate = async () => {
    if (!createDialogTemplate || !createDialogName.trim()) return
    setCreating(true)
    try {
      await createProject(createDialogName.trim(), { template: createDialogTemplate.id })
      showSuccess(t('template.createFromTemplate', { name: createDialogName.trim() }))
      setCreateDialogOpen(false)
    } catch (err) {
      showError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const editTemplate = async (template: TemplateInfo, meta: Partial<TemplateMeta>) => {
    try {
      await updateTemplateMeta(template.id, meta)
      showSuccess(t('template.updated'))
    } catch (err) {
      showError((err as Error).message)
      throw err
    }
  }

  const removeTemplate = async (template: TemplateInfo) => {
    if (!window.confirm(t('template.confirmDelete', { name: template.name }))) return
    try {
      await deleteTemplate(template.id)
      if (selectedTemplateId === template.id) setSelectedTemplateId(null)
      showSuccess(t('template.deleted'))
    } catch (err) {
      showError((err as Error).message)
    }
  }

  // Fetch remote templates on tab switch
  useEffect(() => {
    if (tab === 'remote') {
      fetchRemoteTemplates().catch(() => {})
    }
  }, [tab, fetchRemoteTemplates])

  const handleDownloadRemote = (tpl: RemoteTemplate) => {
    const url = `http://localhost:18720/api/templates/${tpl.owner}/${tpl.name}/download`
    window.open(url, '_blank')
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Tab switcher */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setTab('local')}
          className={clsx(
            'flex-1 py-2 text-xs font-medium transition-colors',
            tab === 'local'
              ? 'text-indigo-400 border-b-2 border-indigo-400'
              : 'text-gray-500 hover:text-gray-300',
          )}
        >
          本地
        </button>
        <button
          onClick={() => setTab('remote')}
          className={clsx(
            'flex-1 py-2 text-xs font-medium transition-colors',
            tab === 'remote'
              ? 'text-indigo-400 border-b-2 border-indigo-400'
              : 'text-gray-500 hover:text-gray-300',
          )}
        >
          远程
        </button>
      </div>

      {tab === 'local' ? (
        <>
          <TemplateListToolbar
            query={query}
            sortBy={sortBy}
            category={category}
            categories={categories}
            onQueryChange={setQuery}
            onSortChange={setSortBy}
            onCategoryChange={setCategory}
          />
          <div className="flex-1 overflow-auto p-2 space-y-1.5">
            {visibleTemplates.length === 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400 p-2 text-center">
                {t('template.noTemplates')}
              </div>
            ) : (
              visibleTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  selected={selectedTemplateId === template.id}
                  onSelect={() => setSelectedTemplateId(template.id)}
                  onCreateProject={() => openCreateDialog(template)}
                  onEdit={() => setEditingTemplate(template)}
                  onDelete={() => removeTemplate(template)}
                />
              ))
            )}
          </div>
        </>
      ) : (
        /* Remote templates tab */
        <div className="flex-1 overflow-auto p-2 space-y-1.5">
          {!loggedIn && (
            <div className="text-xs text-gray-500 p-2 text-center">
              请先登录平台以浏览远程模板
            </div>
          )}
          {remoteLoading && (
            <div className="text-xs text-gray-500 p-2 text-center">加载中...</div>
          )}
          {remoteError && (
            <div className="text-xs text-red-400 p-2 text-center">{remoteError}</div>
          )}
          {loggedIn && !remoteLoading && remoteTemplates.length === 0 && (
            <div className="text-xs text-gray-500 p-2 text-center">暂无远程模板</div>
          )}
          {loggedIn &&
            remoteTemplates.map((tpl, idx) => (
              <div
                key={`${tpl.owner}/${tpl.name}/${idx}`}
                className={clsx(
                  'p-2.5 rounded-lg border transition-colors',
                  isDark
                    ? 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
                    : 'border-gray-200 bg-white hover:bg-gray-50',
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">
                      {tpl.owner}/{tpl.name}
                    </div>
                    {tpl.description && (
                      <p className={clsx('text-[11px] mt-0.5 line-clamp-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        {tpl.description}
                      </p>
                    )}
                    {tpl.updated_at && (
                      <p className="text-[10px] text-gray-500 mt-1">
                        {new Date(tpl.updated_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDownloadRemote(tpl)}
                    className="ml-2 px-2 py-0.5 text-[11px] rounded bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 transition-colors shrink-0"
                  >
                    下载
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* 模板编辑弹窗 */}
      <TemplateEditDialog
        open={editingTemplate !== null}
        template={editingTemplate}
        onClose={() => setEditingTemplate(null)}
        onSubmit={(meta) => {
          if (!editingTemplate) return Promise.resolve()
          return editTemplate(editingTemplate, meta)
        }}
      />

      {/* 创建项目弹窗 */}
      <Modal
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title={t('template.createProject') || '创建项目'}
        width="400px"
        footer={
          <>
            <button
              onClick={() => setCreateDialogOpen(false)}
              className={clsx(
                'px-4 py-1.5 text-sm rounded border transition-colors',
                isDark
                  ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50',
              )}
            >
              {t('template.edit.cancel')}
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !createDialogName.trim()}
              className={clsx(
                'px-4 py-1.5 text-sm rounded transition-colors',
                'bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50',
              )}
            >
              {creating ? t('template.creating') || '创建中...' : t('template.create') || '创建'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className={clsx('text-xs font-medium mb-1 block', isDark ? 'text-gray-300' : 'text-gray-600')}>
              {t('template.enterProjectName')}
            </label>
            <input
              type="text"
              value={createDialogName}
              onChange={(e) => setCreateDialogName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              autoFocus
              className={clsx(
                'w-full px-3 py-2 text-sm rounded border outline-none focus:border-primary-400',
                isDark ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-white border-gray-300 text-gray-900',
              )}
              placeholder={t('template.enterProjectName')}
            />
          </div>
          {createDialogTemplate && (
            <p className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
              模板: <span className="font-medium">{createDialogTemplate.name}</span>
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
