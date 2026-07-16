import { FileCode, CheckCircle2, XCircle, AlertCircle, ShieldCheck, Check } from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import type { ValidationResult } from '@/types/render'

type WorkbenchReadinessCardProps = {
  projectInfo: any
  isDark: boolean
  selectedProject: boolean
  isValidationRunning: boolean
  validationResults: ValidationResult[] | null
  onOpenParaConfig: () => void
  onValidateTemplate: () => void
  onValidateExcel: () => void
  onClearValidation: () => void
}

export function WorkbenchReadinessCard({
  projectInfo,
  isDark,
  selectedProject,
  isValidationRunning,
  validationResults,
  onOpenParaConfig,
  onValidateTemplate,
  onValidateExcel,
  onClearValidation,
}: WorkbenchReadinessCardProps) {
  const { t } = useTranslation('project')
  const structure = projectInfo?.structure

  const items = [
    { key: 'excel', label: 'Excel', description: t('workbench.excelDesc') },
    { key: 'templates', label: 'Templates', description: t('workbench.templateDesc') },
    { key: 'para', label: 'para.xlsx', description: t('workbench.paraDesc') },
    { key: 'output', label: 'Output', description: t('workbench.outputDesc') },
    { key: 'yaml', label: 'YAML', description: t('workbench.yamlDesc') },
  ]

  return (
    <div className="space-y-2">
      <h4 className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}>
        <AlertCircle size={12} /> {t('workbench.readyStatus')}
      </h4>

      {selectedProject ? (
        <div className="space-y-1">
          {items.map((item) => {
            const exists = structure?.[item.key] ?? false
            return (
              <div
                key={item.key}
                className={clsx(
                  'flex items-center gap-1.5 text-[11px] px-1.5 py-0.5',
                  exists
                    ? isDark
                      ? 'text-green-400'
                      : 'text-green-600'
                    : isDark
                      ? 'text-gray-500'
                      : 'text-gray-400',
                )}
              >
                {exists ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                <span className="min-w-[72px]">{item.label}</span>
                <span className={clsx('text-[10px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
                  {item.description}
                </span>
              </div>
            )
          })}
          <div className="flex gap-1 mt-1">
            <button
              onClick={onOpenParaConfig}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors',
                isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
              )}
            >
              <FileCode size={10} /> {t('workbench.openPara')}
            </button>
            <button
              onClick={onValidateTemplate}
              disabled={isValidationRunning}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors',
                isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
              )}
            >
              <ShieldCheck size={10} /> {t('workbench.validateTemplate')}
            </button>
            <button
              onClick={onValidateExcel}
              disabled={isValidationRunning}
              className={clsx(
                'flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors',
                isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
              )}
            >
              <ShieldCheck size={10} /> {t('workbench.validateData')}
            </button>
          </div>

          {validationResults && validationResults.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className={clsx('text-[10px] font-medium', isDark ? 'text-gray-400' : 'text-gray-500')}>
                  {t('workbench.validationResult')}
                </span>
                <button
                  onClick={onClearValidation}
                  className={clsx('text-[10px]', isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600')}
                >
                  {t('workbench.clear')}
                </button>
              </div>
              {validationResults.map((r, i) => (
                <div
                  key={i}
                  className={clsx(
                    'text-[10px] px-2 py-1 rounded',
                    r.status === 'pass'
                      ? isDark ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700'
                      : r.status === 'warn'
                        ? isDark ? 'bg-yellow-900/30 text-yellow-300' : 'bg-yellow-50 text-yellow-700'
                        : isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700',
                  )}
                >
                  <div className="flex items-center gap-1">
                    {r.status === 'pass' ? <Check size={10} /> : <AlertCircle size={10} />}
                    <span className="font-medium">{r.project}</span>
                    <span>{r.message}</span>
                  </div>
                  {r.errors && r.errors.length > 0 && (
                    <div className="mt-1 space-y-0.5 ml-4">
                      {r.errors.map((e, j) => (
                        <div key={j} className="text-[10px]">
                          {e.file}:{e.line} - {e.message}
                        </div>
                      ))}
                    </div>
                  )}
                  {r.warnings && r.warnings.length > 0 && (
                    <div className="mt-1 space-y-0.5 ml-4">
                      {r.warnings.map((w, j) => (
                        <div key={j} className="text-[10px]">
                          {w.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={isDark ? 'text-xs text-gray-500' : 'text-xs text-gray-400'}>{t('workbench.readyHint')}</div>
      )}
    </div>
  )
}