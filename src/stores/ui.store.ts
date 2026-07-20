import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ActivityType = 'search' | 'chat' | 'explorer' | 'render' | 'output' | 'workbench' | 'settings'
export type PanelType = 'log' | 'terminal' | 'problems'

// 布局尺寸基准（像素），与 App.tsx 保持一致
const LAYOUT_SIDEBAR_MIN = 400
const LAYOUT_SIDEBAR_DEFAULT = 800
const LAYOUT_BOTTOM_MIN = 180
const LAYOUT_BOTTOM_DEFAULT = 320
const LAYOUT_INTERNAL_MIN = 160
const LAYOUT_PROJECT_LIST_DEFAULT = 280
const LAYOUT_TEMPLATE_LIST_DEFAULT = 320

interface UIState {
  activeActivity: ActivityType
  setActiveActivity: (activity: ActivityType) => void

  sidebarVisible: boolean
  toggleSidebar: () => void

  panelVisible: boolean
  activePanel: PanelType
  togglePanel: () => void
  setActivePanel: (panel: PanelType) => void

  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: UIState['theme']) => void
  cycleTheme: () => void

  isDark: boolean
  toggleDark: () => void
  syncSystemTheme: () => void

  activeProjectId: number | null
  setActiveProjectId: (id: number | null) => void

  cursorPosition: { line: number; column: number } | null
  setCursorPosition: (pos: { line: number; column: number } | null) => void

  hasSeenWelcome: boolean
  dismissWelcome: () => void

  welcomeOpen: boolean
  setWelcomeOpen: (v: boolean) => void

  syncScroll: boolean
  toggleSyncScroll: () => void

  // 侧边栏宽度（像素）
  sidebarPx: number
  setSidebarPx: (px: number) => void

  // 底部面板高度（像素）
  bottomPx: number
  setBottomPx: (px: number) => void

  explorerProjectListHeight: number
  setExplorerProjectListHeight: (px: number) => void

  templateListHeight: number
  setTemplateListHeight: (px: number) => void

  resetPanelSizes: () => void

  // i18n 语言偏好
  language: string
  setLanguage: (lang: string) => void

  // AI 配置
  aiConfig: AIConfig
  setAIConfig: (config: Partial<AIConfig>) => void
  setProviderConfig: (key: string, config: { apiKey?: string; model?: string; baseUrl?: string }) => void
}

export interface RoutingRule {
  taskType: 'code' | 'analysis' | 'simple' | 'complex'
  provider: string
}

export interface AIConfig {
  defaultProvider: string
  routingEnabled: boolean
  routingRules: RoutingRule[]
  providers: Record<string, ProviderConfig>
}

export interface ProviderConfig {
  apiKey: string
  model: string
  baseUrl: string
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      activeActivity: 'search',
      setActiveActivity: (activity) => set({ activeActivity: activity }),

