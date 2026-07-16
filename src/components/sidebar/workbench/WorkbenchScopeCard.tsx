import { FolderOpen, ExternalLink, X } from 'lucide-react'
import clsx from 'clsx'
import type { ProjectInfo, ProjectStatus } from '@/types/project'

type WorkbenchScopeCardProps = {
  selectedProject: ProjectInfo | null
  projectInfo: any
  projects: ProjectInfo[]
  selectedProjectIds: string[]
  projectStatuses: Record<string, ProjectStatus>
  isDark: boolean
  onToggleProject: (id: number) => void
  onOpenFolder: () => void
}

export function WorkbenchScopeCard({
  selectedProject,
  projectInfo,
  projects,
  selectedProjectIds,
  projectStatuses,
  isDark,
  onToggleProject,
  onOpenFolder,
}: WorkbenchScopeCardProps) {
  return (
    <div className="space-y-2">
      <h4 className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}>
        <FolderOpen size={12} /> 目标范围
      </h4>

      {selectedProject ? (
        <div className={clsx('rounded border p-2 text-xs space-y-1', isDark ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200')}>
          <div className="flex justify-between">
            <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>当前项目</span>
            <span className={clsx('font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>
              {selectedProject.name}
            </span>
          </div>
          {projectInfo?.path && (
            <div className="flex justify-between">
              <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>路径</span>
              <span className={clsx('font-medium text-[10px] truncate max-w-[140px]', isDark ? 'text-gray-200' : 'text-gray-700')}>
                {projectInfo.path}
              </span>
            </div>
          )}
          <button
            onClick={onOpenFolder}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 mt-1 text-[10px] rounded transition-colors w-full',
              isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
            )}
          >
            <ExternalLink size={10} /> 打开项目目录
          </button>
        </div>
      ) : (
        <div className={isDark ? 'text-xs text-gray-500' : 'text-xs text-gray-400'}>请在项目浏览器中选择一个项目</div>
      )}

      {projects.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className={clsx('text-[10px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
              已选 {selectedProjectIds.length} / {projects.length} 个项目
            </span>
          </div>
          <div className={clsx('flex flex-wrap gap-1 max-h-24 overflow-auto', isDark ? 'text-gray-300' : 'text-gray-700')}>
            {projects.map((p) => {
              const selected = selectedProjectIds.includes(String(p.id))
              const status = projectStatuses[p.name]
              return (
                <button
                  key={p.id}
                  onClick={() => onToggleProject(p.id)}
                  className={clsx(
                    'text-[10px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1',
                    selected
                      ? isDark
                        ? 'bg-primary-900/40 border-primary-700 text-primary-200'
                        : 'bg-primary-100 border-primary-400 text-primary-700'
                      : isDark
                        ? 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-500'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400',
                  )}
                >
                  {selected && <X size={10} />}
                  {p.name}
                  {status?.hasOutput && (
                    <span className={clsx('w-1 h-1 rounded-full', isDark ? 'bg-blue-400' : 'bg-blue-500')} />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}