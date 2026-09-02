/**
 * 4.6.0-F6-4（46-d）质量仪表盘面板：与日志/终端/性能/校验并列「质量」标签
 * - 覆盖率（后端/前端）：阈值对比 + 进度条
 * - 最近门禁结果（golden/模板/性能/校验）与测试通过率（来自 reports/quality_report.json）
 * - 校验通过率（validation.store 本地结果）
 * - 性能基准（scripts/bench_perf.py 达标阈值参考）
 * - 数据本地聚合 + 手动刷新（不遥测）
 */
import { useEffect, useState } from 'react'
import { BadgeCheck, RefreshCw, ShieldCheck, Gauge, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { useQualityStore, type QualityCoverage, type QualityGateResult } from '@/stores/quality.store'
import { useValidationStore } from '@/stores/validation.store'
import { useUIStore } from '@/stores/ui.store'

function SectionTitle({
  icon,
  children,
  right,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-1">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300">
        {icon}
        {children}
      </span>
      {right}
    </div>
  )
}

function CoverageBar({ label, value, threshold }: { label: string; value: number | null; threshold: number }) {
  const pass = value != null && value >= threshold
  const width = value == null ? 0 : Math.min(100, value)
  const color = value == null ? 'bg-gray-300' : pass ? 'bg-green-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] text-gray-600 dark:text-gray-300">{label}</span>
      <div className="h-1.5 flex-1 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
        <div className={clsx('h-full transition-all', color)} style={{ width: `${width}%` }} />
      </div>
      <span
        className={clsx(
          'w-24 shrink-0 text-right font-mono tabular-nums text-[11px]',
          pass ? 'text-green-600 dark:text-green-400' : value == null ? 'text-gray-400' : 'text-red-500',
        )}
      >
        {value == null ? '—' : `${value}%`}
        <span className="text-gray-400"> / {threshold}%</span>
      </span>
    </div>
  )
}

function CoverageGrid({
  title,
  coverage,
  showMetrics,
}: {
  title: string
  coverage: QualityCoverage
  showMetrics: boolean
}) {
  return (
    <section>
      <SectionTitle icon={<Gauge size={12} className="text-gray-400" />}>{title}</SectionTitle>
      <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden space-y-1 p-1.5">
        <CoverageBar label="行(lines)" value={coverage.lines} threshold={coverage.threshold} />
        {showMetrics && (
          <>
            <CoverageBar label="语句" value={coverage.statements} threshold={coverage.threshold} />
            <CoverageBar label="函数" value={coverage.functions} threshold={coverage.threshold} />
            <CoverageBar label="分支" value={coverage.branches} threshold={coverage.threshold} />
          </>
        )}
      </div>
    </section>
  )
}

function GateBadge({ status }: { status: QualityGateResult['status'] }) {
  if (status === 'pass') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
        <CheckCircle2 size={9} /> 通过
      </span>
    )
  }
  if (status === 'fail') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <XCircle size={9} /> 失败
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      <AlertTriangle size={9} /> 未知
    </span>
  )
}

