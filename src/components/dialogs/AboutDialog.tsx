import { useTranslation } from 'react-i18next'
import { RefreshCw, ExternalLink } from 'lucide-react'
import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import type { UpdateStatus } from '@/types/ipc'

interface AboutDialogProps {
  open: boolean
  onClose: () => void
  version: string
  displayVersion?: string
  build?: string
  updateStatus: UpdateStatus | null
  updateBusy: boolean
  onCheckUpdate: () => void
  onDownloadUpdate: () => void
  onInstallUpdate: () => void
}

export function AboutDialog({
  open,
  onClose,
  version,
  displayVersion,
  build,
  updateStatus,
  updateBusy,
  onCheckUpdate,
  onDownloadUpdate,
  onInstallUpdate,
}: AboutDialogProps) {
  const { t } = useTranslation()

  const getUpdateMessage = () => {
    if (!updateStatus) return t('updates.idle')
    switch (updateStatus.status) {
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

  const versionText = displayVersion || `v${version}`
  const buildText = build ? `Build ${build}` : ''

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('app.about')}
      width="420px"
      footer={
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          {t('app.close')}
        </button>
      }
    >
      <div className="space-y-4">
        {/* Logo 和标题 */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold bg-primary-500 text-white">
            M
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">MagicCommander</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {versionText}
              {buildText && <span className="ml-1">({buildText})</span>}
            </p>
          </div>
        </div>

        {/* 简介 */}
        <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{t('about.description')}</p>

        {/* 功能特性 */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('about.keyFeatures')}</h3>
          <ul className="text-sm space-y-1.5 text-gray-600 dark:text-gray-400">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
              {t('about.feature1')}
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
              {t('about.feature2')}
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
              {t('about.feature3')}
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
              {t('about.feature4')}
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
              {t('about.feature5')}
            </li>
          </ul>
        </div>

        {/* 更新检查 */}
        <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('updates.title')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{getUpdateMessage()}</p>
            </div>
            <button
              onClick={onCheckUpdate}
              disabled={updateBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw size={13} className={clsx(updateBusy && 'animate-spin')} />
              {t('updates.checkButton')}
            </button>
          </div>

          {updateStatus?.status === 'downloading' && (
            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, updateStatus.progress ?? 0))}%` }}
              />
            </div>
          )}

          {updateStatus?.status === 'available' && (
            <button
              onClick={onDownloadUpdate}
              className="w-full px-3 py-1.5 text-xs rounded-md bg-primary-500 text-white hover:bg-primary-600 transition-colors"
            >
              {t('updates.downloadButton')}
            </button>
          )}

          {updateStatus?.status === 'downloaded' && (
            <button
              onClick={onInstallUpdate}
              className="w-full px-3 py-1.5 text-xs rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              {t('updates.installButton')}
            </button>
          )}

          {updateStatus?.status === 'available' && updateStatus.releaseNotes && (
            <div className="max-h-24 overflow-auto rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
              {Array.isArray(updateStatus.releaseNotes)
                ? updateStatus.releaseNotes.join('\n')
                : updateStatus.releaseNotes}
            </div>
          )}
        </div>

        {/* 链接与许可 */}
        <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-700">
          <a
            href="https://github.com/bangbang8000-cell/MagicCommander"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary-500 hover:text-primary-600 transition-colors"
          >
            <ExternalLink size={12} />
            GitHub
          </a>
          <p className="text-xs text-gray-400 dark:text-gray-500">MIT License</p>
        </div>

        {/* 技术栈 */}
        <div className="text-xs text-center pt-3 border-t border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
          Electron + React + TypeScript + Vite + Zustand
        </div>
      </div>
    </Modal>
  )
}