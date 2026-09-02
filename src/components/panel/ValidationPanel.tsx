/**
 * 4.5.0（F5-5）校验面板：与日志/终端/性能并列「校验」标签。
 * - 一键校验当前项目（T1 一致性 / T2 导出核对 / T3 IP 校验）
 * - 问题列表：按严重度/类别分组、可定位（location）
 * - 校验通过/失败汇总
 * - 导出校验报告 JSON
 * - 校验通过后可阻止后续操作（门禁提示：校验未通过时提示先修复再渲染/导出）
 */
import { useState } from 'react'
import { ShieldCheck, Play, Trash2, Download, AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { useValidationStore } from '@/stores/validation.store'
import { useUIStore } from '@/stores/ui.store'
import {
  reportToJson,
  CATEGORY_LABELS,
  SEVERITY_LABELS,
  type ValidationIssue,
  type ValidationCategory,
  type ValidationSeverity,
} from '@/utils/validation'

const SEVERITY_ORDER: ValidationSeverity[] = ['error', 'warning', 'info']

const SEVERITY_COLOR: Record<ValidationSeverity, string> = {
  error: 'text-red-500',
  warning: 'text-yellow-500',
  info: 'text-gray-400',
}

const CATEGORY_BADGE: Record<ValidationCategory, string> = {
  para: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  template: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  output: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  ip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  field: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  ai: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
}

export function ValidationPanel() {
  const { report, running, error, lastRunAt, gateBlocked, runValidation, clear } = useValidationStore()
  const activeProjectId = useUIStore((s) => s.activeProjectId)
  const isDark = useUIStore((s) => s.isDark)
  const [scope, setScope] = useState<'all' | 'consistency' | 'output' | 'ip'>('all')

  const handleRun = () => {
    runValidation(activeProjectId, scope)
  }

  const handleExport = () => {
    if (!report) return
    const json = reportToJson(report)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `校验报告_${report.project}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="h-full overflow-auto p-2.5 space-y-3 bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200">
          <ShieldCheck size={13} className="text-primary-500" />
          校验
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRun}
            disabled={running || activeProjectId == null}
            className={clsx(
              'inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border',
              activeProjectId == null ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-gray-700',
              'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300',
            )}
            title={activeProjectId == null ? '请先在左侧选择一个项目' : '一键校验当前项目（一致性/导出核对/IP）'}
          >
            {running ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full border-2 border-gray-300 border-t-primary-500 animate-spin" />
                校验中…
              </>
            ) : (
              <>
                <Play size={10} />
                一键校验
              </>
            )}
          </button>
          <button onClick={clear} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded" title="清空校验结果">
            <Trash2 size={12} className="text-gray-400" />
          </button>
        </div>
      </div>

      {/* 校验范围选择 */}
      <div className="flex items-center gap-1">
        {(
          [
            { value: 'all', label: '全量' },
            { value: 'consistency', label: '一致性' },
            { value: 'output', label: '导出核对' },
            { value: 'ip', label: 'IP 校验' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            onClick={() => setScope(opt.value)}
            className={clsx(
              'text-[11px] px-1.5 py-0.5 rounded transition-colors',
              scope === opt.value
                ? isDark
                  ? 'bg-gray-700 text-gray-100'
                  : 'bg-gray-300 text-gray-900'
                : isDark
                  ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-100'
                  : 'text-gray-500 hover:bg-gray-200',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {activeProjectId == null && !report && (
        <p className="text-[11px] text-gray-400">请先在左侧项目列表选择一个项目，再点击「一键校验」。</p>
      )}

      {error && (
        <div className="rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-2 py-1.5 text-[11px] text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {report && (
        <>
          {/* 汇总 */}
          <section className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="grid grid-cols-4 divide-x divide-gray-200 dark:divide-gray-700 text-center">
              <SummaryCell
                label="总体"
                value={report.ok ? '通过' : '失败'}
                className={report.ok ? 'text-green-500' : 'text-red-500'}
              />
              <SummaryCell
                label={SEVERITY_LABELS.error}
                value={String(report.summary.errors)}
                className={report.summary.errors > 0 ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'}
              />
              <SummaryCell
                label={SEVERITY_LABELS.warning}
                value={String(report.summary.warnings)}
                className={report.summary.warnings > 0 ? 'text-yellow-500' : 'text-gray-600 dark:text-gray-300'}
              />
              <SummaryCell
                label={SEVERITY_LABELS.info}
                value={String(report.summary.infos)}
                className="text-gray-500"
              />
            </div>
            <div className="px-2 py-1 border-t border-gray-100 dark:border-gray-700 text-[10px] text-gray-400 flex items-center justify-between">
              <span>
                项目：{report.project} · 校验项：{report.checks.length} ·{' '}
                {lastRunAt ? `最近校验：${new Date(lastRunAt).toLocaleString()}` : ''}
              </span>
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Download size={10} />
                导出报告 JSON
              </button>
            </div>
          </section>

          {/* 门禁提示：校验未通过时建议先修复再渲染/导出 */}
          {gateBlocked && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-[11px] text-amber-700 dark:text-amber-300">
              <AlertTriangle size={12} />
              校验未通过：建议先修复 {report.summary.errors} 个错误后再执行渲染/导出。
            </div>
          )}

          {report.issues.length === 0 ? (
            <div className="flex items-center gap-1.5 px-2 py-3 text-[11px] text-green-500">
              <CheckCircle2 size={13} />
              校验通过，未发现问题。
            </div>
          ) : (
            <>
              {/* 按严重度分组 */}
              {SEVERITY_ORDER.map((sev) => {
                const group = report.issues.filter((i) => i.severity === sev)
                if (group.length === 0) return null
                return (
                  <section key={sev}>
                    <SectionHeader severity={sev} label={`${SEVERITY_LABELS[sev]}（${group.length}）`} />
                    <IssueList issues={group} />
                  </section>
                )
              })}

              {/* 按类别分组 */}
              <section>
                <SectionHeader severity={null} label="按类别分组" />
                {Object.entries(CATEGORY_LABELS).map(([cat, label]) => {
                  const group = report.issues.filter((i) => i.category === (cat as ValidationCategory))
                  if (group.length === 0) return null
                  return (
                    <div key={cat} className="mb-1.5">
                      <span
                        className={clsx(
                          'inline-block px-1 py-0.5 rounded text-[10px] font-medium mb-1',
                          CATEGORY_BADGE[cat as ValidationCategory],
                        )}
                      >
                        {label} · {group.length}
                      </span>
                      <IssueList issues={group} compact />
                    </div>
                  )
                })}
              </section>
            </>
          )}
        </>
      )}

      {!report && !error && running && <p className="text-[11px] text-gray-400">正在读取项目数据并执行校验…</p>}
    </div>
  )
}

function SummaryCell({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="px-1.5 py-1.5 text-center">
      <div className={clsx('text-sm font-semibold', className)}>{value}</div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500">{label}</div>
    </div>
  )
}

function SectionHeader({ severity, label }: { severity: ValidationSeverity | null; label: string }) {
  const Icon =
    severity === 'error' ? XCircle : severity === 'warning' ? AlertTriangle : severity === 'info' ? Info : Info
  return (
    <div
      className={clsx(
        'flex items-center gap-1 text-[11px] font-semibold mb-1',
        severity === 'error'
          ? 'text-red-500'
          : severity === 'warning'
            ? 'text-yellow-500'
            : 'text-gray-600 dark:text-gray-300',
      )}
    >
      <Icon size={12} />
      {label}
    </div>
  )
}

function IssueList({ issues, compact = false }: { issues: ValidationIssue[]; compact?: boolean }) {
  const isDark = useUIStore((s) => s.isDark)
  return (
    <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden mb-1.5">
      {issues.map((issue, idx) => (
        <div
          key={`${issue.location}-${issue.message}-${idx}`}
          className={clsx(
            'px-2 py-1 text-[11px]',
            idx > 0 && 'border-t border-gray-100 dark:border-gray-800',
            isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50',
          )}
        >
          <div className="flex items-start gap-1">
            <span className={clsx('shrink-0 mt-0.5', SEVERITY_COLOR[issue.severity])}>
              {issue.severity === 'error' ? (
                <XCircle size={11} />
              ) : issue.severity === 'warning' ? (
                <AlertTriangle size={11} />
              ) : (
                <Info size={11} />
              )}
            </span>
            <div className="min-w-0">
              <span className={clsx('break-all', isDark ? 'text-gray-200' : 'text-gray-800')}>{issue.message}</span>
              {issue.location && (
                <span className={clsx('block text-[10px] font-mono', isDark ? 'text-gray-500' : 'text-gray-400')}>
                  📍 {issue.location}
                </span>
              )}
              {!compact && issue.suggestion && (
                <span className={clsx('block text-[10px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
                  建议：{issue.suggestion}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
