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
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `API error ${res.status}`)
  }
  return res.json()
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

export const auth = {
  getQRCode: () =>
    request<QRCodeResponse>('/api/auth/feishu/qrcode', { method: 'POST' }),

  pollStatus: (sessionId: string) =>
    request<ScanStatus>(`/api/auth/scan/status/${sessionId}`),

  refresh: () =>
    request<{ token: string }>('/api/auth/token/refresh', { method: 'POST' }),

  health: () =>
    request<{ auth: string; provider: string; configured: boolean }>('/api/auth/health'),
}

// --- Templates ---
export interface RemoteTemplate {
  id?: number
  name: string
  owner: string
  description: string
  category?: string
  public: boolean
  html_url: string
  clone_url: string
  updated_at: string
  files?: { path: string; size: number }[]
}

export const templates = {
  list: (q?: string, category?: string) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (category) params.set('category', category)
    const qs = params.toString()
    return request<{ templates: RemoteTemplate[]; total: number }>(`/api/templates${qs ? '?' + qs : ''}`)
  },

  detail: (owner: string, repo: string) =>
    request<RemoteTemplate>(`/api/templates/${owner}/${repo}`),

  downloadUrl: (owner: string, repo: string) =>
    `${_baseUrl}/api/templates/${owner}/${repo}/download`,

  mine: () =>
    request<{ templates: RemoteTemplate[] }>('/api/templates/mine'),
}

// --- Health ---
export const health = {
  check: () => request<{ status: string; service: string }>('/api/health'),
}
