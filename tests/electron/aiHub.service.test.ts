/**
 * M2: AIHubService 单元测试
 * - 初始状态 / token 一致性（401 修复相关的鉴权稳定性）
 * - 401 重试逻辑（withRetry）通过 mock fetch 验证
 * - AI-2 扩展：withRetry 覆盖全部 /api/chat 数据方法（clearSession/getProviders/configureProvider/
 *   setDefaultProvider/testConnection/saveSkill），401 时触发 stop+ensureRunning+重试一次
 * - AI-2 扩展：AI_HUB_PORT_IN_USE 信号解析（端口占用 → lastError + 本次启动失败，不触发自动重启）
 */
// @vitest-environment node
import { EventEmitter } from 'events'
import { describe, it, expect, vi, afterEach } from 'vitest'

// mock electron（config.ts 读取 app.isPackaged / app.getAppPath）
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => '/tmp', getAppPath: () => process.cwd() },
}))

// mock child_process.spawn：PORT_IN_USE 测试需要控制子进程 stdout
const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }))
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return { ...actual, spawn: mockSpawn }
})

// Electron 环境下 process.resourcesPath 由运行时注入；测试中补一个假路径让 getPythonPath 回退系统 python
;(process as unknown as { resourcesPath: string }).resourcesPath = '/tmp/resources'

import { AIHubService } from '../../electron/services/aiHub.service'

// 私有方法访问
type PrivateHub = AIHubService & {
  authHeaders(): Record<string, string>
  ensureRunning(): Promise<void>
  withRetry<T>(fn: () => Promise<T>): Promise<T>
  status: { running: boolean; port: number }
  depsChecked: boolean
}

/** 构造一个可操控的子进程 mock（EventEmitter + stdout/stderr/kill） */
function createMockProc() {
  const proc = new EventEmitter() as unknown as {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
  }
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = vi.fn()
  return proc
}

