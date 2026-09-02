/**
 * 47-c：健康检查 / 自检（环境/引擎/网络/依赖）
 * - 环境：OS/arch/运行时版本/磁盘
 * - 引擎：AI Hub 健康（mock）、Python 探测（mock spawn）
 * - 网络：更新源 + 平台 /api/v1/health（mock fetch）
 * - 单项失败不影响其余项
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { spawn } from 'child_process'
import { aiHubService } from './aiHub.service'
import { healthService } from './health.service'

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

const spawnMock = vi.mocked(spawn)

function makePythonProcess(output: string, code = 0) {
  return {
    stdout: {
      on: (ev: string, cb: (d: Buffer) => void) => {
        if (ev === 'data') setTimeout(() => cb(Buffer.from(output)), 0)
      },
    },
    stderr: { on: () => {} },
    on: (ev: string, cb: (c: number) => void) => {
      if (ev === 'close') setTimeout(() => cb(code), 0)
    },
    kill: () => {},
  } as unknown as ReturnType<typeof spawn>
}

beforeEach(() => {
  // vitest 运行于纯 Node：补齐 Electron 主进程才有的字段（getPythonPath 依赖 resourcesPath）
  ;(process as unknown as { resourcesPath: string }).resourcesPath = '/mock/resources'
  ;(process.versions as Record<string, string>).electron = '28.0.0'
  vi.stubGlobal('fetch', vi.fn())
  vi.spyOn(aiHubService, 'healthCheck').mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('HealthService.run', () => {
  it('全绿：AI Hub 健康、Python 正常、网络可达', async () => {
    spawnMock.mockReturnValue(makePythonProcess('{"version":"3.10.0","modules":["openpyxl","yaml","jinja2"]}'))
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response)

    const report = await healthService.run('https://platform.example.com')

    expect(report.summary.failed).toBe(0)
    expect(report.environment.some((i) => i.name === '操作系统' && i.ok)).toBe(true)
    expect(report.engine[0].ok).toBe(true)
    expect(report.dependencies[0].ok).toBe(true)
    expect(report.network.length).toBe(2)
    expect(report.network.every((i) => i.ok)).toBe(true)
    // 平台 URL 参与网络检查
    expect(fetchMock).toHaveBeenCalledWith('https://platform.example.com/api/v1/health', expect.anything())
  })

  it('AI Hub 不健康 → 引擎异常；更新源不可达 → 网络异常（其余项不受影响）', async () => {
    vi.spyOn(aiHubService, 'healthCheck').mockResolvedValue(false)
    spawnMock.mockReturnValue(makePythonProcess('{"version":"3.10.0"}'))
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response)

    const report = await healthService.run('https://platform.example.com')

    expect(report.summary.failed).toBeGreaterThan(0)
    expect(report.engine[0].ok).toBe(false)
    expect(report.network.every((i) => i.ok)).toBe(false)
    expect(report.environment.some((i) => i.name === '运行时' && i.ok)).toBe(true)
    expect(report.dependencies[0].ok).toBe(true)
  })

  it('Python 探测失败（spawn error）→ 依赖异常', async () => {
    vi.spyOn(aiHubService, 'healthCheck').mockResolvedValue(true)
    spawnMock.mockImplementation(() => {
      const proc = makePythonProcess('')
      // 覆盖为 error 事件
      ;(proc as unknown as { on: (ev: string, cb: (e: Error) => void) => void }).on = (ev, cb) => {
        if (ev === 'error') setTimeout(() => cb(new Error('python not found')), 0)
      }
      return proc
    })
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response)

    const report = await healthService.run()

    const py = report.dependencies.find((i) => i.name === 'Python 环境')
    expect(py?.ok).toBe(false)
    expect(report.network.length).toBe(1)
  })
})
