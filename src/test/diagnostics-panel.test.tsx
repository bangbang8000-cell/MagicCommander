/**
 * 4.7.0-47-b/47-c/47-d：诊断中心面板（diag:* 通道 + 审计 + 健康 + 遥测）单测（覆盖率恢复）
 * - D1-1 渲染：刷新/导出支持包/导出遥测/清空遥测按钮、健康检查标题与状态
 * - D1-2 诊断摘要：崩溃记录/审计事件/性能操作/渲染长任务计数
 * - D1-3 系统信息：版本/平台/磁盘/遥测状态
 * - D1-4 最近审计列表、最近崩溃列表（crashCount>0 时展示）
 * - D1-5 交互：导出支持包 → collect/export；导出遥测 → telemetryExport；清空遥测 → telemetryClear + 刷新
 * - D1-6 健康失败数>0 → 显示异常文案（N 项异常 / M 项）
 * - D1-7 空态：diag 未挂载时面板不崩溃（显示「暂无数据」）
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { DiagnosticsPanel } from '@/components/panel/DiagnosticsPanel'
import type { DiagnosticsReport, HealthReport } from '@/types/ipc'

const FAKE_REPORT: DiagnosticsReport = {
  generatedAt: '2026-09-02T10:00:00.000Z',
  app: { name: 'MagicCommander', version: '4.7.0', build: '2', platform: 'win32', arch: 'x64', release: '10.0.22631' },
  versions: { electron: '28.3.3', node: '20.11.0', chrome: '120.0.0.0' },
  paths: { userData: 'C:/Users/test/AppData/Roaming/MagicCommander', logs: 'C:/tmp/mc-logs' },
  disk: { path: 'C:', freeBytes: 126123456789, freeGB: '117.6' },
  mainLog: 'main.log line1\nmain.log line2',
  crash: { errorCount: 0, lastLines: [], crashDumpsDir: 'C:/tmp/dumps', errorsLog: '' },
  audit: [],
  telemetry: { enabled: false, events: [] },
  perf: { ops: [], renderLongTasks: [], memory: null },
}

const FAKE_REPORT_RICH: DiagnosticsReport = {
  ...FAKE_REPORT,
  crash: {
    errorCount: 2,
    lastLines: ['ERR: crash line 1', 'ERR: crash line 2'],
    crashDumpsDir: 'C:/tmp/dumps',
    errorsLog: 'ERR: crash line 1',
  },
  audit: [
    { ts: '2026-09-02T10:00:00', action: 'project.create', detail: 'demo' },
    { ts: '2026-09-02T10:01:00', action: 'render.start', detail: 'hostname.xlsx' },
  ],
  telemetry: { enabled: true, events: [{ name: 'app.start', ts: 1725000000000 }] },
  perf: {
    ops: [{ id: '1', category: 'render', label: '大参数表准备', durationMs: 123, startedAt: 1000 }],
    renderLongTasks: [{ startTime: 2000, durationMs: 15 }],
    memory: null,
  },
}

const FAKE_HEALTH: HealthReport = {
  generatedAt: '2026-09-02T10:00:00.000Z',
  environment: [{ name: 'Node', ok: true, detail: 'v20.11.0' }],
  engine: [{ name: '渲染引擎', ok: true, detail: '可用' }],
  network: [{ name: '外网', ok: true, detail: '通畅' }],
  dependencies: [{ name: 'Python', ok: true, detail: '3.12' }],
  summary: { total: 4, ok: 4, failed: 0 },
}

const FAKE_HEALTH_FAILED: HealthReport = {
  ...FAKE_HEALTH,
  network: [{ name: '外网', ok: false, detail: '连接超时' }],
  summary: { total: 4, ok: 3, failed: 1 },
}

function mockDiag(opts: { report?: DiagnosticsReport; health?: HealthReport } = {}) {
  const collect = vi.fn(async () => opts.report ?? FAKE_REPORT)
  const health = vi.fn(async () => opts.health ?? FAKE_HEALTH)
  const exportDiag = vi.fn(async () => ({ ok: true, path: 'C:/tmp/mc-support.zip' }))
  const telemetryExport = vi.fn(async () => ({ ok: true, path: 'C:/tmp/mc-telemetry.json' }))
  const telemetryClear = vi.fn(async () => true)
  ;(
    globalThis as unknown as {
      window: {
        electron: {
          project: { list: () => Promise<[]> }
          file: { read: () => Promise<string> }
          app: { getPath: () => Promise<string> }
          diag: {
            collect: typeof collect
            health: typeof health
            export: typeof exportDiag
            telemetryExport: typeof telemetryExport
            telemetryClear: typeof telemetryClear
          }
        }
      }
    }
  ).window.electron = {
    project: { list: async () => [] },
    file: { read: async () => '' },
    app: { getPath: async () => '/mock/path' },
    diag: { collect, health, export: exportDiag, telemetryExport, telemetryClear },
  }
  return { collect, health, export: exportDiag, telemetryExport, telemetryClear }
}

function unmountDiag() {
  ;(
    globalThis as unknown as {
      window: {
        electron: {
          project: { list: () => Promise<[]> }
          file: { read: () => Promise<string> }
          app: { getPath: () => Promise<string> }
        }
      }
    }
  ).window.electron = {
    project: { list: async () => [] },
    file: { read: async () => '' },
    app: { getPath: async () => '/mock/path' },
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DiagnosticsPanel（D1-1/D1-2 渲染：按钮、健康、诊断摘要）', () => {
  it('渲染操作按钮与健康检查标题（健康全部正常）', async () => {
    mockDiag()
    render(<DiagnosticsPanel />)
    expect(screen.getByText('刷新')).toBeTruthy()
    expect(screen.getByText('导出支持包')).toBeTruthy()
    expect(screen.getByText('导出遥测')).toBeTruthy()
    expect(screen.getByText('清空遥测')).toBeTruthy()
    expect(await screen.findByText('健康检查')).toBeTruthy()
    expect(screen.getByText('运行自检')).toBeTruthy()
    expect(screen.getByText('全部正常')).toBeTruthy()
  })

  it('渲染诊断摘要（崩溃/审计/性能/渲染长任务计数）', async () => {
    mockDiag({ report: FAKE_REPORT_RICH })
    render(<DiagnosticsPanel />)
    expect(await screen.findByText('诊断摘要')).toBeTruthy()
    expect(screen.getByText('崩溃记录')).toBeTruthy()
    expect(screen.getByText('审计事件')).toBeTruthy()
    expect(screen.getByText('性能操作')).toBeTruthy()
    expect(screen.getByText('渲染长任务')).toBeTruthy()
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(2)
  })
})

describe('DiagnosticsPanel（D1-3/D1-4 系统信息、最近审计/崩溃）', () => {
  it('渲染系统信息（版本/平台/磁盘/遥测状态）', async () => {
    mockDiag({ report: FAKE_REPORT_RICH })
    render(<DiagnosticsPanel />)
    expect(await screen.findByText('系统信息')).toBeTruthy()
    expect(screen.getByText(/4\.7\.0 \(build 2\)/)).toBeTruthy()
    expect(screen.getByText(/win32 x64 10\.0\.22631/)).toBeTruthy()
    expect(screen.getByText('28.3.3')).toBeTruthy()
    expect(screen.getByText('20.11.0')).toBeTruthy()
    expect(screen.getByText(/117\.6 GB/)).toBeTruthy()
    expect(screen.getByText(/已启用（1 条）/)).toBeTruthy()
  })

  it('展示最近审计与最近崩溃列表（crashCount>0 时）', async () => {
    mockDiag({ report: FAKE_REPORT_RICH })
    render(<DiagnosticsPanel />)
    expect(await screen.findByText(/最近审计（2）/)).toBeTruthy()
    expect(screen.getByText('project.create')).toBeTruthy()
    expect(screen.getByText('render.start')).toBeTruthy()
    expect(await screen.findByText(/最近崩溃（2）/)).toBeTruthy()
    expect(screen.getByText(/crash line 1/)).toBeTruthy()
    expect(screen.getByText(/crash line 2/)).toBeTruthy()
  })
})

describe('DiagnosticsPanel（D1-5/D1-6 交互与健康异常）', () => {
  it('点击导出支持包 → collect/export 被调用', async () => {
    const mocks = mockDiag()
    render(<DiagnosticsPanel />)
    await screen.findByText('健康检查')
    await act(async () => {
      fireEvent.click(screen.getByText('导出支持包'))
      await Promise.resolve()
    })
    expect(mocks.collect).toHaveBeenCalled()
    expect(mocks.export).toHaveBeenCalled()
  })

  it('点击导出遥测 → telemetryExport 被调用', async () => {
    const mocks = mockDiag()
    render(<DiagnosticsPanel />)
    await screen.findByText('健康检查')
    await act(async () => {
      fireEvent.click(screen.getByText('导出遥测'))
      await Promise.resolve()
    })
    expect(mocks.telemetryExport).toHaveBeenCalled()
  })

  it('点击清空遥测 → telemetryClear 被调用并触发刷新（collect 再次调用）', async () => {
    const mocks = mockDiag()
    render(<DiagnosticsPanel />)
    await screen.findByText('健康检查')
    await act(async () => {
      fireEvent.click(screen.getByText('清空遥测'))
      await Promise.resolve()
    })
    expect(mocks.telemetryClear).toHaveBeenCalled()
    expect(mocks.collect).toHaveBeenCalledTimes(2)
  })

  it('健康失败数>0 → 显示异常文案（N 项异常 / M 项）', async () => {
    mockDiag({ health: FAKE_HEALTH_FAILED })
    render(<DiagnosticsPanel />)
    expect(await screen.findByText(/1 项异常 \/ 4 项/)).toBeTruthy()
    expect(screen.queryByText('全部正常')).toBeNull()
    expect(screen.getByText('连接超时')).toBeTruthy()
  })
})

describe('DiagnosticsPanel（D1-7 空态）', () => {
  it('diag 未挂载时面板不崩溃（健康区显示「暂无数据」）', async () => {
    unmountDiag()
    render(<DiagnosticsPanel />)
    expect(screen.getByText('刷新')).toBeTruthy()
    expect(screen.getByText('导出支持包')).toBeTruthy()
    expect(await screen.findByText('暂无数据')).toBeTruthy()
    expect(screen.queryByText('系统信息')).toBeNull()
  })
})
