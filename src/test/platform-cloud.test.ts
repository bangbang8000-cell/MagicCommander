/**
 * 5.0.4（504-b / 504-c）前端 store/API 测试：
 *  - 模板市场：订阅 / 评分 API 通道 + store 状态回写
 *  - 协作分享 / 设备库云同步：store 动作 → IPC 通道
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { templates } from '@/api/platform'
import { usePlatformStore } from '@/stores/platform.store'
import type { RemoteTemplate } from '@/api/platform'

function mockFetchOnce(status: number, jsonBody: unknown) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 ? 'OK' : 'ERR',
    json: async () => jsonBody,
  } as Response
  return vi.fn().mockResolvedValue(res)
}

const demoRemote: RemoteTemplate = {
  id: 1,
  name: 'demo',
  owner: 'alice',
  description: 'demo template',
  public: true,
  html_url: '',
  clone_url: '',
  updated_at: '2026-09-01T00:00:00Z',
  rating_avg: 4.5,
  rating_count: 10,
  is_subscribed: false,
  subscribers: 5,
}

describe('504-b 模板市场 API', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('templates.subscribe POST /api/v1/templates/{owner}/{repo}/subscribe', async () => {
    const fetchMock = mockFetchOnce(200, { code: 0, data: { subscribed: true, subscribers: 12 } })
    vi.stubGlobal('fetch', fetchMock)
    const res = await templates.subscribe('alice', 'demo')
    expect(res.subscribed).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://evergreenzhou.com/api/v1/templates/alice/demo/subscribe')
    expect(init.method).toBe('POST')
  })

  it('templates.rating POST /api/v1/templates/{owner}/{repo}/rating 携带 score', async () => {
    const fetchMock = mockFetchOnce(200, { code: 0, data: { rating_avg: 4.6, rating_count: 11 } })
    vi.stubGlobal('fetch', fetchMock)
    const res = await templates.rating('alice', 'demo', 5)
    expect(res.rating_avg).toBe(4.6)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://evergreenzhou.com/api/v1/templates/alice/demo/rating')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ score: 5 })
  })

  it('store.subscribeTemplate 回写 is_subscribed/subscribers', async () => {
    const fetchMock = mockFetchOnce(200, { code: 0, data: { subscribed: true, subscribers: 12 } })
    vi.stubGlobal('fetch', fetchMock)
    usePlatformStore.setState({ remoteTemplates: [demoRemote] })
    await usePlatformStore.getState().subscribeTemplate('alice', 'demo')
    const updated = usePlatformStore.getState().remoteTemplates[0]
    expect(updated.is_subscribed).toBe(true)
    expect(updated.subscribers).toBe(12)
  })

  it('store.rateTemplate 回写 rating_avg/rating_count', async () => {
    const fetchMock = mockFetchOnce(200, { code: 0, data: { rating_avg: 4.8, rating_count: 11 } })
    vi.stubGlobal('fetch', fetchMock)
    usePlatformStore.setState({ remoteTemplates: [demoRemote] })
    await usePlatformStore.getState().rateTemplate('alice', 'demo', 5)
    const updated = usePlatformStore.getState().remoteTemplates[0]
    expect(updated.rating_avg).toBe(4.8)
    expect(updated.rating_count).toBe(11)
  })
})

describe('5.0.4 协作分享 / 设备库云同步 store → IPC', () => {
  beforeEach(() => {
    const cloudMock = {
      shareCreate: vi.fn().mockResolvedValue({
        token: 'tk1',
        project_name: 'p1',
        url: '/share/tk1',
        expires_at: '2026-10-01T00:00:00Z',
        fullUrl: 'http://x.com/share/tk1',
      }),
      shareList: vi.fn().mockResolvedValue({
        shares: [
          { token: 'tk1', project_name: 'p1', description: '', expires_at: '', created_at: '', url: '/share/tk1' },
        ],
      }),
      shareRevoke: vi.fn().mockResolvedValue({ deleted: true }),
    }
    const deviceLibraryMock = {
      sync: vi.fn().mockResolvedValue({
        ok: true,
        remoteCount: 3,
        localCount: 6,
        added: ['h3c_x'],
        updated: [],
        skipped: ['h3c_s9827'],
        lastSync: '2026-09-04T08:00:00Z',
      }),
      publish: vi.fn().mockResolvedValue({ uploaded: 6, localCount: 6, lastSync: '2026-09-04T08:00:00Z' }),
    }
    ;(window.electron as unknown as Record<string, unknown>).cloud = cloudMock
    ;(window.electron as unknown as Record<string, unknown>).deviceLibrary = deviceLibraryMock
    usePlatformStore.setState({ baseUrl: 'http://x.com' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('createShare 调用 window.electron.cloud.shareCreate 并返回完整 URL', async () => {
    const res = await usePlatformStore.getState().createShare('p1', 'desc', 30)
    const cloudApi = (window.electron as unknown as { cloud: { shareCreate: ReturnType<typeof vi.fn> } }).cloud
    expect(cloudApi.shareCreate).toHaveBeenCalledWith({
      projectName: 'p1',
      baseUrl: 'http://x.com',
      description: 'desc',
      expireDays: 30,
    })
    expect(res.fullUrl).toBe('http://x.com/share/tk1')
  })

  it('fetchMyShares / revokeShare 走 IPC', async () => {
    const shares = await usePlatformStore.getState().fetchMyShares()
    expect(shares).toHaveLength(1)
    await usePlatformStore.getState().revokeShare('tk1')
    const cloudApi = (window.electron as unknown as { cloud: { shareRevoke: ReturnType<typeof vi.fn> } }).cloud
    expect(cloudApi.shareRevoke).toHaveBeenCalledWith('http://x.com', 'tk1')
  })

  it('syncDeviceLibrary / publishDeviceLibrary 走 IPC', async () => {
    const syncRes = await usePlatformStore.getState().syncDeviceLibrary()
    expect(syncRes.localCount).toBe(6)
    expect(syncRes.remoteCount).toBe(3)
    const publishRes = await usePlatformStore.getState().publishDeviceLibrary()
    expect(publishRes.uploaded).toBe(6)
  })
})
