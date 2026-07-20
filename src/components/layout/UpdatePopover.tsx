import { useTranslation } from 'react-i18next'
import { RefreshCw, Download, CheckCircle } from 'lucide-react'
import clsx from 'clsx'
import { Popover } from '@/components/ui/Popover'
import type { UpdateStatus } from '@/types/ipc'

interface UpdatePopoverProps {
  open: boolean
  onClose: () => void
  isDark: boolean
  updateStatus: UpdateStatus | null
  updateBusy: boolean
  updateDownloaded: boolean
  onCheckUpdate: () => void
  onDownloadUpdate: () => void
  onInstallUpdate: () => void
}

export function UpdatePopover({
  open,
  onClose,
  isDark,
  updateStatus,
  updateBusy,
  updateDownloaded,
  onCheckUpdate,
  onDownloadUpdate,
  onInstallUpdate,
}: UpdatePopoverProps) {
  const { t } = useTranslation()

  const status = updateStatus?.status

  const getStatusMessage = () => {
    if (!updateStatus) return t('updates.idle')
    switch (status) {
      case 'checking':
        return t('updates.checking')
      case 'available':
        return t('updates.available', { version: updateStatus.version || '' })
      case 'not-available':
        return t('updates.notAvailable')
      case 'downloading':
        return t('updates.downloading', { progress: updateStatus.progress ?? 0 })
      case 'downloaded':
        return t('updates.downloaded')
      case 'error':
        return t('updates.error', { error: updateStatus.error || t('updates.unknownError') })
      default:
        return t('updates.idle')
    }
  }

  const textColor = isDark ? 'text-gray-300' : 'text-gray-600'
  const mutedColor = isDark ? 'text-gray-500' : 'text-gray-400'

  return (
    <Popover open={open} onClose={onClose} isDark={isDark} className="min-w-[260px]">
      <div className="px-3 py-1">
        <h4 className={clsx('text-xs font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>
          {t('updates.title')}
        </h4>
      </div>

      <div className="px-3 py-2 space-y-2">
        {/* 状态信息 */}
        <div className="flex items-center gap-2">
          {status === 'checking' || status === 'downloading' ? (
            <RefreshCw size={13} className={clsx('animate-spin', mutedColor)} />
          ) : status === 'downloaded' ? (
            <CheckCircle size={13} className="text-green-500" />
          ) : null}
          <span className={clsx('text-xs', textColor)}>{getStatusMessage()}</span>
        </div>

        {/* 进度条 */}
        {status === 'downloading' && updateStatus?.progress != null && (
          <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, updateStatus.progress))}%` }}
            />
          </div>
        )}

        {/* Release Notes */}
        {status === 'available' && updateStatus?.releaseNotes && (
          <div className={clsx(
            'max-h-24 overflow-auto rounded px-2 py-1.5 text-[11px] whitespace-pre-wrap',
            isDark ? 'bg-gray-900 text-gray-400' : 'bg-gray-50 text-gray-500',
          )}>
            {Array.isArray(updateStatus.releaseNotes)
              ? updateStatus.releaseNotes.join('\n')
              : updateStatus.releaseNotes}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="px-3 pb-1.5 pt-1 space-y-1.5">
        {(!status || status === 'not-available' || status === 'error') && (
          <button
            onClick={onCheckUpdate}
            disabled={updateBusy}
            className={clsx(
              'w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors',
              isDark
                ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
              updateBusy && 'opacity-50 cursor-not-allowed',
            )}
          >
            <RefreshCw size={12} className={clsx(updateBusy && 'animate-spin')} />
            {t('updates.checkButton')}
          </button>
        )}

        {status === 'available' && !updateDownloaded && (
          <button
            onClick={onDownloadUpdate}
            className={clsx(
              'w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors',
              'bg-blue-500 text-white hover:bg-blue-600',
            )}
          >
            <Download size={12} />
            {t('updates.downloadButton')}
          </button>
        )}

        {status === 'downloaded' && (
          <button
            onClick={onInstallUpdate}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            <CheckCircle size={12} />
            {t('updates.installButton')}
          </button>
        )}
      </div>
    </Popover>
  )
}