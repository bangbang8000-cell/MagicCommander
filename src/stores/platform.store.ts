import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { auth, setToken, setBaseUrl, getBaseUrl, type RemoteTemplate } from '@/api/platform'

interface PlatformState {
  // Config
  baseUrl: string
  // Auth
  token: string | null
  loggedIn: boolean
  username: string | null
  userId: number | null
  // Login flow
  qrSessionId: string | null
  qrAuthUrl: string | null
  // Remote templates
  remoteTemplates: RemoteTemplate[]
  remoteLoading: boolean
  remoteError: string | null

  // Actions
  setBaseUrl: (url: string) => void
  startLogin: () => Promise<{ authUrl: string; sessionId: string }>
  pollLogin: () => Promise<'pending' | 'confirmed' | 'expired'>
  logout: () => void
  fetchRemoteTemplates: (query?: string, category?: string) => Promise<void>
}

export const usePlatformStore = create<PlatformState>()(
  persist(
    (set, get) => ({
      baseUrl: 'http://localhost:18720',
      token: null,
      loggedIn: false,
      username: null,
      userId: null,
      qrSessionId: null,
      qrAuthUrl: null,
      remoteTemplates: [],
      remoteLoading: false,
      remoteError: null,

      setBaseUrl: (url: string) => {
        setBaseUrl(url)
        set({ baseUrl: url })
      },

      startLogin: async () => {
        const res = await auth.getQRCode()
        set({ qrSessionId: res.session_id, qrAuthUrl: res.auth_url })
        return { authUrl: res.auth_url, sessionId: res.session_id }
      },

      pollLogin: async () => {
        const { qrSessionId } = get()
        if (!qrSessionId) return 'expired'
        const status = await auth.pollStatus(qrSessionId)
        if (status.status === 'confirmed' && status.token && status.user) {
          setToken(status.token)
          set({
            token: status.token,
            loggedIn: true,
            username: status.user.username,
            userId: status.user.id,
            qrSessionId: null,
            qrAuthUrl: null,
          })
          return 'confirmed'
        }
        if (status.status === 'expired') {
          set({ qrSessionId: null, qrAuthUrl: null })
          return 'expired'
        }
        return 'pending'
      },

      logout: () => {
        setToken(null)
        set({ token: null, loggedIn: false, username: null, userId: null })
      },

      fetchRemoteTemplates: async (query?: string, category?: string) => {
        set({ remoteLoading: true, remoteError: null })
        try {
          const { templates: api } = await import('@/api/platform')
          const res = await api.list(query, category)
          set({ remoteTemplates: res.templates, remoteLoading: false })
        } catch (err) {
          set({ remoteError: (err as Error).message, remoteLoading: false })
        }
      },
    }),
    {
      name: 'mc-platform-storage',
      partialize: (state) => ({
        baseUrl: state.baseUrl,
        token: state.token,
        loggedIn: state.loggedIn,
        username: state.username,
        userId: state.userId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          setBaseUrl(state.baseUrl || 'http://localhost:18720')
          if (state.token) setToken(state.token)
        }
      },
    }
  )
)
