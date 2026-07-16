import clsx from 'clsx'
import { CheckSquare, FolderOpen, Square } from 'lucide-react'
import type { ProjectInfo, ProjectStatus } from '@/types/project'
import { ProjectStatusBadge } from './ProjectStatusBadge'

type ProjectListItemProps = {
  project: ProjectInfo
  status?: ProjectStatus
  selected: boolean
  checked: boolean
  favorite: boolean
  onToggleCheck: () => void
  onToggleFavorite: () => void
  onSelect: () => void
  onOpenFolder: () => void
}

export function ProjectListItem({
  project,
  status,
  selected,
  checked,
  favorite,
  onToggleCheck,
  onToggleFavorite,
  onSelect,
  onOpenFolder,
}: ProjectListItemProps) {
  return (
    <div
      className={clsx(
        'flex items-start gap-1 px-2 py-1.5 text-xs transition-colors cursor-pointer',
        selected
          ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
      )}
    >
      <button
        onClick={(event) => {
          event.stopPropagation()
          onToggleCheck()
        }}
        className={clsx(
          'shrink-0 leading-none transition-colors pt-0.5',
          checked ? 'text-primary-500' : 'text-gray-400 dark:text-gray-500 hover:text-primary-400',
        )}
      >
        {checked ? <CheckSquare size={14} /> : <Square size={14} />}
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation()
          onToggleFavorite()
        }}
        className={clsx(
          'shrink-0 leading-none transition-colors pt-0.5',
          favorite ? 'text-yellow-500' : 'text-gray-400 dark:text-gray-500 hover:text-yellow-500',
        )}
      >
        {favorite ? '★' : '☆'}
      </button>
      <button onClick={onSelect} className="flex flex-col gap-1 flex-1 text-start min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
          <span className="truncate">{project.name}</span>
        </span>
        <ProjectStatusBadge status={status} />
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation()
          onOpenFolder()
        }}
        className="p-0.5 rounded shrink-0 leading-none text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors pt-0.5"
        title="在资源管理器中打开"
      >
        <FolderOpen size={11} />
      </button>
    </div>
  )
}
