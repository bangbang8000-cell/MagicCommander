import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'

export type ActivityType = 'search' | 'chat' | 'explorer' | 'output' | 'workbench' | 'settings' | 'cloud'
export type PanelType = 'log' | 'terminal' | 'problems' | 'perf'

/** 主题模式（4.1 F1-1/F1-2）：light/dark/system + 高对比主题（WCAG AA） */
export type ThemeMode = 'light' | 'dark' | 'system' | 'high-contrast'

/** 解析主题为实际渲染模式（纯函数，便于单测与无闪变脚本对齐） */
export function resolveTheme(theme: ThemeMode, systemDark: boolean): 'light' | 'dark' | 'high-contrast' {
  if (theme === 'high-contrast') return 'high-contrast'
  if (theme === 'dark') return 'dark'
  if (theme === 'system') return systemDark ? 'dark' : 'light'
  return 'light'
}

/** 主题是否暗色（high-contrast 基于 Light 基准，视为非暗色） */
export function themeIsDark(theme: ThemeMode, systemDark: boolean): boolean {
  return resolveTheme(theme, systemDark) === 'dark'
}

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

  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
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
  setProviderConfig: (
    key: string,
    config: { apiKey?: string; model?: string; baseUrl?: string; models?: string[] },
  ) => void

  // 自主模式（从 chat.store 迁移到此，统一由设置面板管理）
  autonomyMode: 'advisor' | 'semi_auto' | 'full_auto'
  setAutonomyMode: (mode: 'advisor' | 'semi_auto' | 'full_auto') => void

  // 通用设置
  generalSettings: GeneralSettings
  setGeneralSettings: (settings: Partial<GeneralSettings>) => void

  // 高级设置
  advancedSettings: AdvancedSettings
  setAdvancedSettings: (settings: Partial<AdvancedSettings>) => void
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
  /** MC-LOOP1：AI 多轮工具循环最大轮数（1-10，默认 5，provider 无关） */
  maxToolLoopRounds: number
}

export interface ProviderConfig {
  apiKey: string
  model: string
  baseUrl: string
  /** M2: 已拉取的模型列表（持久化回写，下拉优先显示最新模型） */
  models?: string[]
}

export interface GeneralSettings {
  autoSave: boolean
  autoSaveInterval: number
  checkUpdateOnStart: boolean
  fontSize: 'small' | 'medium' | 'large'
  /** 打磨轮（v1.2 / M2）：云平台总体开关（默认关；关时隐藏云入口） */
  cloudEnabled: boolean
}

export interface AdvancedSettings {
  pythonPath: string
  debugMode: boolean
  proxy: string
  aiHubPort: number
  aiHubAutoStart: boolean
}

export const useUIStore = create<UIState>()(
  subscribeWithSelector(
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
          const systemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
          set({ theme, isDark: themeIsDark(theme, systemDark) })
        },
        cycleTheme: () =>
          set((s) => {
            const order: ThemeMode[] = ['light', 'dark', 'system', 'high-contrast']
            const next = order[(order.indexOf(s.theme) + 1) % order.length]
            const systemDark =
              typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
            return { theme: next, isDark: themeIsDark(next, systemDark) }
          }),

        isDark: false,
        toggleDark: () => set((s) => ({ isDark: !s.isDark, theme: s.isDark ? 'light' : 'dark' })),
        syncSystemTheme: () =>
          set((s) => {
            if (s.theme !== 'system') return {}
            return {
              isDark: typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
            }
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
            } catch {
              /* 忽略预期错误 */
            }
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
          maxToolLoopRounds: 5,
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

        autonomyMode: 'full_auto',
        setAutonomyMode: (mode) => set({ autonomyMode: mode }),

        generalSettings: {
          autoSave: true,
          autoSaveInterval: 30,
          checkUpdateOnStart: true,
          fontSize: 'medium',
          cloudEnabled: false,
        },
        setGeneralSettings: (settings) => set((s) => ({ generalSettings: { ...s.generalSettings, ...settings } })),

        advancedSettings: {
          pythonPath: '',
          debugMode: false,
          proxy: '',
          aiHubPort: 0,
          aiHubAutoStart: true,
        },
        setAdvancedSettings: (settings) => set((s) => ({ advancedSettings: { ...s.advancedSettings, ...settings } })),
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
          generalSettings: state.generalSettings,
          advancedSettings: state.advancedSettings,
          autonomyMode: state.autonomyMode,
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

              // MC-LOOP1：旧持久化数据缺少 maxToolLoopRounds 时迁移为默认 5
              if (state.aiConfig && typeof state.aiConfig.maxToolLoopRounds !== 'number') {
                state.aiConfig.maxToolLoopRounds = 5
              }

              // AI 配置恢复：如果 providers 为空，尝试从文件备份恢复
              if (state.aiConfig && Object.keys(state.aiConfig.providers || {}).length === 0) {
                setTimeout(async () => {
                  try {
                    if (typeof window !== 'undefined' && window.electron?.app?.restoreAiConfig) {
                      const backup = await window.electron.app.restoreAiConfig()
                      if (backup && typeof backup === 'object') {
                        const b = backup as Record<string, unknown>
                        if (
                          b.providers &&
                          typeof b.providers === 'object' &&
                          Object.keys(b.providers as object).length > 0
                        ) {
                          useUIStore.getState().setAIConfig(b as Partial<AIConfig>)
                        }
                      }
                    }
                  } catch {
                    // 备份文件不存在或损坏，静默忽略
                  }
                }, 200)
              }
            }
          }
        },
      },
    ),
  ),
)

// AI 配置自动备份：监听 aiConfig 变化，有 API Key 数据时自动备份到 userData 目录
let aiConfigReady = false
setTimeout(() => {
  aiConfigReady = true
}, 1000)

useUIStore.subscribe(
  (state) => state.aiConfig,
  (aiConfig) => {
    if (!aiConfigReady) return
    if (aiConfig?.providers && Object.keys(aiConfig.providers).length > 0) {
      if (typeof window !== 'undefined' && window.electron?.app?.backupAiConfig) {
        window.electron.app.backupAiConfig(aiConfig).catch(() => {})
      }
    }
  },
  { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
)
