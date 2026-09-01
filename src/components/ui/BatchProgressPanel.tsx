/**
 * 4.4 F4-2 批量操作进度面板：多项目进度 + 失败汇总（自包含读取 batch store）
 */
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/ui.store'
import { useBatchStore, type BatchMode } from '@/stores/batch.store'
import { CheckCircle2, XCircle, Loader2, Circle, Square, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'

const MODE_LABEL_KEY: Record<BatchMode, string> = {
  render: 'common:efficiency.batchRender',
  export: 'common:efficiency.batchExport',
  edit: 'common:efficiency.batchApplyParams',
}

export function BatchProgressPanel() {
  const { t } = useTranslation()
  const isDark = useUIStore((s) => s.isDark)
  const items = useBatchStore((s) => s.items)
  const running = useBatchStore((s) => s.running)
  const mode = useBatchStore((s) => s.mode)
  const progress = useBatchStore((s) => s.progress)
  const summary = useBatchStore((s) => s.summary)
  const stop = useBatchStore((s) => s.stop)

  if (!mode) return null

  const failed = items.filter((i) => i.status === 'failed')

  return (
    <div
      className={clsx(
        'rounded-lg border p-2.5 space-y-2 text-xs',
        isDark ? 'border-gray-700 bg-gray-800/40' : 'border-gray-200 bg-gray-50',
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={clsx('font-medium inline-flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}
        >
          {t(MODE_LABEL_KEY[mode])}
          {running && <Loader2 size={12} className="animate-spin text-primary-500" />}
        </span>
        <div className="flex items-center gap-2">
          {summary && (
            <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-500')}>
              {t('common:efficiency.batchSummary', {
                total: summary.total,
                done: summary.done,
                failed: summary.failed,
              })}
            </span>
          )}
          {running && (
            <button
              onClick={stop}
              className={clsx(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px]',
                isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200',
              )}
            >
              <Square size={10} />
              {t('common:efficiency.batchStop')}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className={clsx('flex-1 h-1.5 rounded-full overflow-hidden', isDark ? 'bg-gray-700' : 'bg-gray-200')}>
          <div className="h-full bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <span className={clsx('font-mono text-[11px]', isDark ? 'text-gray-400' : 'text-gray-500')}>{progress}%</span>
      </div>

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-1 min-w-0">
              {item.status === 'done' ? (
                <CheckCircle2 size={12} className="text-green-500 shrink-0" />
              ) : item.status === 'failed' ? (
                <XCircle size={12} className="text-red-500 shrink-0" />
              ) : item.status === 'running' ? (
                <Loader2 size={12} className="animate-spin text-primary-500 shrink-0" />
              ) : (
                <Circle size={12} className={clsx(isDark ? 'text-gray-600' : 'text-gray-300')} shrink-0 />
              )}
              <span className="truncate">{item.name}</span>
            </div>
          ))}
        </div>
      )}

      {failed.length > 0 && (
        <div
          className={clsx(
            'rounded border p-1.5 space-y-1',
            isDark ? 'border-red-900/50 bg-red-950/30' : 'border-red-200 bg-red-50',
          )}
        >
          <div className={clsx('flex items-center gap-1 font-medium', isDark ? 'text-red-300' : 'text-red-600')}>
            <AlertTriangle size={12} />
            {t('common:efficiency.batchFailureSummary')}
          </div>
          {failed.map((item) => (
            <div key={item.id} className="pl-4 text-[11px]">
              <span className="font-medium">{item.name}: </span>
              <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                {item.message || t('common:efficiency.batchErrors')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
