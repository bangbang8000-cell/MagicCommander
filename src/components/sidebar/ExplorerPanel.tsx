import { useProjectStore } from '@/stores/project.store'
import { useRenderStore } from '@/stores/render.store'
import { ProjectExplorer } from '@/components/common/ProjectExplorer'
import { Search, Plus, Trash2, FolderOpen, Star, Clock, Folder, Save, CheckSquare, Square, GripHorizontal, ArrowUpDown } from 'lucide-react'
import clsx from 'clsx'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { showError, showSuccess } from '@/components/ui/Toast'
import type { ProjectInfo } from '@/types/project'

type TemplateOption = 'example' | 'empty'

export function ExplorerPanel() {
  const projects = useProjectStore((s) => s.projects)
  const selectedProject = useProjectStore((s) => s.selectedProject)
  const selectProject = useProjectStore((s) => s.selectProject)
  const createProject = useProjectStore((s) => s.createProject)
  const listExamples = useProjectStore((s) => s.listExamples)
  const saveAsExample = useProjectStore((s) => s.saveAsExample)
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const deleteProjects = useProjectStore((s) => s.deleteProjects)
  const projectError = useProjectStore((s) => s.error)
  const favoriteProjects = useProjectStore((s) => s.favoriteProjects)
  const recentProjects = useProjectStore((s) => s.recentProjects)
  const toggleFavorite = useProjectStore((s) => s.toggleFavorite)
  const pendingCreateDialog = useProjectStore((s) => s.pendingCreateDialog)
  const clearCreateTrigger = useProjectStore((s) => s.clearCreateTrigger)
  const setSelectedIds = useRenderStore((s) => s.setSelectedIds)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name')
  const [projectListHeight, setProjectListHeight] = useState(40)
  const [dragActive, setDragActive] = useState(false)
  const [selectedIds, setSelectedIdsLocal] = useState<Set<number>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [templateOption, setTemplateOption] = useState<TemplateOption>('example')
  const [exampleTemplates, setExampleTemplates] = useState<string[]>([])
  const [selectedExampleTemplate, setSelectedExampleTemplate] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [saveExampleOpen, setSaveExampleOpen] = useState(false)
  const [newExampleName, setNewExampleName] = useState('')
  const [saveExampleLoading, setSaveExampleLoading] = useState(false)

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
      showError(`读取示例模板失败: ${(err as Error).message}`)
    }
    setCreateOpen(true)
  }

  // 从菜单或外部触发创建项目对话框
  useEffect(() => {
    if (pendingCreateDialog) {
      openCreateDialog()
      clearCreateTrigger()
    }
  }, [pendingCreateDialog, clearCreateTrigger, createOpen])

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

  const handleSaveAsExample = async () => {
    if (!selectedProject) return
    const exampleName = newExampleName.trim()
    const error = validateName(exampleName)
    if (error) {
      showError(error)
      return
    }
    setSaveExampleLoading(true)
    try {
      await saveAsExample(selectedProject.name, exampleName)
      showSuccess(`已保存为示例: ${exampleName}`)
      setNewExampleName('')
      setSaveExampleOpen(false)
    } catch (err) {
      showError((err as Error).message)
    } finally {
      setSaveExampleLoading(false)
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
      showSuccess(`已删除 ${selectedIds.size} 个项目`)
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

  const renderProjectItem = (p: ProjectInfo) => {
    const isSelected = selectedProject?.name === p.name
    const isFav = favoriteProjects.includes(p.name)
    const isChecked = selectedIds.has(p.id)
    return (
      <div
        key={p.id}
        className={clsx(
          'flex items-center gap-1 px-2 py-1.5 text-xs transition-colors cursor-pointer',
          isSelected
            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
        )}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleSelect(p.id)
          }}
          className={clsx(
            'shrink-0 leading-none transition-colors',
            isChecked ? 'text-primary-500' : 'text-gray-400 dark:text-gray-500 hover:text-primary-400',
          )}
        >
          {isChecked ? <CheckSquare size={14} /> : <Square size={14} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleFavorite(p.name)
          }}
          title={isFav ? t('explorer.unfavorite') : t('explorer.favorite')}
          className={clsx(
            'shrink-0 leading-none transition-colors',
            isFav ? 'text-yellow-500' : 'text-gray-400 dark:text-gray-500 hover:text-yellow-500',
          )}
        >
          {isFav ? '★' : '☆'}
        </button>
        <button
          onClick={() => {
            const wasSelected = selectedProject?.name === p.name
            selectProject(p)
            if (!wasSelected) {
              setSelectedIds([String(p.id)])
            }
          }}
          className="flex items-center gap-1.5 flex-1 text-start min-w-0"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
          <span className="truncate">{p.name}</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            window.electron.app
              .getPath('workspace')
              .then((workspacePath) => window.electron.shell.showItemInFolder(`${workspacePath}/${p.name}`))
          }}
          className="p-0.5 rounded shrink-0 leading-none text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title={t('explorer.openInExplorer')}
        >
          <FolderOpen size={11} />
        </button>
      </div>
    )
  }

  const renderGroup = (title: string, icon: React.ReactNode, items: ProjectInfo[]) => {
    if (items.length === 0) return null
    return (
      <div key={title}>
        <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
          {icon}
          {title}
        </div>
        {items.map(renderProjectItem)}
      </div>
    )
  }

  const showEmptyHint = sorted.length === 0
  const showAllGroups = !showEmptyHint && (favoriteList.length > 0 || recentList.length > 0 || normalList.length > 0)

  return (
    <div className="flex flex-col h-full">
      {/* 搜索框 */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search size={12} className="absolute start-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('explorer.searchProjects')}
            className={clsx(
              'w-full ps-6 pe-2 py-1.5 text-xs border rounded-md transition-colors',
              'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600',
              'text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-transparent',
            )}
          />
        </div>
      </div>

      {/* 项目列表区域 */}
      <div className="border-b flex-none overflow-auto border-gray-200 dark:border-gray-700" style={{ maxHeight: `${projectListHeight}%` }}>
        <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider flex items-center justify-between bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
          <div className="flex items-center gap-2">
            <span>{t('explorer.projectList')}</span>
            <span className={clsx(
              'text-[10px] px-1.5 py-0.5 rounded-full font-normal',
              'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300',
            )}>
              {sorted.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleSelectAll}
              title={selectedIds.size === sorted.length ? '取消全选' : '全选'}
              className="px-1 py-0.5 rounded text-[10px] font-normal text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              {selectedIds.size === sorted.length ? <CheckSquare size={12} /> : <Square size={12} />}
            </button>
            <button
              onClick={() => setSortBy((s) => (s === 'name' ? 'date' : 'name'))}
              title={sortBy === 'name' ? '按名称排序' : '按日期排序'}
              className={clsx(
                'px-1 py-0.5 rounded text-[10px] font-normal flex items-center gap-0.5',
                'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600',
              )}
            >
              <ArrowUpDown size={10} />
              {sortBy === 'name' ? '名称' : '日期'}
            </button>
            <button
              onClick={openCreateDialog}
              title={t('explorer.newProject')}
              className="px-1.5 py-0.5 rounded border text-[10px] font-normal flex items-center gap-0.5 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              <Plus size={10} />
              {t('explorer.newButton')}
            </button>
            <button
              onClick={() => {
                if (selectedProject) {
                  setNewExampleName(`${selectedProject.name}_example`)
                  setSaveExampleOpen(true)
                }
              }}
              disabled={!selectedProject}
              title="存为示例"
              className="px-1.5 py-0.5 rounded border text-[10px] font-normal flex items-center gap-0.5 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-50"
            >
              <Save size={10} />
              存为示例
            </button>
            <button
              onClick={() => {
                if (selectedProject) setDeleteOpen(true)
              }}
              disabled={!selectedProject}
              title={t('explorer.deleteCurrentProject')}
              className="px-1.5 py-0.5 rounded border text-[10px] font-normal flex items-center gap-0.5 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
            >
              <Trash2 size={10} />
              {t('common:app.delete')}
            </button>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="px-2 py-1 flex items-center gap-2 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-200 dark:border-primary-800">
            <span className="text-[10px] text-primary-700 dark:text-primary-300">
              已选 {selectedIds.size} 个
            </span>
            <button
              onClick={batchRender}
              className="px-1.5 py-0.5 rounded text-[10px] bg-primary-500 text-white hover:bg-primary-600"
            >
              批量渲染
            </button>
            <button
              onClick={batchDelete}
              className="px-1.5 py-0.5 rounded text-[10px] bg-red-500 text-white hover:bg-red-600"
            >
              批量删除
            </button>
          </div>
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
          <>
            {showAllGroups && (
              <>
                {renderGroup(t('explorer.favorites'), <Star size={10} className="text-yellow-500" />, favoriteList)}
                {renderGroup(
                  t('explorer.recent'),
                  <Clock size={10} className="text-gray-400 dark:text-gray-500" />,
                  recentList,
                )}
                {renderGroup(
                  t('explorer.allProjectsGroup'),
                  <Folder size={10} className="text-gray-400 dark:text-gray-500" />,
                  normalList,
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* 拖动调整项目列表高度 */}
      <div
        className={clsx(
          'h-1 cursor-row-resize transition-colors flex items-center justify-center',
          dragActive ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-700 hover:bg-primary-400',
        )}
        onMouseDown={(e) => {
          e.preventDefault()
          setDragActive(true)
          const startY = e.clientY
          const container = (e.target as HTMLElement).parentElement!
          const containerHeight = container.getBoundingClientRect().height
          const startPercent = projectListHeight

          const onMouseMove = (ev: MouseEvent) => {
            const deltaY = ev.clientY - startY
            const deltaPercent = (deltaY / containerHeight) * 100
            const newPercent = Math.max(15, Math.min(70, startPercent + deltaPercent))
            setProjectListHeight(newPercent)
          }

          const onMouseUp = () => {
            setDragActive(false)
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
          }

          document.addEventListener('mousemove', onMouseMove)
          document.addEventListener('mouseup', onMouseUp)
        }}
      >
        <GripHorizontal size={12} className="text-gray-400 dark:text-gray-500" />
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        <ProjectExplorer />
      </div>

      {/* 新建项目对话框 */}
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
                    从 example 目录选择一个示例项目复制到 workspace
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

      {/* 删除项目对话框 */}
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

      {/* 存为示例对话框 */}
      <Modal
        open={saveExampleOpen}
        onClose={() => !saveExampleLoading && setSaveExampleOpen(false)}
        title="存为示例"
        width="400px"
        footer={
          <>
            <button
              onClick={() => setSaveExampleOpen(false)}
              disabled={saveExampleLoading}
              className="px-4 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              {t('common:app.cancel')}
            </button>
            <button
              onClick={handleSaveAsExample}
              disabled={saveExampleLoading}
              className="px-4 py-1.5 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              保存
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            将当前项目 <span className="font-semibold">{selectedProject?.name}</span> 保存到 example
            目录，运行输出目录不会复制。
          </p>
          <div>
            <label className="block text-xs font-medium mb-1.5 text-gray-700 dark:text-gray-300">示例名称</label>
            <input
              type="text"
              value={newExampleName}
              onChange={(e) => setNewExampleName(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border rounded-md bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
