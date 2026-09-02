/**
 * 4.7.0-47-b/47-c/47-d：诊断中心面板（日志/审计/崩溃/性能/健康一处可查 + 一键导出支持包）
 * - 聚合诊断：系统信息/磁盘/版本、主进程日志摘要、崩溃、审计、遥测状态、性能快照
 * - 健康检查：环境/引擎/网络/依赖（diag:health，可刷新）
 * - 一键导出支持包（diag:export，adm-zip 打包 → 保存对话框）
 * - 遥测导出 / 清空（diag:telemetry:*）
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileArchive,
  HeartPulse,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react'
import clsx from 'clsx'
import { useUIStore } from '@/stores/ui.store'
import { usePlatformStore } from '@/stores/platform.store'
import { getSnapshot, getMemoryInfo } from '@/utils/perf'
import type { DiagnosticsReport, HealthReport, HealthCheckItem, PerfSnapshotDto } from '@/types/ipc'
import { showSuccess, showError } from '../ui/Toast'

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

function StatusDot({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 size={12} className="text-green-500 shrink-0" />
  ) : (
    <XCircle size={12} className="text-red-500 shrink-0" />
  )
}

function HealthGroup({ title, items }: { title: string; items: HealthCheckItem[] }) {
  return (
    <div className="mb-2">
      <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">{title}</div>
      <div className="space-y-0.5">
        {items.map((item) => (
          <div key={item.name} className="flex items-start gap-1.5 text-[11px]">
            <StatusDot ok={item.ok} />
            <span className="shrink-0 text-gray-600 dark:text-gray-300">{item.name}</span>
            <span className={clsx('break-all min-w-0', item.ok ? 'text-gray-400' : 'text-red-500')}>{item.detail}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function buildPerfSnapshot(): PerfSnapshotDto {
  const snap = getSnapshot()
  return {
    ops: snap.ops.map((o) => ({ ...o })),
    renderLongTasks: snap.renderLongTasks.map((t) => ({ ...t })),
    memory: getMemoryInfo(),
  }
}

export function DiagnosticsPanel() {
  const isDark = useUIStore((s) => s.isDark)
  const baseUrl = usePlatformStore((s) => s.baseUrl)
  const [report, setReport] = useState<DiagnosticsReport | null>(null)
  const [health, setHealth] = useState<HealthReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [healthLoading, setHealthLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (window.electron?.diag?.collect) {
        const rep = await window.electron.diag.collect(buildPerfSnapshot())
        setReport(rep)
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const runHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      if (window.electron?.diag?.health) {
        const hp = await window.electron.diag.health(baseUrl || undefined)
        setHealth(hp)
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    } finally {
      setHealthLoading(false)
    }
  }, [baseUrl])

  useEffect(() => {
    refresh()
    runHealth()
  }, [refresh, runHealth])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      if (!window.electron?.diag?.export) return
      const res = await window.electron.diag.export()
      if (res.ok && res.path) {
        showSuccess(`支持包已导出：${res.path}`)
      } else if (res.error && res.error !== 'canceled') {
        showError(res.error)
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }, [])

  const handleTelemetryExport = useCallback(async () => {
    try {
      if (!window.electron?.diag?.telemetryExport) return
      const res = await window.electron.diag.telemetryExport()
      if (res.ok && res.path) showSuccess(`遥测已导出：${res.path}`)
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const handleTelemetryClear = useCallback(async () => {
    try {
      if (!window.electron?.diag?.telemetryClear) return
      await window.electron.diag.telemetryClear()
      showSuccess('遥测数据已清空')
      refresh()
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err))
    }
  }, [refresh])

  const crashCount = report?.crash?.errorCount ?? 0
  const auditCount = report?.audit?.length ?? 0
  const telemetryEnabled = report?.telemetry?.enabled ?? false
  const telemetryCount = report?.telemetry?.events?.length ?? 0
  const perfOps = report?.perf?.ops?.length ?? 0
  const perfTasks = report?.perf?.renderLongTasks?.length ?? 0

  const healthSummary = health?.summary
  const healthOk = healthSummary ? healthSummary.failed === 0 : null

  return (
    <div className="flex flex-col h-full overflow-auto p-3 space-y-3">
      {/* 顶部操作 */}
      <div className="flex items-center gap-2">
        <button
          onClick={refresh}
          disabled={loading}
          className={clsx(
            'flex items-center gap-1 px-2 py-1 rounded text-[11px]',
            isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
          )}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> 刷新
        </button>
        <button
          onClick={handleExport}
          disabled={exporting}
          className={clsx(
            'flex items-center gap-1 px-2 py-1 rounded text-[11px]',
            isDark ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-blue-500 text-white hover:bg-blue-400',
          )}
        >
          <FileArchive size={12} /> 导出支持包
        </button>
        <button
          onClick={handleTelemetryExport}
          className={clsx(
            'flex items-center gap-1 px-2 py-1 rounded text-[11px]',
            isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300',
          )}
        >
          <Download size={12} /> 导出遥测
        </button>
        <button
          onClick={handleTelemetryClear}
          className={clsx(
            'flex items-center gap-1 px-2 py-1 rounded text-[11px]',
            isDark ? 'bg-gray-700 text-gray-300 hover:text-red-400' : 'bg-gray-200 text-gray-500 hover:text-red-500',
          )}
        >
          <Trash2 size={12} /> 清空遥测
        </button>
      </div>

      {/* 健康检查 */}
      <section>
        <SectionTitle
          icon={<HeartPulse size={12} className="text-gray-400" />}
          right={
            <button
              onClick={runHealth}
              disabled={healthLoading}
              className={clsx(
                'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]',
                isDark
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
              )}
            >
              <RefreshCw size={10} className={healthLoading ? 'animate-spin' : ''} /> 运行自检
            </button>
          }
        >
          健康检查
          {healthSummary && (
            <span className={clsx('ml-1 font-normal', healthOk ? 'text-green-500' : 'text-red-500')}>
              {healthOk ? '全部正常' : `${healthSummary.failed} 项异常 / ${healthSummary.total} 项`}
            </span>
          )}
        </SectionTitle>
        {healthLoading && !health ? (
          <div className="text-[11px] text-gray-400">正在运行自检...</div>
        ) : health ? (
          <div className="grid grid-cols-2 gap-x-4">
            <HealthGroup title="环境" items={health.environment} />
            <HealthGroup title="引擎" items={health.engine} />
            <HealthGroup title="网络" items={health.network} />
            <HealthGroup title="依赖" items={health.dependencies} />
          </div>
        ) : (
          <div className="text-[11px] text-gray-400">暂无数据</div>
        )}
      </section>

      {/* 聚合诊断摘要 */}
      <section>
        <SectionTitle icon={<Activity size={12} className="text-gray-400" />}>诊断摘要</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <SummaryCard label="崩溃记录" value={String(crashCount)} danger={crashCount > 0} isDark={isDark} />
          <SummaryCard label="审计事件" value={String(auditCount)} isDark={isDark} />
          <SummaryCard label="性能操作" value={String(perfOps)} isDark={isDark} />
          <SummaryCard label="渲染长任务" value={String(perfTasks)} isDark={isDark} />
        </div>
      </section>

      {/* 系统信息 */}
      {report && (
        <section>
          <SectionTitle icon={<AlertTriangle size={12} className="text-gray-400" />}>系统信息</SectionTitle>
          <div className="grid grid-cols-2 gap-x-4 text-[11px] text-gray-600 dark:text-gray-300 space-y-0.5">
            <Row label="版本" value={`${report.app.version} (build ${report.app.build})`} />
            <Row label="平台" value={`${report.app.platform} ${report.app.arch} ${report.app.release}`} />
            <Row label="Electron" value={report.versions.electron} />
            <Row label="Node" value={report.versions.node} />
            <Row label="磁盘可用" value={report.disk.freeGB != null ? `${report.disk.freeGB} GB` : '—'} />
            <Row label="用户数据目录" value={report.paths.userData} />
            <Row label="遥测" value={telemetryEnabled ? `已启用（${telemetryCount} 条）` : '未启用'} />
          </div>
        </section>
      )}

      {/* 最近审计 */}
      {report && report.audit.length > 0 && (
        <section>
          <SectionTitle icon={<Activity size={12} className="text-gray-400" />}>
            最近审计（{report.audit.length}）
          </SectionTitle>
          <div className="max-h-40 overflow-auto space-y-0.5">
            {report.audit
              .slice(-20)
              .reverse()
              .map((entry, i) => (
                <div key={`${entry.ts}-${i}`} className="flex gap-2 text-[11px] font-mono">
                  <span className="shrink-0 text-gray-400">{entry.ts}</span>
                  <span className="shrink-0 text-blue-500">{entry.action}</span>
                  {entry.detail && <span className="break-all text-gray-500 dark:text-gray-400">{entry.detail}</span>}
                </div>
              ))}
          </div>
        </section>
      )}

      {/* 最近崩溃 */}
      {report && crashCount > 0 && (
        <section>
          <SectionTitle icon={<AlertTriangle size={12} className="text-red-400" />}>
            最近崩溃（{crashCount}）
          </SectionTitle>
          <div className="space-y-0.5">
            {report.crash.lastLines.map((line, i) => (
              <div key={i} className="text-[11px] font-mono text-red-500 break-all">
                {line}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  danger,
  isDark,
}: {
  label: string
  value: string
  danger?: boolean
  isDark: boolean
}) {
  return (
    <div
      className={clsx('rounded border p-2', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50')}
    >
      <div className={clsx('text-[10px]', isDark ? 'text-gray-500' : 'text-gray-400')}>{label}</div>
      <div
        className={clsx(
          'text-lg font-semibold tabular-nums',
          danger ? 'text-red-500' : isDark ? 'text-gray-100' : 'text-gray-800',
        )}
      >
        {value}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 min-w-0">
      <span className="shrink-0 text-gray-400">{label}</span>
      <span className="break-all">{value}</span>
    </div>
  )
}
