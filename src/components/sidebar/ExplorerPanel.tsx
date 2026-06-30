import { useProjectStore } from '@/stores/project.store'
import { useRenderStore } from '@/stores/render.store'
import { ProjectExplorer } from '@/components/common/ProjectExplorer'
import { Search, Plus, Trash2, FolderOpen, Star, Clock, Folder } from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'
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

  const invalidChars = /[\\/:*?"<>|]/
  const invalidCharsHint = '项目名不能包含 \\ / : * ? " < > |'
  const projectNamePlaceholder = '输入项目名称（不能包含 \\ / : * ? " < > |）'
  const validateName = (name: string): string => {
    if (!name.trim()) return '项目名不能为空'
    if (invalidChars.test(name)) return invalidCharsHint
    if (projects.some((p) => p.name === name.trim())) return '项目已存在'
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
      showSuccess(`项目 "${trimmed}" 创建成功`)
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
      showSuccess(`项目 "${selectedProject.name}" 已删除`)
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
          title={isFav ? '取消收藏' : '收藏'}
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
          className="flex items-center gap-1.5 flex-1 text-left min-w-0"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
          <span className="truncate">{p.name}</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            window.electron.app
              .getPath('backend')
              .then((backendPath) =>
                window.electron.shell.showItemInFolder(`${backendPath}/${p.name}`),
              )
          }}
          className="p-0.5 rounded shrink-0 leading-none text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title="在资源管理器中打开"
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
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索项目..."
            className={clsx(
              'w-full pl-6 pr-2 py-1.5 text-xs border rounded-md transition-colors',
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
          <span>项目列表</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setNewProjectName('')
                setTemplateOption('example')
                setCreateError('')
                setCreateOpen(true)
              }}
              title="新建项目"
              className="px-1.5 py-0.5 rounded border text-[10px] font-normal flex items-center gap-0.5 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              <Plus size={10} />
              新建
            </button>
            <button
              onClick={() => {
                if (selectedProject) setDeleteOpen(true)
              }}
              disabled={!selectedProject}
              title="删除当前项目"
              className="px-1.5 py-0.5 rounded border text-[10px] font-normal flex items-center gap-0.5 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
            >
              <Trash2 size={10} />
              删除
            </button>
          </div>
        </div>
        {showEmptyHint ? (
          <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
            {projectError ? (
              <span className="text-red-500">加载失败: {projectError}</span>
            ) : search ? (
              '未找到匹配的项目'
            ) : (
              '暂无项目'
            )}
          </div>
        ) : (
          <>
            {showAllGroups && (
              <>
                {renderGroup('收藏', <Star size={10} className="text-yellow-500" />, favoriteList)}
                {renderGroup('最近', <Clock size={10} className="text-gray-400 dark:text-gray-500" />, recentList)}
                {renderGroup('全部项目', <Folder size={10} className="text-gray-400 dark:text-gray-500" />, allList)}
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
        title="新建项目"
        width="440px"
        footer={
          <>
            <button
              onClick={() => setCreateOpen(false)}
              disabled={createLoading}
              className="px-4 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              取消
            </button>
            <button
              onClick={handleCreateProject}
              disabled={createLoading}
              className="px-4 py-1.5 text-sm rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
            >
              创建
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5 text-gray-700 dark:text-gray-300">
              项目名称
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
              项目模板
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
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">使用示例模板</div>
                  <div className="text-xs mt-0.5 text-gray-500 dark:text-gray-400">
                    从示例参数文件开始，包含常用参数模板
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
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">空白项目</div>
                  <div className="text-xs mt-0.5 text-gray-500 dark:text-gray-400">
                    创建一个空项目，从空白开始
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
        title="删除项目"
        width="400px"
        footer={
          <>
            <button
              onClick={() => setDeleteOpen(false)}
              className="px-4 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              取消
            </button>
            <button
              onClick={handleDeleteProject}
              className="px-4 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
            >
              删除
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-700 dark:text-gray-200">
          确定要删除项目 <strong>"{selectedProject?.name}"</strong> 吗？此操作无法撤销。
        </p>
      </Modal>
    </div>
  )
}
