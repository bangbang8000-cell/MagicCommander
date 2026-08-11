import { useCallback, useEffect, useState } from 'react'
import { GitBranch, RefreshCw, Loader2, AlertTriangle, Info } from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import type { ProjectInfo } from '@/types/project'
import type { ProjectAnalysisReport } from '@/types/ipc'

type WorkbenchDependencyCardProps = {
  selectedProject: ProjectInfo | null
  isDark: boolean
}

function Chip({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'warn' | 'ok' }) {
  return (
    <span
      className={clsx(
        'inline-block px-1.5 py-0.5 rounded text-[10px] border',
        tone === 'warn' && 'border-red-800 bg-red-900/20 text-red-300',
        tone === 'ok' && 'border-green-800 bg-green-900/20 text-green-300',
        tone === 'default' && 'border-gray-600 bg-gray-800 text-gray-300',
      )}
    >
      {children}
    </span>
  )
}

export function WorkbenchDependencyCard({ selectedProject, isDark }: WorkbenchDependencyCardProps) {
  const { t } = useTranslation('project')
  const [report, setReport] = useState<ProjectAnalysisReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runAnalysis = useCallback(async () => {
    if (!selectedProject) return
    setLoading(true)
    setError(null)
    try {
      const r = (await window.electron.project.analyze(String(selectedProject.id))) as ProjectAnalysisReport
      setReport(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [selectedProject])

  useEffect(() => {
    if (selectedProject) runAnalysis()
    else {
      setReport(null)
      setError(null)
    }
  }, [selectedProject, runAnalysis])

  const deps = report?.dependencies
  const missing = report?.cross_reference?.missing_by_template
  const unused = deps?.unused_columns_by_sheet

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4
          className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}
        >
          <GitBranch size={12} /> {t('dependencyAnalysis.title')}
        </h4>
        <button
          onClick={runAnalysis}
          disabled={!selectedProject || loading}
          className={clsx(
            'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors',
            isDark
              ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
          )}
          title={t('dependencyAnalysis.refresh')}
        >
          {loading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
          {t('dependencyAnalysis.refresh')}
        </button>
      </div>

      <p className={clsx('text-[10px]', isDark ? 'text-gray-500' : 'text-gray-400')}>{t('dependencyAnalysis.desc')}</p>

      {!selectedProject ? (
        <div className={clsx('text-[11px] py-1', isDark ? 'text-gray-500' : 'text-gray-400')}>
          {t('dependencyAnalysis.noData')}
        </div>
      ) : loading ? (
        <div className={clsx('text-[11px] flex items-center gap-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
          <Loader2 size={10} className="animate-spin" /> {t('dependencyAnalysis.loading')}
        </div>
      ) : error ? (
        <div className="text-[11px] text-red-500">
          {t('dependencyAnalysis.error')}: {error}
        </div>
      ) : deps && Object.keys(deps.template_columns || {}).length === 0 ? (
        <div className={clsx('text-[11px] py-1', isDark ? 'text-gray-500' : 'text-gray-400')}>
          {t('dependencyAnalysis.noTemplates')}
        </div>
      ) : deps ? (
        <div className="space-y-2">
          {/* 每个模板引用的列 */}
          {Object.entries(deps.template_columns || {}).map(([template, cols]) => (
            <div key={template} className="space-y-0.5">
              <div
                className={clsx(
                  'flex items-center gap-1 text-[11px] font-medium',
                  isDark ? 'text-gray-300' : 'text-gray-600',
                )}
              >
                <span className="truncate">{template}</span>
                <span className="text-[10px] text-gray-500">({cols.length})</span>
              </div>
              <div className="flex flex-wrap gap-0.5">
                {cols.slice(0, 20).map((c) => (
                  <Chip key={c}>{c}</Chip>
                ))}
                {cols.length > 20 && <Chip>+{cols.length - 20}</Chip>}
              </div>
              {deps.template_excel_sheets?.[template] && deps.template_excel_sheets[template].length > 0 && (
                <div className={clsx('text-[10px] mt-0.5', isDark ? 'text-gray-500' : 'text-gray-400')}>
                  {t('dependencyAnalysis.sources')}: {deps.template_excel_sheets[template].join(', ')}
                </div>
              )}
              {missing?.[template] && missing[template].length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {missing[template].slice(0, 12).map((m) => (
                    <Chip key={m} tone="warn">
                      {m}
                    </Chip>
                  ))}
                  {missing[template].length > 12 && <Chip tone="warn">+{missing[template].length - 12}</Chip>}
                </div>
              )}
            </div>
          ))}

          {/* 缺失列提示 */}
          {missing && Object.keys(missing).length > 0 && (
            <div className={clsx('flex items-center gap-1 text-[10px]', 'text-red-400')}>
              <AlertTriangle size={10} /> {t('dependencyAnalysis.missing')}
            </div>
          )}

          {/* 未使用列（按表折叠） */}
          {unused && Object.keys(unused).length > 0 && (
            <details className="text-[10px]">
              <summary className={clsx('cursor-pointer', isDark ? 'text-gray-400' : 'text-gray-500')}>
                <Info size={10} className="inline mr-1" />
                {t('dependencyAnalysis.unused')} ({Object.keys(unused).length})
              </summary>
              <div className="mt-1 space-y-0.5">
                {Object.entries(unused)
                  .slice(0, 15)
                  .map(([sheet, cols]) => (
                    <div key={sheet} className={clsx(isDark ? 'text-gray-500' : 'text-gray-400')}>
                      <span className="text-gray-500">{sheet}:</span> {cols.slice(0, 8).join(', ')}
                      {cols.length > 8 && ` +${cols.length - 8}`}
                    </div>
                  ))}
              </div>
            </details>
          )}
        </div>
      ) : null}
    </div>
  )
}
