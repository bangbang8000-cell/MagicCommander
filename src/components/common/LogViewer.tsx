import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLogStore } from '@/stores/log.store'
import type { LogLevel } from '@/types/log'
import { Search, Trash2 } from 'lucide-react'
import clsx from 'clsx'

const levelColor: Record<LogLevel, string> = {
  info: 'text-blue-700 bg-blue-50 border-blue-100',
  success: 'text-green-700 bg-green-50 border-green-100',
  warn: 'text-yellow-700 bg-yellow-50 border-yellow-100',
  error: 'text-red-700 bg-red-50 border-red-100',
  debug: 'text-gray-600 bg-gray-100 border-gray-200',
}

const levels: LogLevel[] = ['info', 'success', 'warn', 'error']

export function LogViewer() {
  const { t } = useTranslation('common')
  const logs = useLogStore((s) => s.logs)
  const clearLogs = useLogStore((s) => s.clearLogs)
  const [activeLevels, setActiveLevels] = useState<Set<LogLevel>>(() => new Set(levels))
  const [searchText, setSearchText] = useState('')

  const filteredLogs = useMemo(() => {
    const keyword = searchText.trim().toLowerCase()
    return logs.filter((log) => {
      if (!activeLevels.has(log.level)) return false
      if (!keyword) return true
      return `${log.message} ${log.source ?? ''} ${log.level}`.toLowerCase().includes(keyword)
    })
  }, [activeLevels, logs, searchText])

  const counts = useMemo(() => {
    return logs.reduce<Record<string, number>>((acc, log) => {
      acc[log.level] = (acc[log.level] || 0) + 1
      return acc
    }, {})
  }, [logs])

  const toggleLevel = (level: LogLevel) => {
    setActiveLevels((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }

  return (
    <div className="flex-1 flex flex-col bg-white border-t border-gray-200 min-h-0">
      <div className="flex flex-col gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-700">{t('logViewer.executionLog')}</h3>
          <button
            onClick={clearLogs}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-gray-100"
          >
            <Trash2 size={14} /> {t('logViewer.clear')}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {levels.map((level) => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={clsx(
                'text-[11px] px-2 py-0.5 rounded border font-medium transition-colors',
                activeLevels.has(level) ? levelColor[level] : 'text-gray-400 bg-white border-gray-200',
              )}
              title={t(`logViewer.levels.${level}`)}
            >
              {t(`logViewer.levels.${level}`)} {counts[level] || 0}
            </button>
          ))}

          <div className="ms-auto flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 min-w-[180px]">
            <Search size={13} />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={t('logViewer.searchPlaceholder')}
              className="w-full bg-transparent outline-none text-gray-700 placeholder:text-gray-400"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3 font-mono text-xs space-y-0.5 bg-gray-50">
        {filteredLogs.length === 0 ? (
          <div className="text-gray-400 text-center py-8">
            {logs.length === 0 ? t('logViewer.noLogs') : t('logViewer.noMatchedLogs')}
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="flex gap-2 hover:bg-white px-2 py-0.5 rounded group">
              <span className="text-gray-400 shrink-0">[{log.timestamp}]</span>
              <span className={clsx('shrink-0 min-w-[64px] text-center rounded border px-1 font-semibold', levelColor[log.level])}>
                {t(`logViewer.levels.${log.level}`)}
              </span>
              {log.source && (
                <span className="shrink-0 text-gray-500 bg-white border border-gray-200 rounded px-1">
                  {t(`logViewer.sources.${log.source}`, { defaultValue: log.source })}
                </span>
              )}
              <span className="text-gray-800 break-all whitespace-pre-wrap">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
