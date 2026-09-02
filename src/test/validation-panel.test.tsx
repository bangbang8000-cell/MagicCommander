/**
 * 4.5.0（D-5）校验报告面板 UI 单测（F5-5）：
 * - D5-1 面板渲染「校验」标签与一键校验/导出入口
 * - D5-2 一键校验当前项目（T1-T3）并展示通过/失败汇总
 * - D5-3 问题列表按严重度/类别分组、可定位
 * - D5-4 导出校验报告 JSON（Blob 下载）
 * - D5-5 校验未通过 → 门禁提示
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { ValidationPanel } from '@/components/panel/ValidationPanel'
import { ToastContainer } from '@/components/ui/Toast'
import { useValidationStore } from '@/stores/validation.store'
import { useUIStore } from '@/stores/ui.store'
import { runProjectValidation, type ProjectData } from '@/utils/validation'

function mockHealthyElectron() {
  ;(globalThis as unknown as { window: { electron: Record<string, unknown> } }).window.electron = {
    project: {
      list: async () => [{ id: 1, name: 'demo', index: 0 }],
      listFiles: async () => [
        { name: 'para.xlsx', path: 'para.xlsx', isDirectory: false },
        { name: 'excel/hostname.xlsx', path: 'excel/hostname.xlsx', isDirectory: false },
        { name: 'templates/ASW.j2', path: 'templates/ASW.j2', isDirectory: false },
        {
          name: 'output/2026_09_02_10_00_00/ASW/SW-01.txt',
          path: 'output/2026_09_02_10_00_00/ASW/SW-01.txt',
          isDirectory: false,
        },
      ],
      readExcel: async (id: number, filePath: string) => {
        if (filePath === 'para.xlsx') {
          return [
            {
              name: 'project_para',
              headers: ['工作簿名称', '工作表名称', '工作表类型', '对称列数', 'key列数'],
              rows: [
                { 工作簿名称: 'hostname.xlsx', 工作表名称: '主机表', 工作表类型: '赋值表', 对称列数: 0, key列数: 1 },
              ],
            },
          ]
        }
        if (filePath === 'excel/hostname.xlsx') {
          return [
            {
              name: '主机表',
              headers: ['设备名', '角色', '管理IP'],
              rows: [{ 设备名: 'SW-01', 角色: 'ASW', 管理IP: '192.168.1.1' }],
            },
          ]
        }
        return []
      },
      readFile: async () => 'hostname {{ info["设备名"] }}\n',
    },
  }
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
  useValidationStore.getState().clear()
  useUIStore.getState().setActiveProjectId(1)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ValidationPanel（D5-1 渲染与入口）', () => {
  it('渲染面板标题与一键校验/导出入口', () => {
    useValidationStore.getState().setReport(runProjectValidation(healthyData(), 'all'))
    render(<ValidationPanel />)
    expect(screen.getByText('校验')).toBeTruthy()
    expect(screen.getByText('一键校验')).toBeTruthy()
    expect(screen.getByText('导出报告 JSON')).toBeTruthy()
  })

  it('未选项目时提示选择项目', () => {
    useUIStore.getState().setActiveProjectId(null)
    render(<ValidationPanel />)
    expect(screen.getByText(/请先在左侧项目列表选择一个项目/)).toBeTruthy()
  })
})

describe('ValidationPanel（D5-2/D5-3 一键校验与问题列表）', () => {
  it('一键校验健康项目 → 通过汇总（errors=0）', async () => {
    mockHealthyElectron()
    useValidationStore.getState().setReport(runProjectValidation(healthyData(), 'all'))
    render(<ValidationPanel />)
    expect(screen.getByText('通过')).toBeTruthy()
    expect(screen.getByText('校验通过，未发现问题。')).toBeTruthy()
  })

  it('校验发现问题 → 按严重度分组展示 + 可定位', async () => {
    const data = healthyData()
    data.sheets[0].rows = [{ 设备名: 'SW-01', 角色: 'CORE', 管理IP: '999.1.1.1' }]
    data.templates = []
    const report = runProjectValidation(data, 'all')
    expect(report.ok).toBe(false)
    useValidationStore.getState().setReport(report)
    render(<ValidationPanel />)
    expect(screen.getByText('失败')).toBeTruthy()
    // 错误（非法 IP + 角色缺模板）
    expect(screen.getAllByText(/IPv4/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/CORE/).length).toBeGreaterThan(0)
    // 定位字段（location）
    expect(screen.getAllByText(/hostname\.xlsx\/主机表/).length).toBeGreaterThan(0)
    expect(screen.getByText(/按类别分组/)).toBeTruthy()
  })

  it('点击一键校验 → 采集数据并写入报告（通过）', async () => {
    mockHealthyElectron()
    render(<ValidationPanel />)
    await act(async () => {
      fireEvent.click(screen.getByText('一键校验'))
      await Promise.resolve()
      await Promise.resolve()
    })
    const report = useValidationStore.getState().report
    expect(report).not.toBeNull()
    expect(report?.ok).toBe(true)
    expect(useValidationStore.getState().lastRunAt).not.toBeNull()
  })
})

describe('ValidationPanel（D5-4 导出 / D5-5 门禁）', () => {
  it('校验失败 → 门禁提示', async () => {
    const data = healthyData()
    data.paraRows = []
    useValidationStore.getState().setReport(runProjectValidation(data, 'all'))
    render(<ValidationPanel />)
    expect(useValidationStore.getState().gateBlocked).toBe(true)
    expect(screen.getByText(/校验未通过：建议先修复/)).toBeTruthy()
  })

  it('导出报告 JSON 触发 Blob 下载', async () => {
    mockHealthyElectron()
    useValidationStore.getState().setReport(runProjectValidation(healthyData(), 'all'))
    render(<ValidationPanel />)
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    const clickSpy = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.stubGlobal(
      'Blob',
      class {
        parts: unknown[]
        opts: unknown
        constructor(parts: unknown[], opts: unknown) {
          this.parts = parts
          this.opts = opts
        }
      },
    )
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValue({ href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement)
    await act(async () => {
      fireEvent.click(screen.getByText('导出报告 JSON'))
    })
    expect(clickSpy).toHaveBeenCalled()
    createElement.mockRestore()
    vi.unstubAllGlobals()
  })
})

describe('ValidationPanel（4.8.0 F8-4/F8-5 评审导出与交付清单校验）', () => {
  function mockReviewElectron() {
    mockHealthyElectron()
    const electron = globalThis.window.electron as unknown as {
      project: Record<string, unknown>
    }
    electron.project.verifyManifest = vi.fn(async () => ({
      ok: true,
      rendered_at: '2026_09_02_10_00_00',
      missing: [],
      hash_mismatch: [],
      drifted: [],
      summary: { file_count: 1 },
    }))
    electron.project.exportReviewPackage = vi.fn(async () => ({
      status: 'success',
      data: { path: '/tmp/review.zip', project: 'demo' },
    }))
    electron.project.exportReviewPdf = vi.fn(async () => ({
      status: 'success',
      data: { path: '/tmp/review.pdf', project: 'demo' },
    }))
  }

  it('渲染评审导出与交付清单校验入口', () => {
    mockReviewElectron()
    useValidationStore.getState().setReport(runProjectValidation(healthyData(), 'all'))
    render(<ValidationPanel />)
    expect(screen.getByText('校验交付清单')).toBeTruthy()
    expect(screen.getByText('导出评审包')).toBeTruthy()
    expect(screen.getByText('导出评审 PDF')).toBeTruthy()
  })

  it('点击校验交付清单 → 调用 verifyManifest 并提示通过', async () => {
    mockReviewElectron()
    useValidationStore.getState().setReport(runProjectValidation(healthyData(), 'all'))
    render(
      <>
        <ToastContainer />
        <ValidationPanel />
      </>,
    )
    await act(async () => {
      fireEvent.click(screen.getByText('校验交付清单'))
      await Promise.resolve()
    })
    const verify = (globalThis.window.electron as unknown as { project: { verifyManifest: ReturnType<typeof vi.fn> } })
      .project.verifyManifest
    expect(verify).toHaveBeenCalledWith('demo')
    expect(screen.getByText(/交付物清单校验通过/)).toBeTruthy()
  })

  it('点击导出评审包 / 评审 PDF → 调用对应 IPC', async () => {
    mockReviewElectron()
    useValidationStore.getState().setReport(runProjectValidation(healthyData(), 'all'))
    render(<ValidationPanel />)
    await act(async () => {
      fireEvent.click(screen.getByText('导出评审包'))
      await Promise.resolve()
    })
    const pkg = (
      globalThis.window.electron as unknown as { project: { exportReviewPackage: ReturnType<typeof vi.fn> } }
    ).project.exportReviewPackage
    expect(pkg).toHaveBeenCalledWith('demo')
    await act(async () => {
      fireEvent.click(screen.getByText('导出评审 PDF'))
      await Promise.resolve()
    })
    const pdf = (globalThis.window.electron as unknown as { project: { exportReviewPdf: ReturnType<typeof vi.fn> } })
      .project.exportReviewPdf
    expect(pdf).toHaveBeenCalledWith('demo')
  })

  it('交付清单校验失败 → 提示错误', async () => {
    mockReviewElectron()
    const electron = globalThis.window.electron as unknown as { project: Record<string, unknown> }
    electron.project.verifyManifest = vi.fn(async () => ({
      ok: false,
      error: '批次缺少 manifest.json',
      missing: ['ASW/SW-01.txt'],
      hash_mismatch: [],
      drifted: [],
      summary: {},
    }))
    useValidationStore.getState().setReport(runProjectValidation(healthyData(), 'all'))
    render(
      <>
        <ToastContainer />
        <ValidationPanel />
      </>,
    )
    await act(async () => {
      fireEvent.click(screen.getByText('校验交付清单'))
      await Promise.resolve()
    })
    expect(screen.getByText(/批次缺少 manifest/)).toBeTruthy()
  })
})
