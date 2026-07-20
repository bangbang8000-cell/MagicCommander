import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'
import { showError, showSuccess } from '@/components/ui/Toast'
import { ResizeHandle } from '@/components/common/ResizeHandle'
import type { TemplateInfo, TemplateMeta } from '@/types/project'
import { TemplateCard } from './TemplateCard'
import { TemplateDetail } from './TemplateDetail'
import { TemplateEditDialog } from './TemplateEditDialog'
import { TemplateListToolbar } from './TemplateListToolbar'

type TemplateCenterPanelProps = {
  onCreateProjectName?: (name: string) => string
}

export function TemplateCenterPanel({ onCreateProjectName }: TemplateCenterPanelProps) {
  const { t } = useTranslation('project')
  const templates = useProjectStore((s) => s.templates)
  const fetchTemplates = useProjectStore((s) => s.fetchTemplates)
  const createProject = useProjectStore((s) => s.createProject)
  const updateTemplateMeta = useProjectStore((s) => s.updateTemplateMeta)
  const deleteTemplate = useProjectStore((s) => s.deleteTemplate)
  const templateListHeight = useUIStore((s) => s.templateListHeight)
  const setTemplateListHeight = useUIStore((s) => s.setTemplateListHeight)
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'updatedAt' | 'sourceProject'>('name')
  const [viewMode, setViewMode] = useState<'card' | 'compact'>('card')
  const [category, setCategory] = useState<string>('all')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<TemplateInfo | null>(null)

  useEffect(() => {
    fetchTemplates().catch((err) => showError(t('template.readFailed', { message: (err as Error).message })))
  }, [fetchTemplates])

  const visibleTemplates = useMemo(() => {
    const lower = query.trim().toLowerCase()
    let filtered = lower
      ? templates.filter((item) => [item.name, item.description, item.scenario, item.sourceProject].join(' ').toLowerCase().includes(lower))
      : templates
    // 按分类过滤
    if (category !== 'all') {
      filtered = filtered.filter((item) => item.scenario === category)
    }
    return [...filtered].sort((a, b) => {
      if (sortBy === 'updatedAt') return b.updatedAt.localeCompare(a.updatedAt)
      if (sortBy === 'sourceProject') return a.sourceProject.localeCompare(b.sourceProject)
      return a.name.localeCompare(b.name)
    })
  }, [query, sortBy, templates, category])

  // 提取所有分类
  const categories = useMemo(() => {
    const cats = new Set(templates.map((item) => item.scenario).filter(Boolean))
    return ['all', ...Array.from(cats).sort()]
  }, [templates])

  const selectedTemplate = visibleTemplates.find((item) => item.id === selectedTemplateId) ?? visibleTemplates[0] ?? null

  const createFromTemplate = async (template: TemplateInfo) => {
    const defaultName = onCreateProjectName ? onCreateProjectName(template.name) : `${template.name}-project`
    const name = window.prompt(t('template.enterProjectName'), defaultName)
    if (!name?.trim()) return
    try {
      await createProject(name.trim(), { template: template.id })
      showSuccess(t('template.createFromTemplate', { name: name.trim() }))
    } catch (err) {
      showError((err as Error).message)
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
        viewMode={viewMode}
        category={category}
        categories={categories}
        onQueryChange={setQuery}
        onSortChange={setSortBy}
        onViewModeChange={setViewMode}
        onCategoryChange={setCategory}
      />
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div
          className="p-2 space-y-2 overflow-auto border-b border-gray-200 dark:border-gray-700"
          style={{ maxHeight: `${templateListHeight}px` }}
        >
          {visibleTemplates.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 p-2">{t('template.noTemplates')}</div>
          ) : (
            visibleTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                selected={selectedTemplate?.id === template.id}
                compact={viewMode === 'compact'}
                onSelect={() => setSelectedTemplateId(template.id)}
                onCreateProject={() => createFromTemplate(template)}
                onEdit={() => setEditingTemplate(template)}
                onDelete={() => removeTemplate(template)}
              />
            ))
          )}
        </div>
        <ResizeHandle
          direction="vertical"
          onResize={(delta) => setTemplateListHeight(templateListHeight + delta)}
        />
        <div className="flex-1 min-h-0 overflow-hidden">
          <TemplateDetail template={selectedTemplate} />
        </div>
      </div>
      <TemplateEditDialog
        open={editingTemplate !== null}
        template={editingTemplate}
        onClose={() => setEditingTemplate(null)}
        onSubmit={(meta) => {
          if (!editingTemplate) return Promise.resolve()
          return editTemplate(editingTemplate, meta)
        }}
      />
    </div>
  )
}