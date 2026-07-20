import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'
import { showError, showSuccess } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import clsx from 'clsx'
import type { TemplateInfo, TemplateMeta } from '@/types/project'
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
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
