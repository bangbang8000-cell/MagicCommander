import { useState, useEffect, useRef } from 'react'
import { useProjectStore } from '@/stores/project.store'
import { useRenderStore } from '@/stores/render.store'
import { useUIStore } from '@/stores/ui.store'
import { ProjectExplorer } from '@/components/common/ProjectExplorer'
import { ResizeHandle } from '@/components/common/ResizeHandle'
import { Modal } from '@/components/ui/Modal'
import { showError, showSuccess } from '@/components/ui/Toast'
import { ProjectListToolbar } from './project/ProjectListToolbar'
import { ProjectListItem } from './project/ProjectListItem'
import { ProjectBatchBar } from './project/ProjectBatchBar'
import { TemplateCenterPanel } from './template/TemplateCenterPanel'
import { Star, Clock, Folder } from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { usePlatformStore } from '@/stores/platform.store'
import { PushDialog } from '@/components/cloud/PushDialog'
import { PullDialog } from '@/components/cloud/PullDialog'


type TemplateOption = 'example' | 'empty'
type ExplorerTab = 'projects' | 'templates'

export function ExplorerPanel() {
  const projects = useProjectStore((s) => s.projects)
  const selectedProject = useProjectStore((s) => s.selectedProject)
  const selectProject = useProjectStore((s) => s.selectProject)
  const createProject = useProjectStore((s) => s.createProject)
  const listExamples = useProjectStore((s) => s.listExamples)
  const saveAsTemplate = useProjectStore((s) => s.saveAsTemplate)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const deleteProjects = useProjectStore((s) => s.deleteProjects)
  const projectError = useProjectStore((s) => s.error)
  const favoriteProjects = useProjectStore((s) => s.favoriteProjects)
  const recentProjects = useProjectStore((s) => s.recentProjects)
  const toggleFavorite = useProjectStore((s) => s.toggleFavorite)
  const pendingCreateDialog = useProjectStore((s) => s.pendingCreateDialog)
  const clearCreateTrigger = useProjectStore((s) => s.clearCreateTrigger)
  const setSelectedIds = useRenderStore((s) => s.setSelectedIds)
  const projectStatuses = useProjectStore((s) => s.projectStatuses)
  const explorerProjectListHeight = useUIStore((s) => s.explorerProjectListHeight)
  const setExplorerProjectListHeight = useUIStore((s) => s.setExplorerProjectListHeight)

  const [activeTab, setActiveTab] = useState<ExplorerTab>('projects')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name')
  const [selectedIds, setSelectedIdsLocal] = useState<Set<number>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [templateOption, setTemplateOption] = useState<TemplateOption>('example')
  const [exampleTemplates, setExampleTemplates] = useState<string[]>([])
  const [selectedExampleTemplate, setSelectedExampleTemplate] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [saveTemplateLoading, setSaveTemplateLoading] = useState(false)
  const [pushDialogProject, setPushDialogProject] = useState<string | null>(null)
  const [pullDialogProject, setPullDialogProject] = useState<string | null>(null)

  const syncStatuses = usePlatformStore((s) => s.syncStatuses)
  const loggedIn = usePlatformStore((s) => s.loggedIn)
  const checkSyncStatus = usePlatformStore((s) => s.checkSyncStatus)

  const { t } = useTranslation(['project', 'common'])

  const invalidChars = /[\\/:*?"<>|]/
  const invalidCharsHint = t('explorer.projectNameInvalidChars')
  const projectNamePlaceholder = t('explorer.projectNamePlaceholderFull')
  const validateName = (name: string): string => {
    if (!name.trim()) return t('explorer.projectNameEmpty')
    if (invalidChars.test(name)) return invalidCharsHint
    if (projects.some((p) => p.name === name.trim())) return t('explorer.projectAlreadyExists')
    return ''
  }

  const openCreateDialog = async () => {
    if (createOpen) return
    setNewProjectName('')
    setTemplateOption('example')
    setCreateError('')
    try {
      const templates = await listExamples()
      setExampleTemplates(templates)
      setSelectedExampleTemplate(templates[0] ?? '')
      if (templates.length === 0) setTemplateOption('empty')
    } catch (err) {
      setExampleTemplates([])
      setSelectedExampleTemplate('')
      setTemplateOption('empty')
      showError(t('explorer.readExampleFailed', { message: (err as Error).message }))
    }
    setCreateOpen(true)
  }

  const openCreateDialogRef = useRef(openCreateDialog)
  openCreateDialogRef.current = openCreateDialog

  useEffect(() => {
    if (pendingCreateDialog) {
      openCreateDialogRef.current()
      clearCreateTrigger()
    }
  }, [pendingCreateDialog, clearCreateTrigger])

  // 检查项目同步状态（登录后）
  useEffect(() => {
    if (loggedIn && projects.length > 0) {
      checkSyncStatus(projects.map((p) => ({ name: p.name })))
    }
  }, [loggedIn, projects, checkSyncStatus])

  const handleCreateProject = async () => {
    const trimmed = newProjectName.trim()
    const error = validateName(trimmed)
    if (error) {
      setCreateError(error)
      return
    }
    setCreateLoading(true)
    setCreateError('')
    try {
      await createProject(trimmed, templateOption === 'empty' ? { empty: true } : { template: selectedExampleTemplate })
      const list = useProjectStore.getState().projects
      const found = list.find((p) => p.name === trimmed)
      if (found) selectProject(found)
      showSuccess(t('explorer.projectCreatedWithName', { name: trimmed }))
      setNewProjectName('')
      setCreateOpen(false)
    } catch (err) {
      showError((err as Error).message)
    } finally {
      setCreateLoading(false)
    }
  }

  const handleSaveAsTemplate = async () => {
    if (!selectedProject) return
    const templateName = newTemplateName.trim()
    const error = validateName(templateName)
    if (error) {
      showError(error)
      return
    }
    setSaveTemplateLoading(true)
    try {
      await saveAsTemplate(selectedProject.name, templateName, {
        name: templateName,
        description: '',
        scenario: '',
        sourceProject: selectedProject.name,
        updatedAt: new Date().toISOString(),
        inputRequirements: [],
        outputDescription: '',
      })
      showSuccess(`已保存为模板: ${templateName}`)
      setNewTemplateName('')
      setSaveTemplateOpen(false)
    } catch (err) {
      showError((err as Error).message)
    } finally {
      setSaveTemplateLoading(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!selectedProject) return
    try {
      await deleteProjects([String(selectedProject.id)])
      showSuccess(t('explorer.projectDeletedWithName', { name: selectedProject.name }))
      await fetchProjects()
      selectProject(null)
      setDeleteOpen(false)
    } catch (err) {
      showError((err as Error).message)
    }
  }

  const filtered = search ? projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())) : projects

  const sorted = sortBy === 'date'
    ? [...filtered].sort((a, b) => (b.id ?? 0) - (a.id ?? 0))
    : [...filtered].sort((a, b) => a.name.localeCompare(b.name))

  const favoriteList = sorted.filter((p) => favoriteProjects.includes(p.name))
  const recentList = sorted.filter((p) => recentProjects.includes(p.name) && !favoriteProjects.includes(p.name))
  const normalList = sorted.filter((p) => !favoriteProjects.includes(p.name) && !recentProjects.includes(p.name))

  const toggleSelect = (id: number) => {
    setSelectedIdsLocal((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const allIds = sorted.map((p) => p.id)
    if (selectedIds.size === allIds.length) {
      setSelectedIdsLocal(new Set())
    } else {
      setSelectedIdsLocal(new Set(allIds))
    }
  }

  const batchDelete = async () => {
    if (selectedIds.size === 0) return
    try {
      await deleteProjects(Array.from(selectedIds).map(String))
      showSuccess(t('explorer.deletedProjects', { count: selectedIds.size }))
      await fetchProjects()
      setSelectedIdsLocal(new Set())
    } catch (err) {
      showError((err as Error).message)
    }
  }

  const batchRender = () => {
    if (selectedIds.size === 0) return
    setSelectedIds(Array.from(selectedIds).map(String))
  }

  const toggleSort = () => setSortBy((s) => (s === 'name' ? 'date' : 'name'))

  const showEmptyHint = sorted.length === 0
  const showAllGroups = !showEmptyHint && (favoriteList.length > 0 || recentList.length > 0 || normalList.length > 0)

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('projects')}
          className={clsx(
            'flex-1 py-1.5 text-xs font-medium text-center transition-colors',
            activeTab === 'projects'
              ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
          )}
        >
          {t('explorer.projectList')}
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={clsx(
            'flex-1 py-1.5 text-xs font-medium text-center transition-colors',
            activeTab === 'templates'
              ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
          )}
        >
          {t('explorer.templateCenter')}
        </button>
      </div>

      {activeTab === 'templates' ? (
        <div className="flex-1 min-h-0">
          <TemplateCenterPanel />
        </div>
      ) : (
        <>
          <ProjectListToolbar
            search={search}
            sortBy={sortBy}
            canSaveTemplate={selectedProject !== null}
            onSearchChange={setSearch}
            onToggleSort={toggleSort}
            onCreate={openCreateDialog}
            onSaveTemplate={() => {
              if (selectedProject) {
                setNewTemplateName(`${selectedProject.name}_template`)
                setSaveTemplateOpen(true)
              }
            }}
          />

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="overflow-auto" style={{ maxHeight: `${explorerProjectListHeight}px` }}>
              <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider flex items-center justify-between bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                <div className="flex items-center gap-2">
                  <span>{t('explorer.projectList')}</span>
                  <span className={clsx(
                    'text-[11px] px-1.5 py-0.5 rounded-full font-normal',
                    'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300',
                  )}>
                    {sorted.length}
                  </span>
                </div>
              </div>

              {selectedIds.size > 0 && (
                <ProjectBatchBar
                  selectedCount={selectedIds.size}
                  allSelected={selectedIds.size === sorted.length}
                  onToggleAll={toggleSelectAll}
                  onRender={batchRender}
                  onDelete={batchDelete}
                />
              )}

              {showEmptyHint ? (
                <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
                  {projectError ? (
                    <span className="text-red-500">
                      {t('explorer.loadFailed')}: {projectError}
                    </span>
                  ) : search ? (
                    t('explorer.noMatchingProjects')
                  ) : (
                    t('explorer.noProjects')
                  )}
                </div>
              ) : (
                showAllGroups && (
                  <>
                    {favoriteList.length > 0 && (
                      <div>
                        <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                          <Star size={10} className="text-yellow-500" />
                          {t('explorer.favorites')}
                        </div>
                        {favoriteList.map((p) => (
                          <ProjectListItem
                            key={p.id}
                            project={p}
                            status={projectStatuses[p.name]}
                            syncStatus={syncStatuses[p.name]}
                            selected={selectedProject?.name === p.name}
                            checked={selectedIds.has(p.id)}
                            favorite={true}
                            onToggleCheck={() => toggleSelect(p.id)}
                            onToggleFavorite={() => toggleFavorite(p.name)}
                            onSelect={() => {
                              selectProject(p)
                              setSelectedIds([String(p.id)])
                            }}
                            onOpenFolder={async () => {
                              const workspacePath = await window.electron.app.getPath('workspace')
                              window.electron.shell.showItemInFolder(`${workspacePath}/${p.name}`)
                            }}
                            onPush={loggedIn ? () => setPushDialogProject(p.name) : undefined}
                            onPull={loggedIn ? () => setPullDialogProject(p.name) : undefined}
                          />
                        ))}
                      </div>
                    )}
                    {recentList.length > 0 && (
                      <div>
                        <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                          <Clock size={10} className="text-gray-400 dark:text-gray-500" />
                          {t('explorer.recent')}
                        </div>
                        {recentList.map((p) => (
                          <ProjectListItem
                            key={p.id}
                            project={p}
                            status={projectStatuses[p.name]}
                            syncStatus={syncStatuses[p.name]}
                            selected={selectedProject?.name === p.name}
                            checked={selectedIds.has(p.id)}
                            favorite={false}
                            onToggleCheck={() => toggleSelect(p.id)}
                            onToggleFavorite={() => toggleFavorite(p.name)}
                            onSelect={() => {
                              selectProject(p)
                              setSelectedIds([String(p.id)])
                            }}
                            onOpenFolder={async () => {
                              const workspacePath = await window.electron.app.getPath('workspace')
                              window.electron.shell.showItemInFolder(`${workspacePath}/${p.name}`)
                            }}
                            onPush={loggedIn ? () => setPushDialogProject(p.name) : undefined}
                            onPull={loggedIn ? () => setPullDialogProject(p.name) : undefined}
                          />
                        ))}
                      </div>
                    )}
                    {normalList.length > 0 && (
                      <div>
                        <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                          <Folder size={10} className="text-gray-400 dark:text-gray-500" />
                          {t('explorer.allProjectsGroup')}
                        </div>
                        {normalList.map((p) => (
                          <ProjectListItem
                            key={p.id}
                            project={p}
                            status={projectStatuses[p.name]}
                            syncStatus={syncStatuses[p.name]}
                            selected={selectedProject?.name === p.name}
                            checked={selectedIds.has(p.id)}
                            favorite={false}
                            onToggleCheck={() => toggleSelect(p.id)}
                            onToggleFavorite={() => toggleFavorite(p.name)}
                            onSelect={() => {
                              selectProject(p)
                              setSelectedIds([String(p.id)])
                            }}
                            onOpenFolder={async () => {
                              const workspacePath = await window.electron.app.getPath('workspace')
                              window.electron.shell.showItemInFolder(`${workspacePath}/${p.name}`)
                            }}
                            onPush={loggedIn ? () => setPushDialogProject(p.name) : undefined}
                            onPull={loggedIn ? () => setPullDialogProject(p.name) : undefined}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )
              )}
            </div>

            <ResizeHandle
              direction="vertical"
              onResize={(delta) => setExplorerProjectListHeight(explorerProjectListHeight + delta)}
            />

            <div className="flex-1 overflow-hidden min-h-0">
              <ProjectExplorer />
            </div>
          </div>
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => !createLoading && setCreateOpen(false)}
        title={t('explorer.newProject')}
        width="440px"
        footer={
          <>
            <button
              onClick={() => setCreateOpen(false)}
              disabled={createLoading}
              className="px-4 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {t('common:app.cancel')}
            </button>
            <button
              onClick={handleCreateProject}
              disabled={createLoading}
              className="px-4 py-1.5 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {t('explorer.create')}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              {t('explorer.projectName')}
            </label>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => {
                setNewProjectName(e.target.value)
                if (createError) setCreateError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !createLoading) handleCreateProject()
              }}
              autoFocus
              placeholder={projectNamePlaceholder}
              className={clsx(
                'w-full px-3 py-1.5 text-sm border rounded-md transition-colors',
                'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600',
                'text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500',
                'focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400',
              )}
            />
            {createError && <p className="text-xs text-red-500 mt-1">{createError}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              {t('explorer.projectTemplate')}
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 p-2.5 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="radio"
                  checked={templateOption === 'example'}
                  disabled={exampleTemplates.length === 0}
                  onChange={() => setTemplateOption('example')}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t('explorer.useExampleTemplate')}
                  </div>
                  <div className="text-xs mt-0.5 text-gray-500 dark:text-gray-400">
                    <span dangerouslySetInnerHTML={{ __html: t('explorer.exampleDesc') }} />
                  </div>
                  <select
                    value={selectedExampleTemplate}
                    disabled={templateOption !== 'example' || exampleTemplates.length === 0}
                    onChange={(e) => setSelectedExampleTemplate(e.target.value)}
                    className="mt-2 w-full px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 disabled:opacity-50"
                  >
                    {exampleTemplates.length === 0 ? (
                      <option value="">没有可用示例</option>
                    ) : (
                      exampleTemplates.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </label>
              <label className="flex items-start gap-2 p-2.5 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <input
                  type="radio"
                  checked={templateOption === 'empty'}
                  onChange={() => setTemplateOption('empty')}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {t('explorer.emptyProject')}
                  </div>
                  <div className="text-xs mt-0.5 text-gray-500 dark:text-gray-400">
                    {t('explorer.emptyProjectDesc')}
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('explorer.deleteProject')}
        width="400px"
        footer={
          <>
            <button
              onClick={() => setDeleteOpen(false)}
              className="px-4 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {t('common:app.cancel')}
            </button>
            <button
              onClick={handleDeleteProject}
              className="px-4 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
            >
              {t('common:app.delete')}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-700 dark:text-gray-200">
          {t('explorer.deleteConfirmMessage', { name: selectedProject?.name })}
        </p>
      </Modal>

      <Modal
        open={saveTemplateOpen}
        onClose={() => !saveTemplateLoading && setSaveTemplateOpen(false)}
        title={t('explorer.saveAsTemplate')}
        width="400px"
        footer={
          <>
            <button
              onClick={() => setSaveTemplateOpen(false)}
              disabled={saveTemplateLoading}
              className="px-4 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {t('common:app.cancel')}
            </button>
            <button
              onClick={handleSaveAsTemplate}
              disabled={saveTemplateLoading}
              className="px-4 py-1.5 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {t('explorer.saveAsTemplateButton')}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <span dangerouslySetInnerHTML={{ __html: t('explorer.saveAsTemplateDesc', { name: selectedProject?.name }) }} />
          <div>
            <label className="block text-xs font-medium mb-1.5 text-gray-700 dark:text-gray-300">{t('explorer.saveAsTemplateName')}</label>
            <input
              type="text"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
            />
          </div>
        </div>
      </Modal>

      {pushDialogProject && (
        <PushDialog
          projectName={pushDialogProject}
          onClose={() => setPushDialogProject(null)}
          onSuccess={() => {
            setPushDialogProject(null)
            showSuccess(t('explorer.pushSuccess', { name: pushDialogProject }))
          }}
        />
      )}

      {pullDialogProject && (
        <PullDialog
          owner=""
          repo={pullDialogProject}
          projectName={pullDialogProject}
          existsLocally={false}
          onClose={() => setPullDialogProject(null)}
          onSuccess={() => {
            setPullDialogProject(null)
            showSuccess(t('explorer.pullSuccess', { name: pullDialogProject }))
          }}
        />
      )}
    </div>
  )
}