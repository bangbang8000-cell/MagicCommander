import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react'
import clsx from 'clsx'
import { useProjectStore } from './stores/project.store'
import { useLogStore } from './stores/log.store'
import { useRenderStore } from './stores/render.store'
import { useUIStore, type ActivityType, resolveTheme } from './stores/ui.store'
import { useEditorStore, type EditorTab } from './stores/editor.store'
import { usePlatformStore } from './stores/platform.store'
import { client } from './api/platform'
import { useHotkey } from './hooks/useHotkey'
import { HOTKEY_REGISTRY } from './hooks/hotkeyRegistry'
import { Header } from './components/layout/Header'
import { ActivityBar } from './components/layout/ActivityBar'
import { StatusBar } from './components/layout/StatusBar'
import { ResizableAppLayout } from './components/layout/ResizableAppLayout'
import { ExplorerPanel } from './components/sidebar/ExplorerPanel'
import { WorkbenchPanel } from './components/sidebar/WorkbenchPanel'
import { OutputPanel } from './components/sidebar/OutputPanel'
import { SettingsPanel } from './components/sidebar/SettingsPanel'
import { SearchPanel } from './components/sidebar/SearchPanel'
import { DocPanel } from './components/sidebar/DocPanel'
import { ChatPanel } from './components/chat'
import { CloudPanel } from './components/cloud/CloudPanel'
import { EditorArea } from './components/editor/EditorArea'
import { PanelArea } from './components/panel/PanelArea'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastContainer } from './components/ui/Toast'
import { Cheatsheet } from './components/ui/Cheatsheet'
import { CommandPalette, type CommandItem } from './components/ui/CommandPalette'
import {
  buildRenderCommands,
  buildExportCommands,
  buildRecentCommands,
  buildFavoriteCommands,
  buildPipelineCommands,
  buildSettingsCommands,
  buildTerminalCommands,
} from './components/ui/CommandPalette'
import { executeCommand, type CommandContext } from './components/terminal/commandRegistry'
import { useBatchStore } from './stores/batch.store'
import { LoadingScreen } from './components/common/LoadingScreen'
import { errorService } from '@/services/errorService'
import type { EditorTabMeta } from './types/editor'
import i18n from './i18n'
import { RTL_LOCALES, type SupportedLocale } from './i18n/resources'

