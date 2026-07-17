import React, { useEffect, useCallback, useState, useRef } from 'react'
import clsx from 'clsx'
import { useProjectStore } from './stores/project.store'
import { useLogStore } from './stores/log.store'
import { useRenderStore } from './stores/render.store'
import { useUIStore } from './stores/ui.store'
import { useEditorStore, type EditorTab } from './stores/editor.store'
import { useHotkey } from './hooks/useHotkey'
import { Header } from './components/layout/Header'
import { ActivityBar } from './components/layout/ActivityBar'
import { StatusBar } from './components/layout/StatusBar'
import { ResizableAppLayout } from './components/layout/ResizableAppLayout'
import { ExplorerPanel } from './components/sidebar/ExplorerPanel'
import { WorkbenchPanel } from './components/sidebar/WorkbenchPanel'
import { OutputPanel } from './components/sidebar/OutputPanel'
import { SettingsPanel } from './components/sidebar/SettingsPanel'
import { SearchPanel } from './components/sidebar/SearchPanel'
import { RenderPanel } from './components/sidebar/RenderPanel'
import { ChatPanel } from './components/chat'
import { EditorArea } from './components/editor/EditorArea'
import { PanelArea } from './components/panel/PanelArea'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastContainer } from './components/ui/Toast'
import { Cheatsheet } from './components/ui/Cheatsheet'
import { LoadingScreen } from './components/common/LoadingScreen'
import { errorService } from '@/services/errorService'
import type { EditorTabMeta } from './types/editor'
import i18n from './i18n'
import { RTL_LOCALES } from './i18n/resources'

