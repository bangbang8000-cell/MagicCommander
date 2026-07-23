import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { CheckSquare, FolderOpen, Square, Upload, Download, AlertCircle } from 'lucide-react'
import type { ProjectInfo, ProjectStatus } from '@/types/project'
import { ProjectStatusBadge } from './ProjectStatusBadge'
import { SyncStatusBadge } from '@/components/cloud/SyncStatusBadge'
import type { SyncStatusResponse } from '@/api/platform'

type ProjectListItemProps = {
  project: ProjectInfo
  status?: ProjectStatus
  syncStatus?: SyncStatusResponse
  selected: boolean
  checked: boolean
  favorite: boolean
  onToggleCheck: () => void
  onToggleFavorite: () => void
  onSelect: () => void
  onOpenFolder: () => void
  onPush?: () => void
  onPull?: () => void
  onResolve?: () => void
}

export function ProjectListItem({
  project,
  status,
  syncStatus,
  selected,
  checked,
  favorite,
  onToggleCheck,
  onToggleFavorite,
  onSelect,
  onOpenFolder,
  onPush,
  onPull,
  onResolve,
}: ProjectListItemProps) {
  const { t } = useTranslation()

  const renderSyncAction = () => {
    if (!syncStatus) {
      // No sync status - show push button if available
      return onPush ? (
        <button
          onClick={(event) => { event.stopPropagation(); onPush() }}
          className="p-0.5 rounded shrink-0 leading-none text-gray-400 dark:text-gray-500 hover:text-primary-500 transition-colors pt-0.5"
          title={t('cloud:sync.push')}
        >
          <Upload size={11} />
        </button>
      ) : null
    }

    switch (syncStatus.status) {
      case 'local_only':
      case 'local_ahead':
        return onPush ? (
          <button
            onClick={(event) => { event.stopPropagation(); onPush() }}
            className="p-0.5 rounded shrink-0 leading-none text-gray-400 dark:text-gray-500 hover:text-primary-500 transition-colors pt-0.5"
            title={t('cloud:sync.push')}
          >
            <Upload size={11} />
          </button>
        ) : null
      case 'remote_only':
      case 'remote_ahead':
        return onPull ? (
          <button
            onClick={(event) => { event.stopPropagation(); onPull() }}
            className="p-0.5 rounded shrink-0 leading-none text-gray-400 dark:text-gray-500 hover:text-primary-500 transition-colors pt-0.5"
            title={t('cloud:sync.pull')}
          >
            <Download size={11} />
          </button>
        ) : null
      case 'conflict':
        return onResolve ? (
          <button
            onClick={(event) => { event.stopPropagation(); onResolve() }}
            className="p-0.5 rounded shrink-0 leading-none text-red-400 hover:text-red-500 transition-colors pt-0.5"
            title={t('cloud:sync.resolveConflict')}
          >
            <AlertCircle size={11} />
          </button>
        ) : null
      default:
        return null
    }
  }
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
          <SyncStatusBadge syncStatus={syncStatus} />
        </span>
        <ProjectStatusBadge status={status} />
      </button>
      {renderSyncAction()}
      <button
        onClick={(event) => {
          event.stopPropagation()
          onOpenFolder()
        }}
        className="p-0.5 rounded shrink-0 leading-none text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors pt-0.5"
        title={t('cloud:sync.openInExplorer')}
      >
        <FolderOpen size={11} />
      </button>
    </div>
  )
}
