import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { auth, setToken, setBaseUrl, getBaseUrl, projects, client, user, type RemoteTemplate, type RemoteProject, type SyncStatusResponse, type LoginPlatform, type UserProfile } from '@/api/platform'

interface PlatformState {
  // Config
  baseUrl: string
  // Auth
  token: string | null
  loggedIn: boolean
  username: string | null
  userId: number | null
  // User profile
  userProfile: UserProfile | null
  // Login flow
  qrSessionId: string | null
  qrAuthUrl: string | null
  loginPlatform: LoginPlatform | null
  // Remote templates
  remoteTemplates: RemoteTemplate[]
  remoteLoading: boolean
  remoteError: string | null
  // Remote projects
  remoteProjects: RemoteProject[]
  remoteProjectsLoading: boolean
  // Public projects
  publicProjects: RemoteProject[]
  publicProjectsLoading: boolean
  publicProjectsTotal: number
  // Sync status
  syncStatuses: Record<string, SyncStatusResponse>

  // Actions
  setBaseUrl: (url: string) => void
  startLogin: (platform: LoginPlatform) => Promise<{ authUrl: string; sessionId: string }>
  pollLogin: () => Promise<'pending' | 'confirmed' | 'expired'>
  cancelLogin: () => void
  logout: () => void
  fetchUserProfile: () => Promise<void>
  updateUserProfile: (data: { full_name?: string; bio?: string }) => Promise<void>
  fetchRemoteTemplates: (query?: string, category?: string) => Promise<void>
  downloadTemplate: (owner: string, repo: string) => Promise<void>
  publishTemplate: (data: { name: string; description: string; category: string; public: boolean; files: { path: string; content: string }[] }) => Promise<{ owner: string; repo: string }>
  // Project sync
  fetchRemoteProjects: () => Promise<void>
  searchPublicProjects: (q: string, page?: number) => Promise<void>
  pushProject: (name: string, description: string, isPrivate: boolean) => Promise<RemoteProject>
  pullProject: (owner: string, repo: string, projectName: string) => Promise<void>
  checkSyncStatus: (projects: { name: string; localSha?: string }[]) => Promise<void>
  deleteRemoteProject: (owner: string, repo: string) => Promise<void>
}