/** mock fetch：第一次 reject 401，后续 resolve 指定值 */
function stubFetchWith401Then(okValue: unknown) {
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new Error('AI Hub 请求失败: 401 {"detail":"Unauthorized"}'))
    .mockResolvedValue(okValue)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('AIHubService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('初始状态为未运行，端口 18721', () => {
    const s = new AIHubService()
    expect(s.getStatus().running).toBe(false)
    expect(s.getStatus().port).toBe(18721)
  })

  it('authHeaders 每次返回一致的鉴权 token（防止 token 漂移导致 401）', () => {
    const s = new AIHubService() as PrivateHub
    const h1 = s.authHeaders()
    const h2 = s.authHeaders()
    expect(h1['X-MC-Auth-Token']).toBeTruthy()
    expect(h1['X-MC-Auth-Token']).toBe(h2['X-MC-Auth-Token'])
  })

  it('withRetry：401 时重启 hub 并重试一次成功', async () => {
    const s = new AIHubService() as PrivateHub
    const stopSpy = vi.spyOn(s, 'stop').mockResolvedValue(undefined)
    const ensureSpy = vi.spyOn(s, 'ensureRunning').mockResolvedValue(undefined)

    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls === 1) throw new Error('AI Hub 请求失败: 401 {"detail":"Unauthorized"}')
      return 'ok-content'
    })

    const result = await s.withRetry(fn)
    expect(result).toBe('ok-content')
    expect(calls).toBe(2)
    expect(stopSpy).toHaveBeenCalledTimes(1)
    expect(ensureSpy).toHaveBeenCalledTimes(1)
  })

  it('withRetry：非 401 错误不重试，原样抛出', async () => {
    const s = new AIHubService() as PrivateHub
    const stopSpy = vi.spyOn(s, 'stop').mockResolvedValue(undefined)
    const fn = vi.fn(async () => { throw new Error('模型响应超时') })

    await expect(s.withRetry(fn)).rejects.toThrow('模型响应超时')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(stopSpy).not.toHaveBeenCalled()
  })

  it('sendChatMessage 前 ensureRunning（hub 未运行先启动，不再裸 fetch 401）', async () => {
    const s = new AIHubService() as PrivateHub
    const ensureSpy = vi.spyOn(s, 'ensureRunning').mockResolvedValue(undefined)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: true, value: undefined }),
        }),
      },
    })
    vi.stubGlobal('fetch', fetchMock)

    const content = await s.sendChatMessage('s1', 'hi')
    expect(ensureSpy).toHaveBeenCalled()
    expect(content).toBe('')
  })

  describe('AI-2 withRetry 覆盖全部 /api/chat 数据方法（401 → stop+ensureRunning+重试一次）', () => {
    it('clearSession：401 时重启 hub 并重试一次', async () => {
      const s = new AIHubService() as PrivateHub
      const stopSpy = vi.spyOn(s, 'stop').mockResolvedValue(undefined)
      const ensureSpy = vi.spyOn(s, 'ensureRunning').mockResolvedValue(undefined)
      const fetchMock = stubFetchWith401Then({ ok: true })

      await s.clearSession('s1')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(stopSpy).toHaveBeenCalledTimes(1)
      // 方法开头 1 次 + withRetry 重启后 1 次
      expect(ensureSpy).toHaveBeenCalledTimes(2)
    })

    it('getProviders：401 时重启 hub 并重试一次', async () => {
      const s = new AIHubService() as PrivateHub
      const stopSpy = vi.spyOn(s, 'stop').mockResolvedValue(undefined)
      const ensureSpy = vi.spyOn(s, 'ensureRunning').mockResolvedValue(undefined)
      const fetchMock = stubFetchWith401Then({ ok: true, json: async () => ({ providers: [] }) })

      const providers = await s.getProviders()
      expect(providers).toEqual([])
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(stopSpy).toHaveBeenCalledTimes(1)
      expect(ensureSpy).toHaveBeenCalledTimes(2)
    })

    it('configureProvider：401 时重启 hub 并重试一次', async () => {
      const s = new AIHubService() as PrivateHub
      const stopSpy = vi.spyOn(s, 'stop').mockResolvedValue(undefined)
      const ensureSpy = vi.spyOn(s, 'ensureRunning').mockResolvedValue(undefined)
      const fetchMock = stubFetchWith401Then({ ok: true })

      await s.configureProvider('deepseek', 'sk-xxx', 'deepseek-chat', 'https://api.deepseek.com/v1')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(stopSpy).toHaveBeenCalledTimes(1)
      expect(ensureSpy).toHaveBeenCalledTimes(2)
    })

    it('setDefaultProvider：401 时重启 hub 并重试一次', async () => {
      const s = new AIHubService() as PrivateHub
      const stopSpy = vi.spyOn(s, 'stop').mockResolvedValue(undefined)
      const ensureSpy = vi.spyOn(s, 'ensureRunning').mockResolvedValue(undefined)
      const fetchMock = stubFetchWith401Then({ ok: true })

      await s.setDefaultProvider('deepseek')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(stopSpy).toHaveBeenCalledTimes(1)
      expect(ensureSpy).toHaveBeenCalledTimes(2)
    })

    it('testConnection：401 时重启 hub 并重试一次', async () => {
      const s = new AIHubService() as PrivateHub
      const stopSpy = vi.spyOn(s, 'stop').mockResolvedValue(undefined)
      const ensureSpy = vi.spyOn(s, 'ensureRunning').mockResolvedValue(undefined)
      const fetchMock = stubFetchWith401Then({ ok: true, json: async () => ({ status: 'ok', message: '连接成功' }) })

      const r = await s.testConnection('deepseek', 'sk', 'https://api.deepseek.com/v1', 'deepseek-chat')
      expect(r.status).toBe('ok')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(stopSpy).toHaveBeenCalledTimes(1)
      expect(ensureSpy).toHaveBeenCalledTimes(2)
    })

    it('saveSkill：401 时重启 hub 并重试一次', async () => {
      const s = new AIHubService() as PrivateHub
      const stopSpy = vi.spyOn(s, 'stop').mockResolvedValue(undefined)
      const ensureSpy = vi.spyOn(s, 'ensureRunning').mockResolvedValue(undefined)
      const fetchMock = stubFetchWith401Then({ ok: true, json: async () => ({ status: 'ok', name: 'skill1' }) })

      const r = await s.saveSkill('skill1', 'content')
      expect(r.name).toBe('skill1')
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(stopSpy).toHaveBeenCalledTimes(1)
      expect(ensureSpy).toHaveBeenCalledTimes(2)
    })

    it('syncProviders 内部经由 configureProvider/setDefaultProvider 复用 withRetry（不再额外嵌套）', async () => {
      const s = new AIHubService() as PrivateHub
      const stopSpy = vi.spyOn(s, 'stop').mockResolvedValue(undefined)
      const ensureSpy = vi.spyOn(s, 'ensureRunning').mockResolvedValue(undefined)
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      vi.stubGlobal('fetch', fetchMock)

      await s.syncProviders(
        [{ provider: 'deepseek', apiKey: 'sk-1', model: 'm1', baseUrl: 'http://x' }],
        'deepseek',
      )
      expect(fetchMock).toHaveBeenCalledTimes(2) // configureProvider + setDefaultProvider
      expect(stopSpy).not.toHaveBeenCalled()
      expect(ensureSpy).toHaveBeenCalled()
    })
  })

  describe('AI-2 PORT_IN_USE 信号解析（端口占用 → lastError + 启动失败，不无限重启）', () => {
    it('stdout 出现 AI_HUB_PORT_IN_USE：置 lastError 并 reject 本次启动，进程退出不触发自动重启', async () => {
      const s = new AIHubService() as PrivateHub
      s.depsChecked = true
      mockSpawn.mockReset()
      const proc = createMockProc()
      mockSpawn.mockReturnValue(proc)

      const startPromise = s.start()
      proc.stdout.emit('data', Buffer.from('AI_HUB_PORT_IN_USE port=18721 err=[WinError 10048]'))

      await expect(startPromise).rejects.toThrow('端口 18721 被占用')
      expect(s.getStatus().running).toBe(false)
      expect(s.getStatus().lastError).toContain('被占用')
      expect(mockSpawn).toHaveBeenCalledTimes(1)

      // 子进程随后退出（exit code 2）：started=false → 不应调度自动重启
      proc.emit('exit', 2, null)
      expect((s as unknown as { restartAttempts: number }).restartAttempts).toBe(0)
      expect(s.getStatus().running).toBe(false)
    })

    it('正常 AI_HUB_READY 信号不受 PORT_IN_USE 解析影响，仍能成功启动', async () => {
      const s = new AIHubService() as PrivateHub
      s.depsChecked = true
      mockSpawn.mockReset()
      const proc = createMockProc()
      mockSpawn.mockReturnValue(proc)

      const startPromise = s.start()
      proc.stdout.emit('data', Buffer.from('AI_HUB_READY port=18721'))

      await expect(startPromise).resolves.toBeUndefined()
      expect(s.getStatus().running).toBe(true)
      // 关闭 health check 定时器避免悬挂
      ;(s as unknown as { stopHealthCheck(): void }).stopHealthCheck()
    })
  })
})
