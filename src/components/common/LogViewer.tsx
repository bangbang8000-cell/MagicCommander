import { useTranslation } from 'react-i18next'
import { useLogStore } from '@/stores/log.store'
import { Trash2 } from 'lucide-react'
import clsx from 'clsx'

const levelColor: Record<string, string> = {
  info: 'text-gray-700',
  success: 'text-green-600',
  warn: 'text-yellow-600',
  error: 'text-red-600',
}

export function LogViewer() {
  const { t } = useTranslation()
  const logs = useLogStore((s) => s.logs)
  const clearLogs = useLogStore((s) => s.clearLogs)

  return (
    <div className="flex-1 flex flex-col bg-white border-t border-gray-200 min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">{t('common:logViewer.executionLog')}</h3>
        <button
          onClick={clearLogs}
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-gray-100"
        >
          <Trash2 size={14} /> {t('common:logViewer.clear')}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3 font-mono text-xs space-y-0.5 bg-gray-50">
        {logs.length === 0 ? (
          <div className="text-gray-400 text-center py-8">{t('common:logViewer.noLogs')}</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-2 hover:bg-white px-2 py-0.5 rounded">
              <span className="text-gray-400 shrink-0">[{log.timestamp}]</span>
              <span className={clsx('shrink-0 font-semibold', levelColor[log.level])}>
                {log.level.toUpperCase()}
              </span>
              <span className="text-gray-800 break-all">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}