export const usePlatformStore = create<PlatformState>()(
  persist(
    (set, get) => ({
      baseUrl: 'http://localhost:18720',
      token: null,
      loggedIn: false,
      username: null,
      userId: null,
      userProfile: null,
      qrSessionId: null,
      qrAuthUrl: null,
      loginPlatform: null,
      remoteTemplates: [],
      remoteLoading: false,
      remoteError: null,
      remoteProjects: [],
      remoteProjectsLoading: false,
      publicProjects: [],
      publicProjectsLoading: false,
      publicProjectsTotal: 0,
      syncStatuses: {},

      setBaseUrl: (url: string) => {
        setBaseUrl(url)
        set({ baseUrl: url })
      },

      startLogin: async (platform: LoginPlatform) => {
        const res = await auth.getQRCode(platform)
        set({ qrSessionId: res.session_id, qrAuthUrl: res.auth_url, loginPlatform: platform })
        return { authUrl: res.auth_url, sessionId: res.session_id }
      },

      pollLogin: async () => {
        const { qrSessionId } = get()
        if (!qrSessionId) return 'expired'
        const status = await auth.pollStatus(qrSessionId)
        if (status.status === 'confirmed' && status.token && status.user) {
          setToken(status.token)
          // 使用 safeStorage 加密保存 Token
          try {
            await window.electron.platform.saveToken(status.token)
          } catch { /* ignore if not available */ }
          set({
            token: status.token,
            loggedIn: true,
            username: status.user.username,
            userId: status.user.id,
            qrSessionId: null,
            qrAuthUrl: null,
            loginPlatform: null,
          })
          return 'confirmed'
        }
        if (status.status === 'expired') {
          set({ qrSessionId: null, qrAuthUrl: null, loginPlatform: null })
          return 'expired'
        }
        return 'pending'
      },

      cancelLogin: () => {
        set({ qrSessionId: null, qrAuthUrl: null, loginPlatform: null })
      },

      logout: () => {
        setToken(null)
        // 清除 safeStorage 中的 Token
        try {
          window.electron.platform.clearToken()
        } catch { /* ignore */ }
        set({ token: null, loggedIn: false, username: null, userId: null, userProfile: null })
      },

      fetchUserProfile: async () => {
        try {
          const profile = await user.profile()
          set({ userProfile: profile })
        } catch {
          // Silently fail - profile is non-critical
        }
      },

      updateUserProfile: async (data: { full_name?: string; bio?: string }) => {
        const profile = await user.updateProfile(data)
        set({ userProfile: profile })
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

      downloadTemplate: async (owner: string, repo: string) => {
        const token = get().token
        const { templates: api, getToken: getApiToken } = await import('@/api/platform')
        const url = api.downloadUrl(owner, repo)
        const authToken = token || getApiToken()

        const res = await fetch(url, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        })

        if (!res.ok) {
          throw new Error(`下载失败: ${res.status} ${res.statusText}`)
        }

        // 下载为 ArrayBuffer，通过 IPC 保存到本地 template 目录
        const buffer = await res.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))

        // 通过 IPC 保存 zip 并解压到 template 目录
        await window.electron.project.installRemoteTemplate({ name: repo, zipData: base64, owner })
      },

      publishTemplate: async (data) => {
        const { templates: api } = await import('@/api/platform')
        return api.publish(data)
      },

      // --- Project Sync ---

      fetchRemoteProjects: async () => {
        set({ remoteProjectsLoading: true })
        try {
          const res = await projects.list()
          set({ remoteProjects: res.projects, remoteProjectsLoading: false })
        } catch (err) {
          set({ remoteProjectsLoading: false })
          throw err
        }
      },

      searchPublicProjects: async (q: string, page: number = 1) => {
        set({ publicProjectsLoading: true })
        try {
          const res = await projects.searchPublic(q, page)
          set({
            publicProjects: res.projects,
            publicProjectsTotal: res.total,
            publicProjectsLoading: false,
          })
        } catch (err) {
          set({ publicProjectsLoading: false })
          throw err
        }
      },

      pushProject: async (name: string, description: string, isPrivate: boolean) => {
        // Collect project files via IPC
        const files = await window.electron.project.collectProjectFiles(name)
        // Create project on server
        const result = await projects.create({ name, description, private: isPrivate })
        // Upload files
        const { templates: api } = await import('@/api/platform')
        await api.publish({
          name,
          description,
          category: 'project',
          public: !isPrivate,
          files,
        })
        return result
      },

      pullProject: async (owner: string, repo: string, projectName: string) => {
        const token = get().token
        const baseUrl = getBaseUrl()
        // Use Gitea archive API via platform proxy
        const url = `${baseUrl}/api/v1/repos/${owner}/${repo}/archive/main.zip`
        const authToken = token

        const res = await fetch(url, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        })

        if (!res.ok) {
          throw new Error(`下载失败: ${res.status} ${res.statusText}`)
        }

        const buffer = await res.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))

        // Install to workspace via IPC
        await window.electron.project.installRemoteProject({ name: projectName, zipData: base64, owner })
      },

      checkSyncStatus: async (projectList: { name: string; localSha?: string }[]) => {
        try {
          const res = await projects.syncCheck(projectList)
          set({ syncStatuses: res.results })
        } catch {
          // Silently fail - sync check is non-critical
        }
      },

      deleteRemoteProject: async (owner: string, repo: string) => {
        await projects.delete(owner, repo)
        // Refresh list
        const { remoteProjects } = get()
        set({ remoteProjects: remoteProjects.filter(p => p.owner !== owner || p.name !== repo) })
      },
    }),
    {
      name: 'mc-platform-storage',
      partialize: (state) => ({
        baseUrl: state.baseUrl,
        // token 不存储在 localStorage，使用 safeStorage 加密存储
        loggedIn: state.loggedIn,
        username: state.username,
        userId: state.userId,
      }),
      onRehydrateStorage: () => async (state) => {
        if (state) {
          setBaseUrl(state.baseUrl || 'http://localhost:18720')
          // 从 safeStorage 恢复 Token
          try {
            const savedToken = await window.electron.platform.loadToken()
            if (savedToken) {
              setToken(savedToken)
            }
          } catch { /* ignore */ }
        }
      },
    }
  )
)
