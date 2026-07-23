import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, Download, Trash2, Loader2, Cloud, Globe } from 'lucide-react'
import { usePlatformStore } from '@/stores/platform.store'
import type { RemoteProject } from '@/api/platform'
import { SyncStatusBadge } from './SyncStatusBadge'
import { PullDialog } from './PullDialog'

type RemoteProjectViewProps = {
  onPullSuccess: () => void
  searchQuery: string
}

export function RemoteProjectView({ onPullSuccess, searchQuery }: RemoteProjectViewProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'mine' | 'public'>('mine')
  const [pullingProject, setPullingProject] = useState<RemoteProject | null>(null)
  const [projectExists, setProjectExists] = useState(false)

  const {
    remoteProjects,
    remoteProjectsLoading,
    publicProjects,
    publicProjectsLoading,
    syncStatuses,
    loggedIn,
    fetchRemoteProjects,
    searchPublicProjects,
    deleteRemoteProject,
    checkSyncStatus,
  } = usePlatformStore()

  useEffect(() => {
    if (loggedIn) {
      fetchRemoteProjects()
    }
  }, [loggedIn, fetchRemoteProjects])

  // Check sync status when projects load
  useEffect(() => {
    if (remoteProjects.length > 0 && loggedIn) {
      checkSyncStatus(remoteProjects.map((p) => ({ name: p.name })))
    }
  }, [remoteProjects, loggedIn, checkSyncStatus])

  // Client-side filter for "my projects" tab
  const filteredMyProjects = useMemo(() => {
    if (!searchQuery) return remoteProjects
    const q = searchQuery.toLowerCase()
    return remoteProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q),
    )
  }, [remoteProjects, searchQuery])

  // Server-side search for "public projects" tab
  useEffect(() => {
    if (activeTab === 'public' && loggedIn) {
      searchPublicProjects(searchQuery)
    }
  }, [activeTab, searchQuery, loggedIn, searchPublicProjects])

  const handlePull = useCallback(async (project: RemoteProject) => {
    try {
      const projects = await window.electron.project.list()
      const exists = projects.some((p: any) => p.name === project.name)
      setProjectExists(exists)
    } catch {
      setProjectExists(false)
    }
    setPullingProject(project)
  }, [])

  const handleDelete = useCallback(
    async (project: RemoteProject) => {
      if (
        !confirm(
          t('cloud:sync.deleteConfirm', { name: project.name }) ||
            `确定要删除云端项目 "${project.name}" 吗？此操作不可撤销。`,
        )
      )
        return
      try {
        await deleteRemoteProject(project.owner, project.name)
      } catch (err) {
        alert((err as Error).message)
      }
    },
    [deleteRemoteProject, t],
  )

  const displayProjects = activeTab === 'mine' ? filteredMyProjects : publicProjects
  const isLoading = activeTab === 'mine' ? remoteProjectsLoading : publicProjectsLoading

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('mine')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'mine'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Cloud size={12} />
          {t('cloud:panel.tabProjects') || '我的项目'}
        </button>
        <button
          onClick={() => setActiveTab('public')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'public'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Globe size={12} />
          {t('cloud:projects.public') || '公开项目'}
        </button>
        <div className="flex-1" />
        <button
          onClick={() => fetchRemoteProjects()}
          disabled={remoteProjectsLoading}
          className="flex items-center gap-1 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          title={t('cloud:retry')}
        >
          <RefreshCw size={12} className={remoteProjectsLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-auto">
        {!loggedIn && (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">
            {t('cloud:dashboard.notLoggedIn')}
          </div>
        )}

        {loggedIn && isLoading && (
          <div className="flex items-center justify-center p-8">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        )}

        {loggedIn && !isLoading && displayProjects.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">
            {searchQuery
              ? t('cloud:search.noResults')
              : activeTab === 'mine'
                ? t('cloud:projects.emptyMine') || '暂无云端项目，请先将本地项目推送到云端'
                : t('cloud:projects.emptyPublic') || '暂无公开项目'}
          </div>
        )}

        {loggedIn &&
          !isLoading &&
          displayProjects.map((project) => {
            const syncStatus = syncStatuses[project.name]
            return (
              <div
                key={project.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {project.name}
                    </span>
                    {project.private ? (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                        {t('cloud:projects.private') || '私有'}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        {t('cloud:projects.public') || '公开'}
                      </span>
                    )}
                    <SyncStatusBadge syncStatus={syncStatus} />
                  </div>
                  {project.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {project.description}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                    {project.owner} · {new Date(project.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handlePull(project)}
                    className="p-1.5 rounded hover:bg-primary-50 dark:hover:bg-primary-900/30 text-primary-500 transition-colors"
                    title={t('cloud:sync.pull')}
                  >
                    <Download size={14} />
                  </button>
                  {activeTab === 'mine' && (
                    <button
                      onClick={() => handleDelete(project)}
                      className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-400 hover:text-red-500 transition-colors"
                      title={t('cloud:projects.delete') || '删除云端项目'}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
      </div>

      {/* Pull dialog */}
      {pullingProject && (
        <PullDialog
          owner={pullingProject.owner}
          repo={pullingProject.name}
          projectName={pullingProject.name}
          existsLocally={projectExists}
          onClose={() => setPullingProject(null)}
          onSuccess={() => {
            setPullingProject(null)
            onPullSuccess()
          }}
        />
      )}
    </div>
  )
}