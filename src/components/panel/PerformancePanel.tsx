/**
 * 4.2.0-42-e（F2-5 / S-6）：性能仪表盘面板（内存/操作耗时/渲染耗时/基准对比，本地采集不遥测）
 * - 内存：performance.memory JS 堆（每秒刷新）+ deviceMemory
 * - 操作耗时：perf 环形缓冲（render/load/save/export/other）+ 手动测量按钮
 * - 渲染耗时：longtask 观察 + 合成大列表渲染测量点
 * - 基准对比：scripts/bench_perf.py 达标阈值参考（批量渲染 ≤90s / 单项目全量 ≤30s / 万行参数 ≤30s）
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Gauge, MemoryStick, Cpu, Activity, Play, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import {
  subscribe,
  getSnapshot,
  getOps,
  getOpStats,
  clearOps,
  clearRenderMetrics,
  startRenderObserver,
  stopRenderObserver,
  getRenderMetrics,
  getMemoryInfo,
  getBenchmarkReference,
  formatMs,
  formatMB,
  measureSync,
  runSyntheticRender,
  type PerfCategory,
} from '@/utils/perf'

const CATEGORY_ORDER: PerfCategory[] = ['render', 'load', 'save', 'export', 'other']

const CATEGORY_LABEL: Record<PerfCategory, string> = {
  render: '渲染',
  load: '加载',
  save: '保存',
  export: '导出',
  other: '其他',
}

const CATEGORY_COLOR: Record<PerfCategory, string> = {
  render: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  load: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  save: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  export: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  other: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

function CategoryBadge({ category }: { category: PerfCategory }) {
  return (
    <span className={clsx('px-1 py-0.5 rounded text-[10px] font-medium', CATEGORY_COLOR[category])}>
      {CATEGORY_LABEL[category]}
    </span>
  )
}

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

export function PerformancePanel() {
  // 订阅 perf 状态：记录新增/清空/渲染任务变更时触发重渲染
  useSyncExternalStore(subscribe, getSnapshot)
  const [memory, setMemory] = useState(() => getMemoryInfo())

  // 内存每秒刷新
  useEffect(() => {
    const timer = window.setInterval(() => setMemory(getMemoryInfo()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // 挂载时启动渲染长任务观察（面板卸载即停止）
  useEffect(() => {
    const stop = startRenderObserver()
    return () => {
      stop()
      stopRenderObserver()
    }
  }, [])

  const ops = getOps()
  const renderMetrics = getRenderMetrics()
  const benchmark = getBenchmarkReference()

  // 手动测量：万行参数表序列化（对齐 undo/autosave 序列化路径）
  const handleMeasureSheet = () => {
    measureSync('大参数表序列化(万行)', 'render', () => {
      const rows = Array.from({ length: 10000 }, (_, i) => ({ 参数名: `PARAM_${i}`, 参数值: `value_${i}` }))
      return JSON.stringify(rows).length
    })
  }

  // 手动测量：千文件批次渲染数据准备
  const handleMeasureBatch = () => {
    measureSync('批量渲染数据准备(1000文件)', 'render', () => {
      const jobs = Array.from({ length: 1000 }, (_, i) => ({
        id: `proj_${i}`,
        format: 'device_name',
        renderType: 'project',
      }))
      return JSON.stringify(jobs).length
    })
  }

  const handleMeasureRender = () => {
    runSyntheticRender(20000)
  }

  return (
    <div className="h-full overflow-auto p-2.5 space-y-3 bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200">
          <Gauge size={13} className="text-primary-500" />
          性能
        </span>
        <button
          onClick={() => {
            clearOps()
            clearRenderMetrics()
          }}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          title="清空"
        >
          <Trash2 size={12} className="text-gray-400" />
        </button>
      </div>

      {/* 内存 */}
      <section>
        <SectionTitle icon={<MemoryStick size={12} className="text-gray-400" />}>内存</SectionTitle>
        {memory.available ? (
          <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-gray-200 dark:divide-gray-700 text-center">
              <StatCell label="已用" value={formatMB(memory.usedJsHeapMB)} />
              <StatCell label="总量" value={formatMB(memory.totalJsHeapMB)} />
              <StatCell label="上限" value={formatMB(memory.jsHeapLimitMB)} />
            </div>
            {memory.jsHeapUsedPct != null && (
              <div className="h-1 bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-full bg-primary-500 transition-all"
                  style={{ width: `${Math.min(100, memory.jsHeapUsedPct)}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-gray-400">内存信息不可用（需 Chromium performance.memory）</p>
        )}
        {memory.deviceMemoryGB != null && (
          <p className="mt-1 text-[11px] text-gray-400">设备内存: {memory.deviceMemoryGB} GB</p>
        )}
      </section>

      {/* 操作耗时 */}
      <section>
        <SectionTitle
          icon={<Cpu size={12} className="text-gray-400" />}
          right={
            <div className="flex items-center gap-1">
              <button
                onClick={handleMeasureSheet}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Play size={10} />
                测量万行参数
              </button>
              <button
                onClick={handleMeasureBatch}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Play size={10} />
                测量千文件批次
              </button>
            </div>
          }
        >
          操作耗时
        </SectionTitle>
        {ops.length === 0 ? (
          <p className="text-[11px] text-gray-400">暂无操作记录（Excel 打开/渲染/测量后自动记录）</p>
        ) : (
          <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                  <th className="text-left font-medium px-1.5 py-1">分类</th>
                  <th className="text-left font-medium px-1.5 py-1">操作</th>
                  <th className="text-right font-medium px-1.5 py-1">耗时</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {ops
                  .slice(-12)
                  .reverse()
                  .map((op) => (
                    <tr key={op.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-1.5 py-0.5">
                        <CategoryBadge category={op.category} />
                      </td>
                      <td className="px-1.5 py-0.5 text-gray-600 dark:text-gray-300 truncate max-w-[180px]">
                        {op.label}
                      </td>
                      <td className="px-1.5 py-0.5 text-right font-mono tabular-nums text-gray-700 dark:text-gray-200">
                        {formatMs(op.durationMs)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className="px-1.5 py-1 border-t border-gray-100 dark:border-gray-700 text-[10px] text-gray-400 space-y-0.5">
              {CATEGORY_ORDER.map((c) => {
                const s = getOpStats(c)
                if (!s) return null
                return (
                  <div key={c} className="flex items-center gap-1.5">
                    <CategoryBadge category={c} />
                    <span>
                      {s.count}× · avg {formatMs(s.avgMs)} · max {formatMs(s.maxMs)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* 渲染耗时 */}
      <section>
        <SectionTitle
          icon={<Activity size={12} className="text-gray-400" />}
          right={
            <button
              onClick={handleMeasureRender}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Play size={10} />
              运行合成渲染
            </button>
          }
        >
          渲染长任务
          <span
            className={clsx(
              'ml-1 inline-flex items-center gap-1 text-[10px]',
              renderMetrics.observing ? 'text-green-500' : 'text-gray-400',
            )}
          >
            <span
              className={clsx('w-1.5 h-1.5 rounded-full', renderMetrics.observing ? 'bg-green-500' : 'bg-gray-300')}
            />
            {renderMetrics.observing ? '观察中' : '未观察'}
          </span>
        </SectionTitle>
        <div className="grid grid-cols-4 gap-1">
          <StatCell label="次数" value={String(renderMetrics.count)} />
          <StatCell label="平均" value={formatMs(renderMetrics.avgMs)} />
          <StatCell label="最大" value={formatMs(renderMetrics.maxMs)} />
          <StatCell label="累计" value={formatMs(renderMetrics.totalMs)} />
        </div>
      </section>

      {/* 基准对比 */}
      <section>
        <SectionTitle icon={<Activity size={12} className="text-gray-400" />}>
          性能基准（scripts/bench_perf.py）
        </SectionTitle>
        <p className="text-[10px] text-gray-400 mb-1">本地门禁达标阈值参考（CI 中超阈值将失败）</p>
        <div className="rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                <th className="text-left font-medium px-1.5 py-1">场景</th>
                <th className="text-right font-medium px-1.5 py-1">阈值</th>
                <th className="text-left font-medium px-1.5 py-1 hidden sm:table-cell">来源</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {benchmark.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-1.5 py-0.5 text-gray-600 dark:text-gray-300">{b.label}</td>
                  <td className="px-1.5 py-0.5 text-right font-mono tabular-nums text-gray-700 dark:text-gray-200">
                    ≤ {formatMs(b.thresholdMs)}
                  </td>
                  <td className="px-1.5 py-0.5 text-gray-400 hidden sm:table-cell">{b.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[10px] text-gray-400">数据本地采集，不上传（不遥测）</p>
      </section>
    </div>
  )
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-1.5 py-1 text-center">
      <div className="text-xs font-mono tabular-nums text-gray-800 dark:text-gray-100">{value}</div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500">{label}</div>
    </div>
  )
}
