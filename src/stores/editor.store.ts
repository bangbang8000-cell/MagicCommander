import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EditorTabMeta, FileType } from '@/types/editor'

export interface EditorTab {
  id: string
  title: string
  filePath: string
  fileType: FileType
  projectId: number
  projectName: string
  isDirty: boolean
  content?: unknown
  saveFn?: () => Promise<void>
}

interface EditorPersistState {
  activeTabId: string | null
  activeSplitTabId: string | null
  tabMetas: EditorTabMeta[]
  recentClosedTabs: EditorTabMeta[]
}

interface EditorState extends EditorPersistState {
  openTabs: EditorTab[]
  splitMode: 'none' | 'horizontal' | 'vertical'
  splitTabs: EditorTab[]

  pendingCloseTabId: string | null

  openFile: (tab: EditorTab) => void
  closeTab: (tabId: string, force?: boolean) => void
  setActiveTab: (tabId: string) => void
  setSplitMode: (mode: EditorState['splitMode']) => void
  markDirty: (tabId: string, dirty: boolean) => void
  updateContent: (tabId: string, content: unknown) => void
  closeAllTabs: () => void
  closeTabsByProject: (projectId: number) => void

  registerSaveFn: (tabId: string, fn: () => Promise<void>) => void
  saveTab: (tabId: string) => Promise<void>
  saveActiveTab: () => Promise<void>
  setPendingCloseTab: (tabId: string | null) => void
  confirmClose: () => void
  reopenLastClosed: () => void
}

