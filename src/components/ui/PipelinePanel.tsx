/**
 * 4.4 F4-3 一键管线面板：导入 AutoLink 规划 → 渲染 → 导出（按序 + 步骤状态 + 可中断/重试）
 * 模板批处理：对多模板一键渲染导出
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
import { usePipelineStore, type StepStatus } from '@/stores/pipeline.store'
import {
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  FileJson,
  FolderOpen,
  CheckCircle2,
  XCircle,
  Loader2,
  Circle,
} from 'lucide-react'
import clsx from 'clsx'

const STEP_ORDER: Array<{ id: string; labelKey: string }> = [
  { id: 'import', labelKey: 'common:efficiency.pipelineImport' },
  { id: 'render', labelKey: 'common:efficiency.pipelineRender' },
  { id: 'export', labelKey: 'common:efficiency.pipelineExport' },
]

const STATUS_LABEL_KEY: Record<StepStatus, string> = {
  idle: 'common:efficiency.stepIdle',
  running: 'common:efficiency.stepRunning',
  done: 'common:efficiency.stepDone',
  failed: 'common:efficiency.stepFailed',
  cancelled: 'common:efficiency.stepCancelled',
}

function StatusIcon({ status, isDark }: { status: StepStatus; isDark: boolean }) {
  if (status === 'done') return <CheckCircle2 size={13} className="text-green-500 shrink-0" />
  if (status === 'failed') return <XCircle size={13} className="text-red-500 shrink-0" />
  if (status === 'running') return <Loader2 size={13} className="animate-spin text-primary-500 shrink-0" />
  if (status === 'cancelled') return <Circle size={13} className="text-gray-400 shrink-0" />
  return <Circle size={13} className={clsx(isDark ? 'text-gray-600' : 'text-gray-300')} shrink-0 />
}

export function PipelinePanel() {
  const { t } = useTranslation()
  const isDark = useUIStore((s) => s.isDark)
  const templates = useProjectStore((s) => s.templates)

  const running = usePipelineStore((s) => s.running)
  const steps = usePipelineStore((s) => s.steps)
  const planJson = usePipelineStore((s) => s.planJson)
  const exportPath = usePipelineStore((s) => s.exportPath)
  const error = usePipelineStore((s) => s.error)
  const setPlanJson = usePipelineStore((s) => s.setPlanJson)
  const runPlanPipeline = usePipelineStore((s) => s.runPlanPipeline)
  const runTemplatePipeline = usePipelineStore((s) => s.runTemplatePipeline)
  const stop = usePipelineStore((s) => s.stop)
  const retry = usePipelineStore((s) => s.retry)
  const reset = usePipelineStore((s) => s.reset)

  const [mode, setMode] = useState<'plan' | 'template'>('plan')
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set())

  const pickPlan = async () => {
    const p = await window.electron.dialog.openFile({
      title: t('common:efficiency.pipelinePickPlan'),
      filters: [{ name: 'JSON', extensions: ['json', 'zip'] }],
    })
    if (p) setPlanJson(p)
  }

  const toggleTemplate = (id: string) => {
    setSelectedTemplates((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const run = () => {
    if (mode === 'plan') {
      if (planJson.trim()) void runPlanPipeline(planJson.trim())
    } else {
      const selected = templates.filter((tpl) => selectedTemplates.has(tpl.id))
      if (selected.length > 0) void runTemplatePipeline(selected)
    }
  }

  const templateNameById = (id: string) => templates.find((tpl) => tpl.id === id)?.name ?? id

  const buttonBase = clsx(
    'inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded transition-colors',
    'disabled:opacity-40 disabled:cursor-not-allowed',
  )

  return (
    <div
      className={clsx(
        'rounded-lg border border-t-2 border-t-primary-200 dark:border-t-primary-700 p-3 space-y-2.5',
        isDark ? 'border-gray-700 bg-gray-800/40' : 'border-gray-200 bg-white',
      )}
    >
      <div className="flex items-center justify-between">
        <h4
          className={clsx(
            'text-xs font-semibold inline-flex items-center gap-1',
            isDark ? 'text-gray-200' : 'text-gray-700',
          )}
        >
          <Play size={12} /> {t('common:efficiency.pipelineTitle')}
        </h4>
        <div className="flex gap-2">
          <button
            onClick={() => setMode('plan')}
            disabled={running}
            className={clsx(
              'px-2 py-0.5 text-[11px] rounded border',
              mode === 'plan'
                ? 'bg-primary-500 text-white border-primary-500'
                : isDark
                  ? 'border-gray-600 text-gray-400 hover:border-gray-500'
                  : 'border-gray-300 text-gray-500 hover:border-gray-400',
            )}
          >
            {t('common:efficiency.pipelinePlanMode')}
          </button>
          <button
            onClick={() => setMode('template')}
            disabled={running}
            className={clsx(
              'px-2 py-0.5 text-[11px] rounded border',
              mode === 'template'
                ? 'bg-primary-500 text-white border-primary-500'
                : isDark
                  ? 'border-gray-600 text-gray-400 hover:border-gray-500'
                  : 'border-gray-300 text-gray-500 hover:border-gray-400',
            )}
          >
            {t('common:efficiency.pipelineTemplateMode')}
          </button>
        </div>
      </div>

      {mode === 'plan' ? (
        <div className="space-y-2">
          <p className={clsx('text-[11px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
            {t('common:efficiency.pipelinePlanDesc')}
          </p>
          <div className="flex gap-1.5">
            <input
              value={planJson}
              onChange={(e) => setPlanJson(e.target.value)}
              placeholder={t('common:efficiency.pipelinePlanPath')}
              className={clsx(
                'flex-1 min-w-0 text-[11px] px-2 py-1 rounded border',
                isDark ? 'bg-gray-900 border-gray-700 text-gray-200' : 'bg-white border-gray-300 text-gray-700',
              )}
            />
            <button
              onClick={pickPlan}
              className={clsx(
                buttonBase,
                isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100',
              )}
            >
              <FolderOpen size={11} />
            </button>
          </div>
          {/* 步骤状态：导入 → 渲染 → 导出 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {STEP_ORDER.map((step, i) => {
              const state = steps.find((s) => s.id === step.id)
              const status = state?.status ?? 'idle'
              return (
                <div key={step.id} className="flex items-center gap-1.5">
                  {i > 0 && <span className={isDark ? 'text-gray-600' : 'text-gray-300'}>→</span>}
                  <span
                    className={clsx(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border',
                      status === 'running'
                        ? 'border-primary-400 text-primary-600 dark:text-primary-400'
                        : status === 'done'
                          ? 'border-green-300 text-green-600 dark:text-green-400'
                          : status === 'failed'
                            ? 'border-red-300 text-red-500'
                            : isDark
                              ? 'border-gray-700 text-gray-400'
                              : 'border-gray-200 text-gray-500',
                    )}
                  >
                    <StatusIcon status={status} isDark={isDark} />
                    {t(step.labelKey)}
                    {state?.message ? `: ${state.message}` : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className={clsx('text-[11px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
            {t('common:efficiency.pipelineTemplateDesc')}
          </p>
          {templates.length === 0 ? (
            <p className={clsx('text-[11px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
              {t('common:efficiency.pipelineSelectTemplate')}
            </p>
          ) : (
            <div className="max-h-40 overflow-auto space-y-1">
              {templates.map((tpl) => (
                <label
                  key={tpl.id}
                  className={clsx(
                    'flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] cursor-pointer',
                    isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedTemplates.has(tpl.id)}
                    onChange={() => toggleTemplate(tpl.id)}
                    className="accent-primary-500"
                  />
                  <span className="truncate flex-1">{tpl.name}</span>
                  <span className={clsx(isDark ? 'text-gray-500' : 'text-gray-400')}>{tpl.sourceProject}</span>
                  {(() => {
                    const state = steps.find((s) => s.id === tpl.id)
                    if (!state || state.status === 'idle') return null
                    return <StatusIcon status={state.status} isDark={isDark} />
                  })()}
                </label>
              ))}
            </div>
          )}
          {steps.length > 0 && mode === 'template' && (
            <div className="space-y-0.5">
              {steps.map((step) => (
                <div key={step.id} className="flex items-center gap-1.5 text-[11px]">
                  <StatusIcon status={step.status} isDark={isDark} />
                  <span className="truncate">{templateNameById(step.id)}</span>
                  <span className={clsx(isDark ? 'text-gray-500' : 'text-gray-400')}>
                    {t(STATUS_LABEL_KEY[step.status])}
                  </span>
                  {step.message && (
                    <span className={clsx('truncate', isDark ? 'text-red-300' : 'text-red-500')}>{step.message}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(exportPath || error) && (
        <div
          className={clsx(
            'text-[11px] rounded px-2 py-1',
            error
              ? isDark
                ? 'bg-red-950/30 text-red-300'
                : 'bg-red-50 text-red-600'
              : isDark
                ? 'bg-green-950/30 text-green-300'
                : 'bg-green-50 text-green-600',
          )}
        >
          {error ? error : `${t('common:efficiency.pipelineExportPath')}: ${exportPath}`}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <button
          onClick={run}
          disabled={running || (mode === 'plan' ? !planJson.trim() : selectedTemplates.size === 0)}
          className={clsx(buttonBase, 'bg-primary-600 hover:bg-primary-700 text-white')}
        >
          <FileJson size={11} />
          {t('common:efficiency.pipelineRun')}
        </button>
        {running && (
          <button
            onClick={stop}
            className={clsx(buttonBase, isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100')}
          >
            <Square size={11} />
            {t('common:efficiency.pipelineStop')}
          </button>
        )}
        <button
          onClick={() => void retry()}
          disabled={running || (steps.length > 0 && steps.every((s) => s.status === 'done'))}
          className={clsx(buttonBase, isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100')}
        >
          <RotateCcw size={11} />
          {t('common:efficiency.pipelineRetry')}
        </button>
        <button
          onClick={reset}
          disabled={running}
          className={clsx(buttonBase, isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100')}
        >
          <RefreshCw size={11} />
          {t('common:efficiency.pipelineReset')}
        </button>
        {running && (
          <span className={clsx('ml-auto text-[11px]', isDark ? 'text-gray-400' : 'text-gray-500')}>
            {t('common:efficiency.pipelineRunning')}
          </span>
        )}
      </div>
    </div>
  )
}
