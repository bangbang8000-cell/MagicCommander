const DEFAULT_BASE_URL = 'http://localhost:18720'

let _baseUrl = DEFAULT_BASE_URL
let _token: string | null = null

export function setBaseUrl(url: string) {
  _baseUrl = url.replace(/\/+$/, '')
}

export function getBaseUrl(): string {
  return _baseUrl
}

export function setToken(token: string | null) {
  _token = token
}

export function getToken(): string | null {
  return _token
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`
  }
  const res = await fetch(`${_baseUrl}${path}`, { ...options, headers })

  // Auto-refresh token on 401
  if (res.status === 401 && _token && !path.includes('/auth/')) {
    try {
      const refreshRes = await fetch(`${_baseUrl}/api/v1/auth/token/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_token}` },
      })
      if (refreshRes.ok) {
        const refreshJson = await refreshRes.json()
        const newToken = refreshJson.data?.token || refreshJson.token
        if (newToken) {
          setToken(newToken)
          headers['Authorization'] = `Bearer ${newToken}`
          const retryRes = await fetch(`${_baseUrl}${path}`, { ...options, headers })
          if (!retryRes.ok) {
            const err = await retryRes.json().catch(() => ({ detail: retryRes.statusText }))
            throw new Error(err.detail || `API error ${retryRes.status}`)
          }
          const json = await retryRes.json()
          if (json && typeof json.code === 'number' && 'data' in json) {
            if (json.code !== 0) throw new Error(json.message || `API error ${json.code}`)
            return json.data as T
          }
          return json as T
        }
      }
    } catch {
      // Refresh failed, continue to throw original error
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || err.message || `API error ${res.status}`)
  }
  const json = await res.json()
  // Unwrap server's success() wrapper: {code, data, message}
  if (json && typeof json.code === 'number' && 'data' in json) {
    if (json.code !== 0) {
      throw new Error(json.message || `API error ${json.code}`)
    }
    return json.data as T
  }
  return json as T
}

// --- Auth ---
export interface QRCodeResponse {
  session_id: string
  auth_url: string
  expires_in: number
}

export interface ScanStatus {
  status: 'pending' | 'confirmed' | 'expired'
  token: string | null
  user: { id: number; username: string } | null
}

export type LoginPlatform = 'feishu' | 'qq' | 'wechat'

export interface AuthHealth {
  feishu: { configured: boolean }
  qq: { configured: boolean }
  wechat: { configured: boolean }
}

export const auth = {
  getQRCode: (platform: LoginPlatform = 'feishu') =>
    request<QRCodeResponse>('/api/v1/auth/qrcode', {
      method: 'POST',
      body: JSON.stringify({ platform }),
    }),

  pollStatus: (sessionId: string) =>
    request<ScanStatus>(`/api/v1/auth/scan/status/${sessionId}`),

  refresh: () =>
    request<{ token: string }>('/api/v1/auth/token/refresh', { method: 'POST' }),

  health: () =>
    request<AuthHealth>('/api/v1/auth/health'),
}

// --- Templates ---
export interface RemoteTemplate {
  id?: number
  name: string
  owner: string
  full_name?: string
  description: string
  category?: string
  public: boolean
  html_url: string
  clone_url: string
  updated_at: string
  topics?: string[]
  files?: { path: string; size: number }[]
}

export interface RemoteProject {
  id: number
  name: string
  owner: string
  full_name: string
  description: string
  private: boolean
  html_url: string
  clone_url: string
  ssh_url: string
  updated_at: string
  created_at: string
  topics: string[]
}

export interface SyncStatusResponse {
  synced: boolean
  local_sha: string | null
  remote_sha: string | null
  status: 'synced' | 'local_ahead' | 'remote_ahead' | 'conflict' | 'local_only' | 'remote_only'
}

export const projects = {
  list: () =>
    request<{ projects: RemoteProject[] }>('/api/v1/projects'),

  search: (q: string) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    const qs = params.toString()
    return request<{ projects: RemoteProject[] }>(`/api/v1/projects${qs ? '?' + qs : ''}`)
  },

  searchPublic: (q: string = '', page: number = 1, limit: number = 20) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    params.set('page', String(page))
    params.set('limit', String(limit))
    return request<{ projects: RemoteProject[]; total: number; page: number; limit: number }>(
      `/api/v1/projects/public?${params.toString()}`,
    )
  },

  create: (data: { name: string; description: string; private: boolean; template_owner?: string; template_repo?: string }) =>
    request<RemoteProject>('/api/v1/projects', { method: 'POST', body: JSON.stringify(data) }),

  delete: (owner: string, repo: string) =>
    request<void>(`/api/v1/projects/${owner}/${repo}`, { method: 'DELETE' }),

  syncCheck: (checks: { name: string; local_sha?: string }[]) =>
    request<{ results: Record<string, SyncStatusResponse> }>('/api/v1/client/sync/check', {
      method: 'POST',
      body: JSON.stringify({ projects: checks }),
    }),
}

export interface VersionInfo {
  latest_version: string
  latest_build: string
  download_url: string
  release_notes: string
  min_required_version: string
}

export interface Announcement {
  id: number
  title: string
  content: string
  level: 'info' | 'warning' | 'important'
  created_at: string
}

export const client = {
  dashboard: () =>
    request<{ template_count: number; project_count: number; recent_templates: RemoteTemplate[]; recent_projects: RemoteProject[] }>('/api/v1/client/dashboard'),

  version: () =>
    request<VersionInfo>('/api/v1/client/version'),

  notifications: () =>
    request<{ announcements: Announcement[] }>('/api/v1/client/notifications'),

  publicStats: () =>
    request<{ total_users: number; total_templates: number; total_projects: number }>('/api/v1/public/stats'),
}

export const templates = {
  list: (q?: string, category?: string) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (category) params.set('category', category)
    const qs = params.toString()
    return request<{ templates: RemoteTemplate[]; total: number }>(`/api/v1/templates${qs ? '?' + qs : ''}`)
  },

  detail: (owner: string, repo: string) =>
    request<RemoteTemplate>(`/api/v1/templates/${owner}/${repo}`),

  downloadUrl: (owner: string, repo: string) =>
    `${_baseUrl}/api/v1/templates/${owner}/${repo}/download`,

  fileContent: (owner: string, repo: string, filePath: string) =>
    request<{ content: string }>(`/api/v1/templates/${owner}/${repo}/file/${encodeURIComponent(filePath)}`),

  mine: () =>
    request<{ templates: RemoteTemplate[] }>('/api/v1/templates/mine'),

  publish: (data: { name: string; description: string; category: string; public: boolean; files: { path: string; content: string }[] }) =>
    request<{ owner: string; repo: string }>('/api/v1/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// --- Health ---
export const health = {
  check: () => request<{ status: string; service: string }>('/api/v1/health'),
}

// --- User ---
export interface UserProfile {
  user_id: number
  username: string
  full_name: string
  email: string
  avatar_url: string
  bio: string
  location: string
  website: string
  created_at: string
  bindings: SocialBinding[]
}

export interface SocialBinding {
  platform: string
  open_id: string
  nickname: string
  avatar_url: string
  created_at: string
}

export const user = {
  profile: () =>
    request<UserProfile>('/api/v1/user/profile'),

  updateProfile: (data: { full_name?: string; bio?: string }) =>
    request<UserProfile>('/api/v1/user/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
}
