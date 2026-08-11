import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, RefreshCw, Loader2, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import type { ProjectInfo } from '@/types/project'
import type { ProjectProofreadReport } from '@/types/ipc'

type WorkbenchProofreadCardProps = {
  selectedProject: ProjectInfo | null
  isDark: boolean
}

export function WorkbenchProofreadCard({ selectedProject, isDark }: WorkbenchProofreadCardProps) {
  const { t } = useTranslation('project')
  const [report, setReport] = useState<ProjectProofreadReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runProofread = useCallback(async () => {
    if (!selectedProject) return
    setLoading(true)
    setError(null)
    try {
      const r = (await window.electron.project.proofread(String(selectedProject.id))) as ProjectProofreadReport
      setReport(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [selectedProject])

  useEffect(() => {
    if (selectedProject) runProofread()
    else {
      setReport(null)
      setError(null)
    }
  }, [selectedProject, runProofread])

  const summary = report?.summary
  const issues = report?.issues || []

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4
          className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}
        >
          <ShieldCheck size={12} /> {t('proofread.title')}
        </h4>
        <button
          onClick={runProofread}
          disabled={!selectedProject || loading}
          className={clsx(
            'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors',
            isDark
              ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
          )}
          title={t('proofread.refresh')}
        >
          {loading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
          {t('proofread.run')}
        </button>
      </div>

      {!selectedProject ? (
        <div className={clsx('text-[11px] py-1', isDark ? 'text-gray-500' : 'text-gray-400')}>
          {t('dependencyAnalysis.noData')}
        </div>
      ) : loading ? (
        <div className={clsx('text-[11px] flex items-center gap-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
          <Loader2 size={10} className="animate-spin" /> {t('proofread.loading')}
        </div>
      ) : error ? (
        <div className="text-[11px] text-red-500">{error}</div>
      ) : summary ? (
        <div className="space-y-1.5">
          {/* 摘要徽章 */}
          <div className="flex items-center gap-2">
            <span
              className={clsx(
                'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border',
                summary.errors > 0
                  ? 'border-red-800 bg-red-900/20 text-red-300'
                  : 'border-green-800 bg-green-900/20 text-green-300',
              )}
            >
              {summary.errors > 0 ? <XCircle size={10} /> : <CheckCircle2 size={10} />}
              {t('proofread.errors')}: {summary.errors}
            </span>
            <span
              className={clsx(
                'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border border-yellow-800 bg-yellow-900/20 text-yellow-300',
              )}
            >
              <AlertTriangle size={10} /> {t('proofread.warnings')}: {summary.warnings}
            </span>
          </div>

          {issues.length === 0 ? (
            <div className={clsx('text-[11px]', isDark ? 'text-green-400' : 'text-green-600')}>
              {t('proofread.noIssues')}
            </div>
          ) : (
            <div className="max-h-48 overflow-auto space-y-0.5">
              {issues.slice(0, 60).map((issue, idx) => (
                <div
                  key={idx}
                  className={clsx(
                    'flex items-start gap-1 text-[10px] px-1.5 py-0.5 rounded border',
                    issue.level === 'error'
                      ? 'border-red-800 bg-red-900/20 text-red-300'
                      : 'border-yellow-800 bg-yellow-900/20 text-yellow-200',
                  )}
                >
                  {issue.level === 'error' ? (
                    <XCircle size={10} className="shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                  )}
                  <span className="min-w-0">
                    <span className="font-medium">{issue.template || issue.sheet || ''}</span>{' '}
                    {issue.device && <span className="text-yellow-300">[{issue.device}]</span>}{' '}
                    <span className="text-yellow-200/90">{issue.message}</span>
                  </span>
                </div>
              ))}
              {issues.length > 60 && (
                <div className={clsx('text-[10px] px-1.5', isDark ? 'text-gray-500' : 'text-gray-400')}>
                  ... {issues.length - 60} more
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
