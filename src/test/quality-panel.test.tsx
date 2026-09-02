/**
 * 4.6.0-F6-4（46-d）Q-4：质量仪表盘渲染（本地聚合 + 手动刷新，不遥测）
 * - Q4-1 面板渲染「质量」标签 + 刷新入口；无报告时给出生成提示
 * - Q4-2 展示覆盖率（后端/前端）、最近门禁结果、测试通过率
 * - Q4-3 展示校验通过率（validation.store 本地结果）与性能基准
 * - Q4-4 点击刷新 → 重新聚合本地数据（刷新时间戳更新）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup, waitFor } from '@testing-library/react'
import { QualityPanel } from '@/components/panel/QualityPanel'
import { useQualityStore } from '@/stores/quality.store'
import { useValidationStore } from '@/stores/validation.store'
import { runProjectValidation, type ProjectData } from '@/utils/validation'

const FAKE_REPORT = {
  schema: 'mc.quality-report/1',
  version: '4.6.0',
  generatedAt: '2026-09-02T00:00:00+0800',
  modules: [
    {
      id: 'pytest-backend',
      name: '后端 pytest（backend + ai_hub）',
      tool: 'pytest',
      status: 'pass',
      durationMs: 1200,
      tests: { total: 430, passed: 430, failed: 0, skipped: 0 },
      coverage: { lines: 62.5, threshold: 55 },
    },
    {
      id: 'vitest-frontend',
      name: '前端 vitest（renderer + electron）',
      tool: 'vitest',
      status: 'pass',
      coverage: { lines: 30.1, statements: 30.1, functions: 52.3, branches: 71.4, threshold: 26 },
    },
    { id: 'gate-golden', name: 'golden 渲染基线', tool: 'python', status: 'pass' },
    { id: 'gate-templates', name: '模板校验', tool: 'python', status: 'pass' },
  ],
  summary: { status: 'pass', modules: 4, passed: 4, failed: 0, totalTests: 430, passedTests: 430 },
}

const FAKE_THRESHOLDS = {
  schema: 1,
  backend: { fail_under: 55, paths: ['backend', 'ai_hub'] },
  frontend: { fail_under: 26, paths: ['src'], thresholds: { lines: 26, statements: 26, functions: 48, branches: 65 } },
}

function mockQualityElectron(opts: { report?: unknown; thresholds?: unknown } = {}) {
  const fileRead = vi.fn(async (p: string) => {
    if (p.includes('quality_report.json')) return opts.report ? JSON.stringify(opts.report) : ''
    if (p.includes('coverage_thresholds.json')) return opts.thresholds ? JSON.stringify(opts.thresholds) : ''
    return ''
  })
  ;(
    globalThis as unknown as {
      window: {
        electron: { app: { getPath: (n: string) => Promise<string> }; file: { read: (p: string) => Promise<string> } }
      }
    }
  ).window.electron = {
    app: { getPath: async () => 'C:/repo/backend' },
    file: { read: fileRead },
  }
  return fileRead
}

function healthyData(): ProjectData {
  return {
    project: 'demo',
    paraRows: [{ 工作簿名称: 'hostname.xlsx', 工作表名称: '主机表', 工作表类型: '赋值表', 对称列数: 0, key列数: 1 }],
    sheets: [
      {
        file: 'hostname.xlsx',
        sheet: '主机表',
        headers: ['设备名', '角色', '管理IP'],
        rows: [{ 设备名: 'SW-01', 角色: 'ASW', 管理IP: '192.168.1.1' }],
      },
    ],
    templates: [{ name: 'ASW.j2', content: 'hostname {{ info["设备名"] }}\n' }],
    outputDevices: [{ name: 'SW-01', role: 'ASW' }],
    outputBatch: '2026_09_02_10_00_00',
    hasOutput: true,
  }
}

beforeEach(() => {
  useQualityStore.getState().clear()
  useValidationStore.getState().clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('QualityPanel（Q4-1 渲染与空态）', () => {
  it('渲染「质量」标题与刷新入口', async () => {
    mockQualityElectron()
    render(<QualityPanel />)
    expect(screen.getByText('质量')).toBeTruthy()
    expect(screen.getByTitle('重新聚合本地质量数据')).toBeTruthy()
    expect(await screen.findByText(/暂无质量报告数据/)).toBeTruthy()
  })

  it('无报告数据时提示生成测试报告', async () => {
    mockQualityElectron()
    render(<QualityPanel />)
    expect(await screen.findByText(/暂无质量报告数据/)).toBeTruthy()
    expect(screen.getByText(/python scripts\/test_report.py/)).toBeTruthy()
  })
})

describe('QualityPanel（Q4-2 覆盖率/门禁/测试通过率）', () => {
  it('展示后端与前端覆盖率（含阈值）', async () => {
    mockQualityElectron({ report: FAKE_REPORT, thresholds: FAKE_THRESHOLDS })
    render(<QualityPanel />)
    expect(await screen.findByText('覆盖率（后端 pytest）')).toBeTruthy()
    expect(screen.getByText('覆盖率（前端 vitest）')).toBeTruthy()
    expect(screen.getAllByText(/62\.5%/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/30\.1%/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('行(lines)').length).toBeGreaterThan(0)
    expect(screen.getByText('分支')).toBeTruthy()
  })

  it('展示最近门禁结果与测试通过率', async () => {
    mockQualityElectron({ report: FAKE_REPORT, thresholds: FAKE_THRESHOLDS })
    render(<QualityPanel />)
    expect(await screen.findByText('最近门禁结果')).toBeTruthy()
    expect(screen.getByText('golden 渲染基线')).toBeTruthy()
    expect(screen.getByText('模板校验')).toBeTruthy()
    expect(screen.getByText('测试通过率')).toBeTruthy()
    expect(screen.getByText('430/430')).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()
  })
})

describe('QualityPanel（Q4-3 校验通过率 / 性能基准）', () => {
  it('校验未运行时提示在「校验」标签页运行', async () => {
    mockQualityElectron()
    render(<QualityPanel />)
    expect(await screen.findByText('校验通过率')).toBeTruthy()
    expect(screen.getByText(/尚未运行校验/)).toBeTruthy()
  })

  it('展示本地校验结果（通过/错误/警告）', async () => {
    mockQualityElectron({ report: FAKE_REPORT, thresholds: FAKE_THRESHOLDS })
    useValidationStore.getState().setReport(runProjectValidation(healthyData(), 'all'))
    render(<QualityPanel />)
    expect(await screen.findByText('校验通过率')).toBeTruthy()
    expect(screen.getAllByText('通过').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
  })

  it('展示性能基准参考（对齐 bench_perf.py）', async () => {
    mockQualityElectron()
    render(<QualityPanel />)
    expect(await screen.findByText(/性能基准/)).toBeTruthy()
    expect(screen.getByText(/批量渲染 100 项目/)).toBeTruthy()
  })
})

describe('QualityPanel（Q4-4 手动刷新）', () => {
  it('点击刷新 → 重新聚合本地数据（时间戳更新）', async () => {
    mockQualityElectron({ report: FAKE_REPORT, thresholds: FAKE_THRESHOLDS })
    render(<QualityPanel />)
    expect(await screen.findByText('覆盖率（后端 pytest）')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByTitle('重新聚合本地质量数据'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText(/刷新于/)).toBeTruthy()
    const data = useQualityStore.getState().data
    expect(data.reportAvailable).toBe(true)
    expect(data.coverageBackend.lines).toBe(62.5)
    expect(data.coverageFrontend.lines).toBe(30.1)
    expect(data.gates.length).toBe(4)
    await waitFor(() => expect(screen.getByText(/刷新于/)).toBeTruthy())
  })
})
