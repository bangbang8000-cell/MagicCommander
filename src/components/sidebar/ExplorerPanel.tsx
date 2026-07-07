import { useProjectStore } from '@/stores/project.store'
import { useRenderStore } from '@/stores/render.store'
import { ProjectExplorer } from '@/components/common/ProjectExplorer'
import { Search, Plus, Trash2, FolderOpen, Star, Clock, Folder } from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'
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
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const deleteProjects = useProjectStore((s) => s.deleteProjects)
  const projectError = useProjectStore((s) => s.error)
  const favoriteProjects = useProjectStore((s) => s.favoriteProjects)
  const recentProjects = useProjectStore((s) => s.recentProjects)
  const toggleFavorite = useProjectStore((s) => s.toggleFavorite)
  const setSelectedIds = useRenderStore((s) => s.setSelectedIds)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [templateOption, setTemplateOption] = useState<TemplateOption>('example')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)

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
      await createProject(trimmed)
      showSuccess(t('explorer.projectCreatedWithName', { name: trimmed }))
      await fetchProjects()
      setNewProjectName('')
      setCreateOpen(false)
      setTimeout(() => {
        const state = (useProjectStore.getState as () => { projects: ProjectInfo[] })?.()
        const list = state?.projects ?? []
        const found = list.find((p) => p.name === trimmed)
        if (found) selectProject(found)
      }, 100)
    } catch (err) {
      showError((err as Error).message)
    } finally {
      setCreateLoading(false)
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

  const filtered = search
    ? projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : projects

  const favoriteList = filtered.filter((p) => favoriteProjects.includes(p.id))
  const recentList = filtered.filter(
    (p) => recentProjects.includes(p.id) && !favoriteProjects.includes(p.id),
  )
  const allList = filtered.filter(
    (p) => !favoriteProjects.includes(p.id) && !recentProjects.includes(p.id),
  )

  const renderProjectRow = (p: ProjectInfo) => {
    const isSelected = selectedProject?.id === p.id
    const isFav = favoriteProjects.includes(p.id)
    return (
      <div
        key={p.id}
        className={clsx(
          'flex items-center gap-1 px-3 py-1.5 text-xs transition-colors cursor-pointer',
          isSelected
            ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
        )}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleFavorite(p.id)
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
            const wasSelected = selectedProject?.id === p.id
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
              .then((workspacePath) =>
                window.electron.shell.showItemInFolder(`${workspacePath}/${p.name}`),
              )
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
        {items.map(renderProjectRow)}
      </div>
    )
  }

  const showEmptyHint = filtered.length === 0
  const showAllGroups = !showEmptyHint && (favoriteList.length > 0 || recentList.length > 0 || allList.length > 0)

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
              'focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-transparent'
            )}
          />
        </div>
      </div>

      {/* 项目列表区域 */}
      <div className="border-b flex-none overflow-auto max-h-[40%] border-gray-200 dark:border-gray-700">
        <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider flex items-center justify-between bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
          <span>{t('explorer.projectList')}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setNewProjectName('')
                setTemplateOption('example')
                setCreateError('')
                setCreateOpen(true)
              }}
              title={t('explorer.newProject')}
              className="px-1.5 py-0.5 rounded border text-[10px] font-normal flex items-center gap-0.5 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              <Plus size={10} />
              {t('explorer.newButton')}
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
        {showEmptyHint ? (
          <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
            {projectError ? (
              <span className="text-red-500">{t('explorer.loadFailed')}: {projectError}</span>
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
                {renderGroup(t('explorer.recent'), <Clock size={10} className="text-gray-400 dark:text-gray-500" />, recentList)}
                {renderGroup(t('explorer.allProjectsGroup'), <Folder size={10} className="text-gray-400 dark:text-gray-500" />, allList)}
              </>
            )}
          </>
        )}
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
                'focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400'
              )}
            />
            {createError && <p className="text-xs text-red-500 mt-1">{createError}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              {t('explorer.projectTemplate')}
            </label>
            <div className="space-y-2">
              <label
                className="flex items-start gap-2 p-2.5 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <input
                  type="radio"
                  checked={templateOption === 'example'}
                  onChange={() => setTemplateOption('example')}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('explorer.useExampleTemplate')}</div>
                  <div className="text-xs mt-0.5 text-gray-500 dark:text-gray-400">
                    {t('explorer.exampleTemplateDesc')}
                  </div>
                </div>
              </label>
              <label
                className="flex items-start gap-2 p-2.5 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <input
                  type="radio"
                  checked={templateOption === 'empty'}
                  onChange={() => setTemplateOption('empty')}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('explorer.emptyProject')}</div>
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
    </div>
  )
}