      sidebarVisible: true,
      toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),

      panelVisible: true,
      activePanel: 'log',
      togglePanel: () => set((s) => ({ panelVisible: !s.panelVisible })),
      setActivePanel: (panel) => set({ activePanel: panel, panelVisible: true }),

      theme: 'light',
      setTheme: (theme) => {
        const isDark =
          theme === 'system'
            ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
            : theme === 'dark'
        set({ theme, isDark })
      },
      cycleTheme: () =>
        set((s) => {
          const next = s.theme === 'light' ? 'dark' : s.theme === 'dark' ? 'system' : 'light'
          const isDark =
            next === 'system'
              ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
              : next === 'dark'
          return { theme: next, isDark }
        }),

      isDark: false,
      toggleDark: () => set((s) => ({ isDark: !s.isDark, theme: s.isDark ? 'light' : 'dark' })),
      syncSystemTheme: () =>
        set((s) => {
          if (s.theme !== 'system') return {}
          return { isDark: typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches }
        }),

      activeProjectId: null,
      setActiveProjectId: (id) => set({ activeProjectId: id }),

      cursorPosition: null,
      setCursorPosition: (pos) => set({ cursorPosition: pos }),

      hasSeenWelcome: false,
      dismissWelcome: () => set({ hasSeenWelcome: true, welcomeOpen: false }),

      welcomeOpen: false,
      setWelcomeOpen: (v) => set({ welcomeOpen: v }),

      syncScroll: false,
      toggleSyncScroll: () => set((s) => ({ syncScroll: !s.syncScroll })),

      sidebarPx: LAYOUT_SIDEBAR_DEFAULT,
      setSidebarPx: (px) => set({ sidebarPx: Math.max(LAYOUT_SIDEBAR_MIN, px) }),

      bottomPx: LAYOUT_BOTTOM_DEFAULT,
      setBottomPx: (px) => set({ bottomPx: Math.max(LAYOUT_BOTTOM_MIN, px) }),

      explorerProjectListHeight: LAYOUT_PROJECT_LIST_DEFAULT,
      setExplorerProjectListHeight: (px) => set({ explorerProjectListHeight: Math.max(LAYOUT_INTERNAL_MIN, px) }),

      templateListHeight: LAYOUT_TEMPLATE_LIST_DEFAULT,
      setTemplateListHeight: (px) => set({ templateListHeight: Math.max(LAYOUT_INTERNAL_MIN, px) }),

      resetPanelSizes: () => {
        if (typeof window !== 'undefined') {
          // 清除本地存储中的旧值，确保下一次启动使用新默认
          try {
            localStorage.removeItem('mc-ui-state')
          } catch {}
        }
        set({
          sidebarPx: LAYOUT_SIDEBAR_DEFAULT,
          bottomPx: LAYOUT_BOTTOM_DEFAULT,
          explorerProjectListHeight: LAYOUT_PROJECT_LIST_DEFAULT,
          templateListHeight: LAYOUT_TEMPLATE_LIST_DEFAULT,
        })
      },

      language: 'zh-CN',
      setLanguage: (language) => set({ language }),

      aiConfig: {
        defaultProvider: 'deepseek',
        routingEnabled: false,
        routingRules: [
          { taskType: 'code', provider: 'deepseek' },
          { taskType: 'analysis', provider: 'deepseek' },
          { taskType: 'simple', provider: 'deepseek' },
          { taskType: 'complex', provider: 'deepseek' },
        ],
        providers: {},
      },
      setAIConfig: (config) => set((s) => ({ aiConfig: { ...s.aiConfig, ...config } })),
      setProviderConfig: (key, config) =>
        set((s) => ({
          aiConfig: {
            ...s.aiConfig,
            providers: {
              ...s.aiConfig.providers,
              [key]: {
                ...s.aiConfig.providers[key],
                ...config,
              },
            },
          },
        })),
    }),
    {
      name: 'mc-ui-state',
      partialize: (state) => ({
        activeActivity: state.activeActivity,
        panelVisible: state.panelVisible,
        sidebarVisible: state.sidebarVisible,
        activeProjectId: state.activeProjectId,
        isDark: state.isDark,
        theme: state.theme,
        hasSeenWelcome: state.hasSeenWelcome,
        syncScroll: state.syncScroll,
        sidebarPx: state.sidebarPx,
        bottomPx: state.bottomPx,
        explorerProjectListHeight: state.explorerProjectListHeight,
        templateListHeight: state.templateListHeight,
        language: state.language,
        aiConfig: state.aiConfig,
      }),
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            // 自动升级：低于最小值的旧像素值 → 升级为新默认
            if (!state.sidebarPx || state.sidebarPx < LAYOUT_SIDEBAR_MIN) {
              state.sidebarPx = LAYOUT_SIDEBAR_DEFAULT
            }
            if (!state.bottomPx || state.bottomPx < LAYOUT_BOTTOM_MIN) {
              state.bottomPx = LAYOUT_BOTTOM_DEFAULT
            }
            if (!state.explorerProjectListHeight || state.explorerProjectListHeight < LAYOUT_INTERNAL_MIN) {
              state.explorerProjectListHeight = LAYOUT_PROJECT_LIST_DEFAULT
            }
            if (!state.templateListHeight || state.templateListHeight < LAYOUT_INTERNAL_MIN) {
              state.templateListHeight = LAYOUT_TEMPLATE_LIST_DEFAULT
            }
          }
        }
      },
    },
  ),
)
