/**
 * 5.0.4（504-a / 504-c）：云端协作与生态 HTTP 客户端测试。
 * 覆盖分享三通道（create/list/revoke）与设备库云同步（fetch/publish）的 URL/方法/载荷/解包。
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fetchDeviceLibrary, publishDeviceLibrary, shareCreate, shareList, shareRevoke } from './cloud-sync.service'

function mockFetchOnce(status: number, jsonBody: unknown) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 ? 'OK' : 'ERR',
    json: async () => jsonBody,
  } as Response
  return vi.fn().mockResolvedValue(res)
}

describe('cloud-sync.service（504-a 分享）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shareCreate POST /api/v1/shares 并解包 {code,data}', async () => {
    const fetchMock = mockFetchOnce(200, {
      code: 0,
      data: { token: 'tk1', project_name: 'p1', url: '/share/tk1', expires_at: '2026-10-01T00:00:00Z' },
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await shareCreate('http://x.com', 'jwt', {
      project_name: 'p1',
      description: 'demo',
      snapshot: { schema: 'mc.share-snapshot/1' },
    })
    expect(result.token).toBe('tk1')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://x.com/api/v1/shares')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jwt' })
    const body = JSON.parse(String(init.body))
    expect(body.project_name).toBe('p1')
    expect(body.snapshot.schema).toBe('mc.share-snapshot/1')
  })

  it('shareList GET /api/v1/shares', async () => {
    const fetchMock = mockFetchOnce(200, {
      shares: [
        { token: 'tk1', project_name: 'p1', description: '', expires_at: '', created_at: '', url: '/share/tk1' },
      ],
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await shareList('http://x.com', 'jwt')
    expect(result.shares).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://x.com/api/v1/shares')
    expect(init.method).toBe('GET')
  })

  it('shareRevoke DELETE /api/v1/shares/{token}', async () => {
    const fetchMock = mockFetchOnce(200, { code: 0, data: { deleted: true } })
    vi.stubGlobal('fetch', fetchMock)
    const result = await shareRevoke('http://x.com', 'jwt', 'tk1')
    expect(result.deleted).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://x.com/api/v1/shares/tk1')
    expect(init.method).toBe('DELETE')
  })

  it('HTTP 错误抛出 detail', async () => {
    const fetchMock = mockFetchOnce(400, { detail: 'token 不存在' })
    vi.stubGlobal('fetch', fetchMock)
    await expect(shareRevoke('http://x.com', null, 'bad')).rejects.toThrow('token 不存在')
  })
})

describe('cloud-sync.service（504-c 设备库云同步）', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchDeviceLibrary GET /api/v1/device-library 返回 mc bundle', async () => {
    const fetchMock = mockFetchOnce(200, {
      code: 0,
      data: {
        schema: 'mc.device-library/1',
        version: 1,
        kind: 'device-library',
        count: 1,
        devices: [{ id: 'h3c_s9827', vendor: 'H3C', model: 'S9827' }],
      },
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await fetchDeviceLibrary('http://x.com', 'jwt')
    expect(result.schema).toBe('mc.device-library/1')
    expect(result.devices).toHaveLength(1)
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('http://x.com/api/v1/device-library')
  })

  it('publishDeviceLibrary POST 扁平数组载荷', async () => {
    const fetchMock = mockFetchOnce(200, {
      code: 0,
      data: {
        status: 'merged',
        format: 'mc',
        schema: 'mc.device-library/1',
        total: 1,
        added: ['h3c_s9827'],
        updated: [],
        skipped: [],
      },
    })
    vi.stubGlobal('fetch', fetchMock)
    const result = await publishDeviceLibrary('http://x.com', 'jwt', [
      { id: 'h3c_s9827', vendor: 'H3C', model: 'S9827' },
    ])
    expect(result.total).toBe(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://x.com/api/v1/device-library')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual([{ id: 'h3c_s9827', vendor: 'H3C', model: 'S9827' }])
  })
})