export default function App() {
  const fetchProjects = useProjectStore((s) => s.fetchProjects)
  const selectProject = useProjectStore((s) => s.selectProject)
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
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [loadingStage, setLoadingStage] = useState(0)

  const activeActivity = useUIStore((s) => s.activeActivity)
  const sidebarVisible = useUIStore((s) => s.sidebarVisible)

  useEffect(() => {
    // 4.1 F1-1/F1-2：维护 data-theme + .dark/.high-contrast class（DOM 标记由无闪变脚本与 store 一致）
    const root = document.documentElement
    const resolved = resolveTheme(theme, isDark)
    root.dataset.theme = resolved
    root.classList.toggle('dark', resolved === 'dark')
    root.classList.toggle('high-contrast', resolved === 'high-contrast')
  }, [theme, isDark])

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
      root.dir = RTL_LOCALES.includes(lng as SupportedLocale) ? 'rtl' : 'ltr'
      root.lang = lng
    }
    handleLanguageChanged(i18n.language)
    i18n.on('languageChanged', handleLanguageChanged)
    return () => {
      i18n.off('languageChanged', handleLanguageChanged)
    }
  }, [])

  // 启动时检查云端版本更新
  useEffect(() => {
    if (!isInitialized) return
    const { loggedIn } = usePlatformStore.getState()
    if (!loggedIn) return
    client.version().catch(() => {})
  }, [isInitialized])

  // 47-a：把 ui.store 持久化的 checkUpdateOnStart 同步到主进程（控制启动自动检查更新）
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.app?.setCheckUpdateOnStart) return
    window.electron.app.setCheckUpdateOnStart(useUIStore.getState().generalSettings.checkUpdateOnStart).catch(() => {})
    const unsub = useUIStore.subscribe(
      (s) => s.generalSettings.checkUpdateOnStart,
      (enabled) => {
        window.electron.app.setCheckUpdateOnStart(enabled).catch(() => {})
      },
    )
    return () => {
      unsub()
    }
  }, [])

  // 47-d：把 ui.store 持久化的 telemetryEnabled 同步到主进程遥测服务（默认关，仅本地）
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.diag?.telemetrySetEnabled) return
    window.electron.diag.telemetrySetEnabled(useUIStore.getState().generalSettings.telemetryEnabled).catch(() => {})
    const unsub = useUIStore.subscribe(
      (s) => s.generalSettings.telemetryEnabled,
      (enabled) => {
        window.electron.diag.telemetrySetEnabled(enabled).catch(() => {})
      },
    )
    return () => {
      unsub()
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

    if (subscribeProgress) {
      progressUnsubRef.current = subscribeProgress()
    }
    if (subscribeLog) {
      logUnsubRef.current = subscribeLog()
    }
    if (subscribeRenderProgressLog) {
      renderLogUnsubRef.current = subscribeRenderProgressLog()
    }

    addLog('info', '应用启动完成')
    const safeLogWrite = (level: string, message: string) => {
      try {
        if (window.electron && window.electron.log) {
          window.electron.log.write(level, message)
        }
      } catch {
        /* 忽略预期错误 */
      }
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

    const waitForHydration = (store: {
      persist: {
        hasHydrated: () => boolean
        onFinishHydration: (cb: () => void) => () => void
      }
    }): Promise<void> => {
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
          const matched = projState.projects.find((p: { name: string }) => p.name === savedProjectName)
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
  }, [restoreTabs])

  // 4.4 F4-1 共享快捷键规范：F1 → 快捷键 Cheatsheet；Ctrl+K → 命令面板
  useHotkey('f1', () => setCheatsheetOpen(true), [])
  useHotkey('ctrl+k', () => setCommandPaletteOpen(true), [])

  // 命令面板：从快捷键注册表 + 菜单 + 4.4 F4-5 命令全集构建统一命令列表
  const commandItems = useMemo<CommandItem[]>(() => {
    const handler = (activity: string) => () => setActiveActivity(activity as ActivityType)

    // 4.4 F4-5：渲染 / 导出 / 最近收藏 / 管线 / 设置 / 终端 命令辅助
    const renderByKind = async (kind: 'project' | 'yaml' | 'sn') => {
      const rs = useRenderStore.getState()
      const proj = useProjectStore.getState().selectedProject
      const ids = rs.selectedProjectIds.length > 0 ? rs.selectedProjectIds : proj ? [String(proj.id)] : []
      if (ids.length === 0) return
      if (kind === 'project') await rs.renderProject(ids)
      else if (kind === 'yaml') await rs.renderYaml(ids)
      else await rs.renderProjectSn(ids)
    }
    const exportCurrent = async () => {
      const proj = useProjectStore.getState().selectedProject
      if (!proj) return
      const rs = useRenderStore.getState()
      const ids = rs.selectedProjectIds.length > 0 ? rs.selectedProjectIds : [String(proj.id)]
      const projects = useProjectStore.getState().projects.filter((p) => ids.includes(String(p.id)))
      if (projects.length > 0) {
        await useBatchStore.getState().runBatchExport(projects.map((p) => ({ id: p.id, name: p.name })))
      } else {
        await window.electron.output.export(proj.name, 'zip')
      }
    }
    const openProjectByName = (name: string) => {
      const p = useProjectStore.getState().projects.find((x) => x.name === name)
      if (p) {
        useProjectStore.getState().selectProject(p)
        setActiveActivity('explorer')
        useProjectStore.getState().loadStructure(name)
      }
    }
    const renderSelectedCount = useRenderStore.getState().selectedProjectIds.length
    const projectState = useProjectStore.getState()

    const extra: CommandItem[] = [
      {
        id: 'newProject',
        label: i18n.t('common:menu.newProject'),
        category: '文件',
        shortcut: 'Ctrl+N',
        action: () => useProjectStore.getState().triggerCreateProject(),
      },
      {
        id: 'openProjectDir',
        label: i18n.t('common:menu.openProjectDir'),
        category: '文件',
        action: async () => {
          try {
            const p = await window.electron?.app?.getPath?.('workspace')
            if (p) window.electron?.shell?.showItemInFolder?.(p)
          } catch {
            /* 忽略预期错误 */
          }
        },
      },
      {
        id: 'undo',
        label: i18n.t('common:menu.undo'),
        category: '编辑',
        shortcut: 'Ctrl+Z',
        action: () => document.execCommand('undo'),
      },
      {
        id: 'redo',
        label: i18n.t('common:menu.redo'),
        category: '编辑',
        shortcut: 'Ctrl+Shift+Z',
        action: () => document.execCommand('redo'),
      },
      {
        id: 'copy',
        label: i18n.t('common:menu.copy'),
        category: '编辑',
        shortcut: 'Ctrl+C',
        action: () => document.execCommand('copy'),
      },
      {
        id: 'paste',
        label: i18n.t('common:menu.paste'),
        category: '编辑',
        shortcut: 'Ctrl+V',
        action: () => document.execCommand('paste'),
      },
      {
        id: 'cheatsheet',
        label: i18n.t('common:menu.cheatsheet'),
        category: '视图',
        shortcut: 'F1',
        action: () => setCheatsheetOpen(true),
      },
    ]
    const fromRegistry: CommandItem[] = HOTKEY_REGISTRY.map((h) => {
      let action: () => void
      switch (h.combo) {
        case 'ctrl+s':
          action = () => saveActiveTab()
          break
        case 'ctrl+w':
          action = () => {
            const s = useEditorStore.getState()
            const tid =
              s.splitMode !== 'none' && s.splitTabs.some((t) => t.id === s.activeSplitTabId)
                ? s.activeSplitTabId
                : s.activeTabId
            if (tid) closeTab(tid)
          }
          break
        case 'ctrl+shift+t':
          action = () => reopenLastClosed()
          break
        case 'ctrl+b':
          action = () => toggleSidebar()
          break
        case 'ctrl+j':
          action = () => useUIStore.getState().togglePanel()
          break
        case 'ctrl+\\\\':
          action = () =>
            useEditorStore
              .getState()
              .setSplitMode(useEditorStore.getState().splitMode === 'vertical' ? 'none' : 'vertical')
          break
        case 'ctrl+k':
          action = () => setCommandPaletteOpen(true)
          break
        case 'ctrl+shift+z':
          action = () => document.execCommand('redo')
          break
        case 'f1':
          action = () => setCheatsheetOpen(true)
          break
        case 'ctrl+n':
          action = () => useProjectStore.getState().triggerCreateProject()
          break
        case 'ctrl+enter':
          action = () => void renderByKind('project')
          break
        case 'ctrl+e':
          action = () => setActiveActivity('output')
          break
        case 'ctrl+shift+p':
          action = () => setActiveActivity('explorer')
          break
        case 'ctrl+`':
          action = () => useUIStore.getState().setActivePanel('terminal')
          break
        case 'f5':
          action = () => window.location.reload()
          break
        default:
          action = () =>
            handler(
              h.combo.includes('shift+h')
                ? 'chat'
                : h.combo.includes('shift+e')
                  ? 'explorer'
                  : h.combo.includes('shift+f')
                    ? 'search'
                    : h.combo.includes('shift+r')
                      ? 'workbench'
                      : h.combo.includes('shift+o')
                        ? 'output'
                        : h.combo.includes('shift+w')
                          ? 'workbench'
                          : h.combo.includes(',')
                            ? 'settings'
                            : 'search',
            )
      }
      return { id: h.combo, label: h.label, category: h.category, shortcut: h.combo, action }
    })

    // 4.4 F4-5：命令全集（渲染/导出/最近/收藏/管线/设置/终端）
    const fullSet: CommandItem[] = [
      ...buildRenderCommands((kind) => void renderByKind(kind), renderSelectedCount),
      ...buildExportCommands(() => void exportCurrent(), renderSelectedCount),
      ...buildRecentCommands(projectState.recentProjects, openProjectByName),
      ...buildFavoriteCommands(projectState.favoriteProjects, openProjectByName),
      ...buildPipelineCommands(
        () => setActiveActivity('workbench'),
        () => setActiveActivity('workbench'),
      ),
      ...buildSettingsCommands(() => setActiveActivity('settings')),
      ...buildTerminalCommands(),
    ]
    return [...fromRegistry, ...extra, ...fullSet]
  }, [saveActiveTab, closeTab, reopenLastClosed, toggleSidebar, setActiveActivity])

  // 4.4 F4-5：命令面板终端命令 → 命令注册表执行（输出到日志面板）
  const handleTerminalCommand = useCallback((cmd: string) => {
    useUIStore.getState().setActivePanel('terminal')
    const ctx: CommandContext = {
      addLog: (level, message) => useLogStore.getState().addLog(level, message, 'terminal'),
      toggleDark: () => useUIStore.getState().toggleDark(),
      setTheme: (theme) => useUIStore.getState().setTheme(theme),
      clearTerminal: () => {},
      selectProject: (name) => {
        const p = useProjectStore.getState().projects.find((x) => x.name === name)
        if (p) useProjectStore.getState().selectProject(p)
      },
    }
    void executeCommand(cmd, ctx).catch(() => {})
  }, [])

  // 4.4 F4-1 共享快捷键规范：Ctrl+Shift+P → 项目面板（项目浏览器）
  useHotkey('ctrl+shift+p', () => setActiveActivity('explorer'), [setActiveActivity])
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
  useHotkey(
    'ctrl+shift+c',
    () => {
      // 打磨轮（v1.2 / M2）：云开关关闭时不响应
      if (useUIStore.getState().generalSettings.cloudEnabled) setActiveActivity('cloud')
    },
    [setActiveActivity],
  )
  useHotkey('ctrl+shift+o', () => setActiveActivity('output'), [setActiveActivity])
  useHotkey('ctrl+shift+w', () => setActiveActivity('workbench'), [setActiveActivity])
  useHotkey('ctrl+shift+h', () => setActiveActivity('chat'), [setActiveActivity])
  // 5.0.5-505-a：文档工作台
  useHotkey('ctrl+shift+d', () => setActiveActivity('doc'), [setActiveActivity])
  useHotkey('ctrl+,', () => setActiveActivity('settings'), [setActiveActivity])
  // 4.4 F4-1：共享标准键补充
  useHotkey('ctrl+shift+z', () => document.execCommand('redo'), [])
  useHotkey('ctrl+e', () => setActiveActivity('output'), [setActiveActivity])
  useHotkey(
    'ctrl+`',
    () => {
      useUIStore.getState().setActivePanel('terminal')
    },
    [],
  )
  useHotkey('ctrl+n', () => useProjectStore.getState().triggerCreateProject(), [])
  useHotkey(
    'ctrl+enter',
    () => {
      const rs = useRenderStore.getState()
      const proj = useProjectStore.getState().selectedProject
      const ids = rs.selectedProjectIds.length > 0 ? rs.selectedProjectIds : proj ? [String(proj.id)] : []
      if (ids.length > 0) void rs.renderProject(ids)
    },
    [],
  )
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
      case 'workbench':
        return <WorkbenchPanel />
      case 'output':
        return <OutputPanel />
      case 'settings':
        return <SettingsPanel />
      case 'chat':
        return <ChatPanel />
      case 'doc':
        return <DocPanel />
      case 'cloud':
        // 打磨轮（v1.2 / M2）：云开关关闭时回落项目浏览器
        return useUIStore.getState().generalSettings.cloudEnabled ? <CloudPanel /> : null
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
        <CommandPalette
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          commands={commandItems}
          onTerminalCommand={handleTerminalCommand}
        />
      </div>
    </ErrorBoundary>
  )
}
