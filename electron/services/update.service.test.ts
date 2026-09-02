/**
 * 47-a: 更新 fallback 兜底链测试（electron 配置运行）
 * - electron-updater 主路径失败 → net.request 直连 latest.yml 解析 version/path 并缓存
 * - downloadInstallerFile：3xx 重定向 + Content-Length 字节比对（不一致判截断失败并清理）
 * - downloadInstallerDirectly：写入系统 downloads 目录
 * - quitAndInstall 兜底：fs.existsSync 校验存在后 shell.openPath + 延迟退出
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { app, net, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { UpdateService } from './update.service'

vi.mock('electron-updater', () => {
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  }
  return { autoUpdater }
})

interface FakeResponse {
  statusCode: number
  headers: Record<string, string | string[]>
  on: (ev: string, cb: (chunk?: Buffer | string) => void) => void
  destroy: () => void
}

type NetRequestMock = ReturnType<typeof vi.fn>

/**
 * 构造 net.request 的 mock 实现。
 * routes: url → { status, headers?, chunks? (Buffer[]), body? (string), error? }
 * 触发顺序：response 事件 → （异步）data 事件 → end 事件，与真实 IncomingMessage 一致。
 */
function makeNetRequestMock(
  routes: Record<
    string,
    { status: number; headers?: Record<string, string | string[]>; chunks?: Buffer[]; body?: string; error?: Error }
  >,
  fallback?: NetRequestMock,
) {
  const impl: NetRequestMock = vi.fn((url: string) => {
    const route = routes[url]
    if (!route) {
      if (fallback) return fallback(url)
      throw new Error(`net.request: unexpected URL ${url}`)
    }
    const handlers: Record<string, (arg?: unknown) => void> = {}
    const request = {
      on(event: string, cb: (arg?: unknown) => void) {
        handlers[event] = cb
      },
      end() {},
      abort() {},
    }
    if (route.error) {
      setTimeout(() => handlers['error']?.(route.error), 0)
    } else {
      setTimeout(() => {
        let dataCb: ((c: Buffer) => void) | null = null
        let endCb: (() => void) | null = null
        const response: FakeResponse = {
          statusCode: route.status,
          headers: route.headers || {},
          on(ev, cb) {
            if (ev === 'data') dataCb = cb as (c: Buffer) => void
            if (ev === 'end') endCb = cb as () => void
          },
          destroy() {},
        }
        handlers['response']?.(response)
        setTimeout(() => {
          const chunks = route.chunks || (route.body ? [Buffer.from(route.body)] : [])
          for (const c of chunks) dataCb?.(c)
          endCb?.()
        }, 0)
      }, 0)
    }
    return request
  })
  return impl
}

const YML_URL = 'https://github.com/bangbang8000-cell/MagicCommander/releases/latest/download/latest.yml'

function makeWindow() {
  const sends: Array<Record<string, unknown>> = []
  const win = {
    webContents: {
      send: (channel: string, data: Record<string, unknown>) => {
        sends.push({ channel, ...data })
      },
    },
    isDestroyed: () => false,
  }
  return { win: win as unknown as Electron.BrowserWindow, sends }
}

let tmpDir: string
let downloadsDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-update-'))
  downloadsDir = path.join(tmpDir, 'downloads')
  fs.mkdirSync(downloadsDir, { recursive: true })
  ;(app as unknown as { getPath: (n: string) => string }).getPath = (name: string) =>
    name === 'downloads' ? downloadsDir : `/mock/${name}`
  ;(app as unknown as { getVersion: () => string }).getVersion = () => '4.6.0'
  vi.mocked(autoUpdater.on).mockClear()
  // 默认主路径网络失败，走 fallback 兜底（个别测试可覆盖为成功路径）
  vi.mocked(autoUpdater.checkForUpdates).mockReset()
  vi.mocked(autoUpdater.checkForUpdates).mockRejectedValue(new Error('network down'))
  vi.mocked(autoUpdater.downloadUpdate).mockReset()
  vi.mocked(autoUpdater.quitAndInstall).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('checkForUpdates：主路径失败 → fallback 直连 latest.yml', () => {
  it('latest.yml 版本更高时发送 available 并缓存下载信息', async () => {
    const requestMock = makeNetRequestMock({
      [YML_URL]: { status: 200, body: 'version: 4.7.0\npath: MagicCommander-Setup-4.7.0.exe\n' },
    })
    vi.spyOn(net, 'request').mockImplementation(requestMock)
    ;(app as unknown as { getVersion: () => string }).getVersion = () => '4.6.0'
    vi.mocked(autoUpdater.checkForUpdates).mockRejectedValue(new Error('network down'))

    const { win, sends } = makeWindow()
    const service = new UpdateService()
    service.setWindow(win)

    await service.checkForUpdates()

    expect(requestMock).toHaveBeenCalledWith(YML_URL)
    const available = sends.find((s) => s.status === 'available')
    expect(available?.version).toBe('4.7.0')
    expect(available?.channel).toBe('fallback')
  })

  it('latest.yml 版本与当前相同 → 发送 not-available（不误报）', async () => {
    const requestMock = makeNetRequestMock({
      [YML_URL]: { status: 200, body: 'version: 4.6.0\npath: MagicCommander-Setup-4.6.0.exe\n' },
    })
    vi.spyOn(net, 'request').mockImplementation(requestMock)
    vi.mocked(autoUpdater.checkForUpdates).mockRejectedValue(new Error('network down'))

    const { win, sends } = makeWindow()
    const service = new UpdateService()
    service.setWindow(win)

    await service.checkForUpdates()

    const available = sends.find((s) => s.status === 'available')
    expect(available).toBeUndefined()
    expect(sends.some((s) => s.status === 'not-available')).toBe(true)
  })

  it('latest.yml 解析失败 → 发送 error 状态（不抛异常）', async () => {
    const requestMock = makeNetRequestMock({ [YML_URL]: { status: 200, body: 'not-a-yml' } })
    vi.spyOn(net, 'request').mockImplementation(requestMock)
    vi.mocked(autoUpdater.checkForUpdates).mockRejectedValue(new Error('network down'))

    const { win, sends } = makeWindow()
    const service = new UpdateService()
    service.setWindow(win)

    await service.checkForUpdates()

    const error = sends.find((s) => s.status === 'error')
    expect(error?.error).toContain('parse')
  })
})