export function QualityPanel() {
  const { data, loading, error, refresh, syncValidation } = useQualityStore()
  const validation = useValidationStore((s) => ({ report: s.report, lastRunAt: s.lastRunAt }))
  const isDark = useUIStore((s) => s.isDark)
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null)

  // 首次挂载聚合一次；校验结果变化时仅同步本地指标（无需重新读文件）
  useEffect(() => {
    refresh().then(() => setRefreshedAt(new Date().toLocaleTimeString()))
  }, [refresh])

  useEffect(() => {
    syncValidation()
  }, [syncValidation, validation.report, validation.lastRunAt])

  const handleRefresh = async () => {
    await refresh()
    setRefreshedAt(new Date().toLocaleTimeString())
  }

  const hasCoverage = data.coverageBackend.lines != null || data.coverageFrontend.lines != null
  const summary = data.summary

  return (
    <div className="h-full overflow-auto p-2.5 space-y-3 bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200">
          <BadgeCheck size={13} className="text-primary-500" />
          质量
        </span>
        <div className="flex items-center gap-2">
          {refreshedAt && <span className="text-[10px] text-gray-400">刷新于 {refreshedAt}</span>}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            title="重新聚合本地质量数据"
          >
            <RefreshCw size={10} className={clsx(loading && 'animate-spin')} />
            {loading ? '聚合中…' : '刷新'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-2 py-1.5 text-[11px] text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {!hasCoverage && summary == null && data.gates.length === 0 && (
        <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 px-3 py-3 text-[11px] text-gray-500 dark:text-gray-400 space-y-1">
          <p>暂无质量报告数据。请先运行测试报告脚本生成聚合产物：</p>
          <pre className="font-mono text-[10px] bg-gray-100 dark:bg-gray-900 rounded px-2 py-1 overflow-x-auto">
            python scripts/test_report.py
          </pre>
          <p className="text-[10px] text-gray-400">
            覆盖率/门禁/测试通过率将聚合到 reports/quality_report.json，点击「刷新」加载。
          </p>
        </div>
      )}

      {/* 覆盖率 */}
      {(data.coverageBackend.lines != null || data.coverageFrontend.lines != null) && (
        <CoverageGrid title="覆盖率（后端 pytest）" coverage={data.coverageBackend} showMetrics={false} />
      )}
      {data.coverageFrontend.lines != null && (
        <CoverageGrid title="覆盖率（前端 vitest）" coverage={data.coverageFrontend} showMetrics />
      )}

      {/* 测试通过率 */}
      {summary && (
        <section>
          <SectionTitle icon={<ShieldCheck size={12} className="text-gray-400" />}>测试通过率</SectionTitle>
          <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="grid grid-cols-4 divide-x divide-gray-200 dark:divide-gray-700 text-center">
              <StatCell
                label="总体"
                value={summary.status === 'pass' ? '通过' : '失败'}
                valueClass={summary.status === 'pass' ? 'text-green-500' : 'text-red-500'}
              />
              <StatCell label="模块" value={`${summary.passed}/${summary.modules}`} />
              <StatCell label="用例" value={`${summary.passedTests}/${summary.totalTests}`} />
              <StatCell
                label="通过率"
                value={summary.totalTests ? `${Math.round((summary.passedTests / summary.totalTests) * 100)}%` : '—'}
              />
            </div>
          </div>
        </section>
      )}

      {/* 最近门禁结果 */}
      {data.gates.length > 0 && (
        <section>
          <SectionTitle icon={<ShieldCheck size={12} className="text-gray-400" />}>最近门禁结果</SectionTitle>
          <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
            {data.gates.map((g) => (
              <div
                key={g.id}
                className={clsx(
                  'flex items-center gap-2 px-2 py-1 text-[11px]',
                  isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50',
                )}
              >
                <GateBadge status={g.status} />
                <span className={clsx('min-w-0 flex-1 truncate', isDark ? 'text-gray-200' : 'text-gray-700')}>
                  {g.name}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-gray-400">
            来自 reports/quality_report.json（golden/模板/性能/校验门禁）
          </p>
        </section>
      )}

      {/* 校验通过率 */}
      <section>
        <SectionTitle icon={<ShieldCheck size={12} className="text-gray-400" />}>校验通过率</SectionTitle>
        <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
          {validation.report ? (
            <div className="grid grid-cols-4 divide-x divide-gray-200 dark:divide-gray-700 text-center">
              <StatCell
                label="总体"
                value={validation.report.ok ? '通过' : '失败'}
                valueClass={validation.report.ok ? 'text-green-500' : 'text-red-500'}
              />
              <StatCell
                label="错误"
                value={String(validation.report.summary.errors)}
                valueClass={validation.report.summary.errors > 0 ? 'text-red-500' : 'text-gray-600 dark:text-gray-300'}
              />
              <StatCell
                label="警告"
                value={String(validation.report.summary.warnings)}
                valueClass={
                  validation.report.summary.warnings > 0 ? 'text-yellow-500' : 'text-gray-600 dark:text-gray-300'
                }
              />
              <StatCell label="校验项" value={String(validation.report.checks.length)} />
            </div>
          ) : (
            <p className="px-2 py-2 text-[11px] text-gray-400">尚未运行校验（在「校验」标签页一键校验当前项目）</p>
          )}
          {validation.lastRunAt && (
            <div className="px-2 py-1 border-t border-gray-100 dark:border-gray-700 text-[10px] text-gray-400">
              最近校验：{new Date(validation.lastRunAt).toLocaleString()}
            </div>
          )}
        </div>
      </section>

      {/* 性能基准 */}
      {data.perf.length > 0 && (
        <section>
          <SectionTitle icon={<Gauge size={12} className="text-gray-400" />}>
            性能基准（scripts/bench_perf.py）
          </SectionTitle>
          <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-[11px]">
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.perf.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-2 py-1 text-gray-600 dark:text-gray-300">{b.label}</td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums text-gray-700 dark:text-gray-200">
                      ≤ {b.thresholdMs} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[10px] text-gray-400">数据本地聚合，不上传（不遥测）</p>
        </section>
      )}
    </div>
  )
}

function StatCell({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="px-1.5 py-1.5 text-center">
      <div className={clsx('text-sm font-semibold', valueClass ?? 'text-gray-800 dark:text-gray-100')}>{value}</div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500">{label}</div>
    </div>
  )
}
