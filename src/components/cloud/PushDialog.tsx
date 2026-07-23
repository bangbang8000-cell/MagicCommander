import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Upload, Lock, Globe, Loader2 } from 'lucide-react'
import { usePlatformStore } from '@/stores/platform.store'

type PushDialogProps = {
  projectName: string
  onClose: () => void
  onSuccess: () => void
}

export function PushDialog({ projectName, onClose, onSuccess }: PushDialogProps) {
  const { t } = useTranslation()
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(true)
  const [pushing, setPushing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pushProject = usePlatformStore((s) => s.pushProject)

  const handlePush = useCallback(async () => {
    setPushing(true)
    setError(null)
    try {
      await pushProject(projectName, description, isPrivate)
      onSuccess()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPushing(false)
    }
  }, [projectName, description, isPrivate, pushProject, onSuccess, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[420px] max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('cloud:sync.pushTitle')}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('project:explorer.projectName')}</label>
            <input
              type="text"
              value={projectName}
              disabled
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('project:template.edit.description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('project:template.edit.description')}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{t('project:template.edit.public')}</label>
            <div className="flex gap-2">
              <button
                onClick={() => setIsPrivate(true)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md border transition-colors ${
                  isPrivate
                    ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-600 text-primary-700 dark:text-primary-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <Lock size={14} />
                {t('project:template.edit.privateHint')}
              </button>
              <button
                onClick={() => setIsPrivate(false)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md border transition-colors ${
                  !isPrivate
                    ? 'bg-primary-50 dark:bg-primary-900/30 border-primary-300 dark:border-primary-600 text-primary-700 dark:text-primary-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <Globe size={14} />
                {t('project:template.edit.publicHint')}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-md">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={pushing}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            {t('app.cancel')}
          </button>
          <button
            onClick={handlePush}
            disabled={pushing}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-primary-500 hover:bg-primary-600 rounded-md transition-colors disabled:opacity-50"
          >
            {pushing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {t('cloud:sync.push')}
              </>
            ) : (
              <>
                <Upload size={14} />
                {t('app.confirm')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}