describe('downloadUpdate：fallback 模式直接下载安装包', () => {
  it('走 fallback 检测后，downloadUpdate 下载到 downloads 目录（含重定向）', async () => {
    const ymlMock = makeNetRequestMock({
      [YML_URL]: { status: 200, body: 'version: 4.7.0\npath: MagicCommander-Setup-4.7.0.exe\n' },
    })
    const content = Buffer.from('fake-installer-bytes')
    const downloadMock = makeNetRequestMock({
      'https://github.com/bangbang8000-cell/MagicCommander/releases/latest/download/MagicCommander-Setup-4.7.0.exe': {
        status: 302,
        headers: { location: 'https://objects.githubusercontent.com/real.exe' },
      },
      'https://objects.githubusercontent.com/real.exe': {
        status: 200,
        headers: { 'content-length': String(content.length) },
        chunks: [content],
      },
    })
    const netMock = vi.fn((url: string) => {
      return url.includes('latest.yml') ? ymlMock(url) : downloadMock(url)
    })
    vi.spyOn(net, 'request').mockImplementation(netMock)

    const { win, sends } = makeWindow()
    const service = new UpdateService()
    service.setWindow(win)

    await service.checkForUpdates()
    await service.downloadUpdate()

    const localPath = path.join(downloadsDir, 'MagicCommander-Setup-4.7.0.exe')
    expect(fs.existsSync(localPath)).toBe(true)
    expect(fs.readFileSync(localPath).equals(content)).toBe(true)
    const downloaded = sends.find((s) => s.status === 'downloaded')
    expect(downloaded).toBeTruthy()
  })

  it('Content-Length 与实收字节不一致 → 判截断失败并清理残缺文件', async () => {
    const ymlMock = makeNetRequestMock({
      [YML_URL]: { status: 200, body: 'version: 4.7.0\npath: MagicCommander-Setup-4.7.0.exe\n' },
    })
    const downloadMock = makeNetRequestMock({
      'https://github.com/bangbang8000-cell/MagicCommander/releases/latest/download/MagicCommander-Setup-4.7.0.exe': {
        status: 200,
        headers: { 'content-length': '1000' },
        chunks: [Buffer.from('only-a-few-bytes')],
      },
    })
    const netMock = vi.fn((url: string) => {
      const target = url.includes('latest.yml') ? ymlMock : downloadMock
      return target(url)
    })
    vi.spyOn(net, 'request').mockImplementation(netMock)

    const { win } = makeWindow()
    const service = new UpdateService()
    service.setWindow(win)

    await service.checkForUpdates()
    await expect(service.downloadUpdate()).rejects.toThrow(/incomplete|1000/)

    const localPath = path.join(downloadsDir, 'MagicCommander-Setup-4.7.0.exe')
    expect(fs.existsSync(localPath)).toBe(false)
  })
})

describe('quitAndInstall 兜底（fs.existsSync 校验后 openPath + 延迟退出）', () => {
  it('安装包存在 → shell.openPath + app.quit', async () => {
    const requestMock = makeNetRequestMock({
      [YML_URL]: { status: 200, body: 'version: 4.7.0\npath: MagicCommander-Setup-4.7.0.exe\n' },
    })
    vi.spyOn(net, 'request').mockImplementation(requestMock)

    const { win } = makeWindow()
    const service = new UpdateService()
    service.setWindow(win)
    await service.checkForUpdates()

    const installer = path.join(downloadsDir, 'MagicCommander-Setup-4.7.0.exe')
    fs.writeFileSync(installer, 'bytes')

    const openPath = vi.spyOn(shell, 'openPath').mockResolvedValue('')
    const quit = vi.spyOn(app, 'quit').mockImplementation(() => {})

    service.quitAndInstall()
    await new Promise((r) => setTimeout(r, 600))
    expect(openPath).toHaveBeenCalledWith(installer)
    expect(quit).toHaveBeenCalled()
  })

  it('安装包缺失 → 不打开不退出', async () => {
    const requestMock = makeNetRequestMock({
      [YML_URL]: { status: 200, body: 'version: 4.7.0\npath: MagicCommander-Setup-4.7.0.exe\n' },
    })
    vi.spyOn(net, 'request').mockImplementation(requestMock)

    const { win } = makeWindow()
    const service = new UpdateService()
    service.setWindow(win)
    await service.checkForUpdates()

    const openPath = vi.spyOn(shell, 'openPath').mockResolvedValue('')
    const quit = vi.spyOn(app, 'quit').mockImplementation(() => {})

    service.quitAndInstall()
    await new Promise((r) => setTimeout(r, 600))
    expect(openPath).not.toHaveBeenCalled()
    expect(quit).not.toHaveBeenCalled()
  })
})

describe('openReleasesPage', () => {
  it('打开 GitHub Releases 页面', async () => {
    const openExternal = vi.spyOn(shell, 'openExternal').mockResolvedValue(undefined)
    const service = new UpdateService()
    service.openReleasesPage()
    await new Promise((r) => setTimeout(r, 50))
    expect(openExternal).toHaveBeenCalledWith('https://github.com/bangbang8000-cell/MagicCommander/releases/latest')
  })
})
