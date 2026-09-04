/**
 * 5.0.4（504-a / 504-c）：云端协作与生态 HTTP 客户端（主进程）。
 *
 * 复用 MC 既有 token 安全存储（platform-token.enc / platform-token.json）：
 *  - 分享：cloud:shareCreate / cloud:shareList / cloud:shareRevoke
 *  - 设备库云同步：deviceLibrary:sync（GET /device-library）/ deviceLibrary:publish（POST /device-library）
 * 统一请求：{code,data} 解包 + 错误 detail 提取。
 */
import * as fs from 'fs'
import * as path from 'path'
import { safeStorage } from 'electron'
import { getUserDataDir } from '../config'

const API_PREFIX = '/api/v1'
const REQUEST_TIMEOUT_MS = 20_000

export interface ShareItem {
  token: string
  project_name: string
  description: string
  expires_at: string
  created_at: string
  url: string
}

export interface ShareCreateInput {
  project_name: string
  description?: string
  snapshot: unknown
  expire_days?: number
}

export interface ShareCreateResult {
  token: string
  project_name: string
  url: string
  expires_at: string
}

export interface DeviceLibraryBundle {
  schema: string
  version?: number
  kind?: string
  count?: number
  devices: Array<Record<string, unknown>>
}

export interface DeviceLibraryPublishResult {
  status?: string
  format?: string
  schema?: string
  total: number
  added: string[]
  updated: string[]
  skipped: string[]
}

/** 读取 safeStorage 中加密的平台 Token（回退 dev 明文 json）；无 → null。 */
export function loadStoredToken(): string | null {
  const encFile = path.join(getUserDataDir(), 'platform-token.enc')
  const jsonFile = path.join(getUserDataDir(), 'platform-token.json')
  try {
    if (
      fs.existsSync(encFile) &&
      safeStorage &&
      typeof safeStorage.isEncryptionAvailable === 'function' &&
      safeStorage.isEncryptionAvailable()
    ) {
      return safeStorage.decryptString(fs.readFileSync(encFile))
    }
  } catch {
    /* 忽略损坏 token */
  }
  try {
    if (fs.existsSync(jsonFile)) {
      const content = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'))
      if (typeof content.token === 'string') return content.token
    }
  } catch {
    /* 忽略损坏 token */
  }
  return null
}

async function request<T>(
  baseUrl: string,
  token: string | null,
  method: string,
  apiPath: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, '')}${API_PREFIX}${apiPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    let detail = res.statusText
    try {
      const err = (await res.json()) as Record<string, unknown>
      detail = String(err.detail ?? err.message ?? detail)
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new Error(detail || `请求失败: ${res.status}`)
  }

  const json = (await res.json()) as unknown
  // 解包服务端 success() 包装 {code, data, message}
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>
    if (typeof obj.code === 'number' && 'data' in obj) {
      if (obj.code !== 0) throw new Error(String(obj.message ?? `API 错误 ${obj.code}`))
      return obj.data as T
    }
  }
  return json as T
}

// ===== 分享链接（504-a） =====

export async function shareCreate(
  baseUrl: string,
  token: string | null,
  data: ShareCreateInput,
): Promise<ShareCreateResult> {
  return request<ShareCreateResult>(baseUrl, token, 'POST', '/shares', data)
}

export async function shareList(baseUrl: string, token: string | null): Promise<{ shares: ShareItem[] }> {
  return request<{ shares: ShareItem[] }>(baseUrl, token, 'GET', '/shares')
}

export async function shareRevoke(
  baseUrl: string,
  token: string | null,
  shareToken: string,
): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(baseUrl, token, 'DELETE', `/shares/${encodeURIComponent(shareToken)}`)
}

// ===== 设备库云同步（504-c） =====

export async function fetchDeviceLibrary(baseUrl: string, token: string | null): Promise<DeviceLibraryBundle> {
  return request<DeviceLibraryBundle>(baseUrl, token, 'GET', '/device-library')
}

export async function publishDeviceLibrary(
  baseUrl: string,
  token: string | null,
  devices: Array<Record<string, unknown>>,
): Promise<DeviceLibraryPublishResult> {
  return request<DeviceLibraryPublishResult>(baseUrl, token, 'POST', '/device-library', devices)
}