export default function App() {
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const selectProject = useProjectStore((s) => s.selectProject)
  const subscribeProgress = useRenderStore((s) => s.subscribeProgress)
  const subscribeLog = useLogStore((s) => s.subscribeLog)
  const panelVisible = useUIStore((s) => s.panelVisible)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const setActiveActivity = useUIStore((s) => s.setActiveActivity)
  const isDark = useUIStore((s) => s.isDark)
  const theme = useUIStore((s) => s.theme)
  const openFile = useEditorStore((s) => s.openFile)
  const saveActiveTab = useEditorStore((s) => s.saveActiveTab)
  const closeTab = useEditorStore((s) => s.closeTab)
  const reopenLastClosed = useEditorStore((s) => s.reopenLastClosed)

  const fetchProjectsRef = useRef(fetchProjects)
  fetchProjectsRef.current = fetchProjects
  const selectProjectRef = useRef(selectProject)
  selectProjectRef.current = selectProject
  const openFileRef = useRef(openFile)
  openFileRef.current = openFile

  const progressUnsubRef = useRef<(() => void) | null>(null)
  const logUnsubRef = useRef<(() => void) | null>(null)
  const renderLogUnsubRef = useRef<(() => void) | null>(null)
  const initRef = useRef(false)

  const [cheatsheetOpen, setCheatsheetOpen] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [loadingStage, setLoadingStage] = useState(0)

  const activeActivity = useUIStore((s) => s.activeActivity)
  const sidebarVisible = useUIStore((s) => s.sidebarVisible)

  useEffect(() => {
    const root = document.documentElement
    if (isDark) root.classList.add('dark')
    else root.classList.remove('dark')
  }, [isDark])

  // 监听系统主题变化（当 theme === 'system' 时同步）
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      useUIStore.getState().syncSystemTheme()
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // RTL 语言方向切换
  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      const root = document.documentElement
      root.dir = RTL_LOCALES.includes(lng as any) ? 'rtl' : 'ltr'
      root.lang = lng
    }
    handleLanguageChanged(i18n.language)
    i18n.on('languageChanged', handleLanguageChanged)
    return () => {
      i18n.off('languageChanged', handleLanguageChanged)
    }
  }, [])

  const restoreTabs = useCallback((metas: EditorTabMeta[]) => {
    metas.forEach((meta) => {
      const tab: EditorTab = {
        id: meta.tabId,
        title: meta.title,
        filePath: meta.filePath,
        fileType: meta.fileType,
        projectId: meta.projectId,
        projectName: meta.projectName,
        isDirty: false,
      }
      openFileRef.current(tab)
    })
  }, [])

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    const { subscribeProgress } = useRenderStore.getState()
    const { subscribeLog, subscribeRenderProgressLog, addLog } = useLogStore.getState()

    subscribeProgress && (progressUnsubRef.current = subscribeProgress())
    subscribeLog && (logUnsubRef.current = subscribeLog())
    subscribeRenderProgressLog && (renderLogUnsubRef.current = subscribeRenderProgressLog())

    addLog('info', '应用启动完成')
    const safeLogWrite = (level: string, message: string) => {
      try {
        if (window.electron && window.electron.log) {
          window.electron.log.write(level, message)
        }
      } catch {}
    }
    safeLogWrite('info', '应用启动完成')
    const versions = window.electron?.versions
    const nodeVersion = versions?.node || 'N/A'
    const electronVersion = versions?.electron || 'N/A'
    const platform = versions?.platform || 'N/A'
    const arch = versions?.arch || 'N/A'
    safeLogWrite('info', `Node 版本: ${nodeVersion}`)
    safeLogWrite('info', `Electron 版本: ${electronVersion}`)
    safeLogWrite('info', `平台: ${platform} (${arch})`)
    safeLogWrite('info', 'Python 子进程状态: 等待启动...')
    addLog('info', `Node 版本: ${nodeVersion}`)
    addLog('info', `Electron 环境已就绪`)
    addLog('info', `运行平台: ${platform} (${arch})`)

    const waitForHydration = (store: any): Promise<void> => {
      return new Promise((resolve) => {
        if (store.persist.hasHydrated()) {
          resolve()
        } else {
          const unsub = store.persist.onFinishHydration(() => {
            unsub()
            resolve()
          })
        }
      })
    }

    const init = async () => {
      try {
        // 阶段1：等待状态恢复
        setLoadingStage(1)
        await Promise.all([waitForHydration(useProjectStore), waitForHydration(useEditorStore)])

        // 阶段2：加载项目列表
        setLoadingStage(2)
        await fetchProjectsRef.current()
        await new Promise((resolve) => setTimeout(resolve, 0))

        // 阶段3：恢复项目选择
        setLoadingStage(3)
        const projState = useProjectStore.getState()
        const savedProjectName = projState.selectedProjectName
        const projectsCount = projState.projects.length

        if (savedProjectName !== null && projectsCount > 0) {
          const matched = projState.projects.find((p: any) => p.name === savedProjectName)
          if (matched) {
            selectProjectRef.current(matched)
          }
        }

        // 阶段4：恢复标签页
        setLoadingStage(4)
        const editorState = useEditorStore.getState()
        const savedTabMetas = editorState.tabMetas

        if (savedTabMetas && savedTabMetas.length > 0) {
          if (savedProjectName !== null) {
            await new Promise((resolve) => setTimeout(resolve, 50))
          }
          restoreTabs(savedTabMetas)

          await new Promise((resolve) => setTimeout(resolve, 0))
          const afterRestore = useEditorStore.getState()
          const openTabsCount = afterRestore.openTabs.length
          const activeTabId = afterRestore.activeTabId

          if (openTabsCount > 0 && activeTabId === null) {
            useEditorStore.getState().setActiveTab(afterRestore.openTabs[0].id)
          }
        }
      } catch (err) {
        errorService.handleError(err, 'App.init')
      } finally {
        // 无论成功还是失败，都要隐藏加载屏幕
        // 添加短暂延迟避免闪烁
        setTimeout(() => {
          setIsInitialized(true)
        }, 100)
      }
    }

    init()

    return () => {
      progressUnsubRef.current?.()
      logUnsubRef.current?.()
      renderLogUnsubRef.current?.()
      progressUnsubRef.current = null
      logUnsubRef.current = null
      renderLogUnsubRef.current = null
    }
  }, [])

  const [cheatsheetPending, setCheatsheetPending] = useState(false)
  useHotkey('k', () => setCheatsheetPending(true), [])
  useHotkey(
    's',
    () => {
      if (cheatsheetPending) {
        setCheatsheetPending(false)
        setCheatsheetOpen(true)
      }
    },
    [cheatsheetPending],
  )
  useHotkey('ctrl+b', () => toggleSidebar(), [toggleSidebar])
  useHotkey(
    'ctrl+j',
    () => {
      useUIStore.getState().togglePanel()
    },
    [],
  )
  useHotkey('ctrl+shift+e', () => setActiveActivity('explorer'), [setActiveActivity])
  useHotkey('ctrl+shift+f', () => setActiveActivity('search'), [setActiveActivity])
  useHotkey('ctrl+shift+r', () => setActiveActivity('render'), [setActiveActivity])
  useHotkey('ctrl+shift+o', () => setActiveActivity('output'), [setActiveActivity])
  useHotkey('ctrl+shift+w', () => setActiveActivity('workbench'), [setActiveActivity])
  useHotkey('ctrl+shift+h', () => setActiveActivity('chat'), [setActiveActivity])
  useHotkey('ctrl+,', () => setActiveActivity('settings'), [setActiveActivity])
  useHotkey('ctrl+s', () => saveActiveTab(), [saveActiveTab])
  useHotkey('f5', () => window.location.reload(), [])
  useHotkey(
    'ctrl+w',
    () => {
      const { splitMode, activeTabId, splitTabs, activeSplitTabId } = useEditorStore.getState()
      const tabId =
        splitMode !== 'none' && splitTabs.some((t) => t.id === activeSplitTabId) ? activeSplitTabId : activeTabId
      if (tabId) closeTab(tabId)
    },
    [],
  )
  useHotkey('ctrl+shift+t', () => reopenLastClosed(), [])

  const renderSidebarContent = () => {
    switch (activeActivity) {
      case 'search':
        return <SearchPanel />
      case 'explorer':
        return <ExplorerPanel />
      case 'render':
        return <RenderPanel />
      case 'output':
        return <OutputPanel />
      case 'workbench':
        return <WorkbenchPanel />
      case 'settings':
        return <SettingsPanel />
      case 'chat':
        return <ChatPanel />
      default:
        return <SearchPanel />
    }
  }

  return (
    <ErrorBoundary>
      <LoadingScreen isLoading={!isInitialized} stage={loadingStage} />
      <div
        className={clsx(
          'h-screen w-screen flex flex-col overflow-hidden',
          isDark ? 'dark bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900',
        )}
      >
        <Header onCheatsheet={() => setCheatsheetOpen(true)} />
        <div className="flex-1 flex overflow-hidden">
          <ActivityBar />
          <ResizableAppLayout
            isDark={isDark}
            sidebarVisible={sidebarVisible}
            panelVisible={panelVisible}
            sidebar={renderSidebarContent()}
            editor={<EditorArea />}
            bottomPanel={<PanelArea />}
          />
        </div>
        <StatusBar />
        <ToastContainer />
        <Cheatsheet open={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />
      </div>
    </ErrorBoundary>
  )
}