function generateTabId(): string {
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function buildTabMetas(openTabs: EditorTab[], splitTabs: EditorTab[]): EditorTabMeta[] {
  return [...openTabs, ...splitTabs].map((t) => ({
    tabId: t.id,
    filePath: t.filePath,
    fileType: t.fileType,
    projectId: t.projectId,
    title: t.title,
    projectName: t.projectName,
  }))
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      openTabs: [],
      activeTabId: null,
      splitMode: 'none',
      splitTabs: [],
      activeSplitTabId: null,
      tabMetas: [],
      pendingCloseTabId: null,
      recentClosedTabs: [],

      openFile: (tab) => {
        const { openTabs, splitTabs, splitMode } = get()
        const existing = openTabs.find((t) => t.filePath === tab.filePath)
        if (existing) {
          set({ activeTabId: existing.id })
          return
        }
        const existingSplit = splitTabs.find((t) => t.filePath === tab.filePath)
        if (existingSplit) {
          set({ activeSplitTabId: existingSplit.id })
          return
        }

        const newTab: EditorTab = { ...tab, id: tab.id || generateTabId() }
        if (splitMode !== 'none') {
          set({
            splitTabs: [...splitTabs, newTab],
            activeSplitTabId: newTab.id,
            tabMetas: buildTabMetas(get().openTabs, [...splitTabs, newTab]),
          })
        } else {
          set({
            openTabs: [...openTabs, newTab],
            activeTabId: newTab.id,
            tabMetas: buildTabMetas([...openTabs, newTab], get().splitTabs),
          })
        }
      },

      closeTab: (tabId, force = false) => {
        const { openTabs, activeTabId, splitTabs, activeSplitTabId } = get()
        const tab = [...openTabs, ...splitTabs].find((t) => t.id === tabId)
        if (!tab) return

        if (!force && tab.isDirty) {
          set({ pendingCloseTabId: tabId })
          return
        }

        // 记录到 recentClosedTabs（最多 10 个）
        const meta: EditorTabMeta = {
          tabId: tab.id,
          filePath: tab.filePath,
          fileType: tab.fileType,
          projectId: tab.projectId,
          title: tab.title,
          projectName: tab.projectName,
        }
        const recent = [meta, ...get().recentClosedTabs].slice(0, 10)

        const mainIndex = openTabs.findIndex((t) => t.id === tabId)
        if (mainIndex !== -1) {
          const newTabs = openTabs.filter((t) => t.id !== tabId)
          let newActive = activeTabId
          if (activeTabId === tabId) {
            if (newTabs.length > 0) {
              const nextIndex = Math.min(mainIndex, newTabs.length - 1)
              newActive = newTabs[nextIndex].id
            } else {
              newActive = null
            }
          }
          set({
            openTabs: newTabs,
            activeTabId: newActive,
            tabMetas: buildTabMetas(newTabs, get().splitTabs),
            recentClosedTabs: recent,
          })
          return
        }

        const splitIndex = splitTabs.findIndex((t) => t.id === tabId)
        if (splitIndex !== -1) {
          const newTabs = splitTabs.filter((t) => t.id !== tabId)
          let newActive = activeSplitTabId
          if (activeSplitTabId === tabId) {
            if (newTabs.length > 0) {
              const nextIndex = Math.min(splitIndex, newTabs.length - 1)
              newActive = newTabs[nextIndex].id
            } else {
              newActive = null
            }
          }
          set({
            splitTabs: newTabs,
            activeSplitTabId: newActive,
            tabMetas: buildTabMetas(get().openTabs, newTabs),
            recentClosedTabs: recent,
          })
        }
      },

      setActiveTab: (tabId) => {
        const { openTabs, splitTabs } = get()
        if (openTabs.find((t) => t.id === tabId)) {
          set({ activeTabId: tabId })
        } else if (splitTabs.find((t) => t.id === tabId)) {
          set({ activeSplitTabId: tabId })
        }
      },

      setSplitMode: (mode) => {
        if (mode === 'none') {
          const { splitTabs, openTabs } = get()
          set({
            splitMode: 'none',
            openTabs: [...openTabs, ...splitTabs],
            splitTabs: [],
            activeSplitTabId: null,
            tabMetas: buildTabMetas([...openTabs, ...splitTabs], []),
          })
        } else {
          set({ splitMode: mode })
        }
      },

      markDirty: (tabId, dirty) => {
        set((state) => ({
          openTabs: state.openTabs.map((t) => (t.id === tabId ? { ...t, isDirty: dirty } : t)),
          splitTabs: state.splitTabs.map((t) => (t.id === tabId ? { ...t, isDirty: dirty } : t)),
        }))
      },

      updateContent: (tabId, content) => {
        set((state) => ({
          openTabs: state.openTabs.map((t) => (t.id === tabId ? { ...t, content } : t)),
          splitTabs: state.splitTabs.map((t) => (t.id === tabId ? { ...t, content } : t)),
        }))
      },

      closeAllTabs: () =>
        set({
          openTabs: [],
          activeTabId: null,
          splitTabs: [],
          activeSplitTabId: null,
          splitMode: 'none',
          tabMetas: [],
        }),

      closeTabsByProject: (projectId) => {
        set((state) => {
          const newOpenTabs = state.openTabs.filter((t) => t.projectId !== projectId)
          const newSplitTabs = state.splitTabs.filter((t) => t.projectId !== projectId)
          return {
            openTabs: newOpenTabs,
            splitTabs: newSplitTabs,
            activeTabId:
              state.activeTabId && newOpenTabs.find((t) => t.id === state.activeTabId)
                ? state.activeTabId
                : newOpenTabs[0]?.id || null,
            activeSplitTabId:
              state.activeSplitTabId && newSplitTabs.find((t) => t.id === state.activeSplitTabId)
                ? state.activeSplitTabId
                : newSplitTabs[0]?.id || null,
            tabMetas: buildTabMetas(newOpenTabs, newSplitTabs),
          }
        })
      },

      registerSaveFn: (tabId, fn) => {
        set((state) => ({
          openTabs: state.openTabs.map((t) => (t.id === tabId ? { ...t, saveFn: fn } : t)),
          splitTabs: state.splitTabs.map((t) => (t.id === tabId ? { ...t, saveFn: fn } : t)),
        }))
      },

      saveTab: async (tabId) => {
        const tab = [...get().openTabs, ...get().splitTabs].find((t) => t.id === tabId)
        if (tab?.saveFn) {
          await tab.saveFn()
        }
      },

      saveActiveTab: async () => {
        const { activeTabId, splitMode, splitTabs } = get()
        const tabId = splitMode !== 'none' && splitTabs.some((t) => t.id === activeTabId) ? activeTabId : activeTabId
        if (tabId) {
          await get().saveTab(tabId)
        }
      },

      setPendingCloseTab: (tabId) => set({ pendingCloseTabId: tabId }),

      confirmClose: () => {
        const { pendingCloseTabId } = get()
        if (pendingCloseTabId) {
          get().saveTab(pendingCloseTabId)
          set({ pendingCloseTabId: null })
        }
      },

      reopenLastClosed: () => {
        const { recentClosedTabs } = get()
        if (recentClosedTabs.length === 0) return
        const [last, ...rest] = recentClosedTabs
        set({ recentClosedTabs: rest })
        // 通过 openFile 重新打开（id 为空，会生成新 id）
        get().openFile({
          id: '',
          title: last.title,
          filePath: last.filePath,
          fileType: last.fileType,
          projectId: last.projectId,
          projectName: last.projectName,
          isDirty: false,
        })
      },
    }),
    {
      name: 'mc-editor-state',
      partialize: (state): EditorPersistState => ({
        activeTabId: state.activeTabId,
        activeSplitTabId: state.activeSplitTabId,
        tabMetas: state.tabMetas,
        recentClosedTabs: state.recentClosedTabs,
      }),
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            state.activeTabId = null
            state.activeSplitTabId = null
          }
        }
      },
    },
  ),
)
