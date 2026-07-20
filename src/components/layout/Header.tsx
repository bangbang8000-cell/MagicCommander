import { useTranslation } from 'react-i18next'
import { useState, useRef, useEffect, useCallback } from 'react'
import clsx from 'clsx'
import { Menu, RefreshCw, Minus, Square, X, Sun, Moon, Monitor } from 'lucide-react'
import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'
import { useEditorStore } from '@/stores/editor.store'
import { LANGUAGE_ICON_CHARS } from '@/i18n/resources'
import type { SupportedLocale } from '@/i18n/resources'
import { AboutDialog } from '@/components/dialogs/AboutDialog'
import { AppLogo } from '@/components/common'
import { UpdatePopover } from './UpdatePopover'
import { LanguagePopover } from './LanguagePopover'
import { ThemePopover } from './ThemePopover'
import type { UpdateStatus } from '@/types/ipc'

interface HeaderProps {
  onCheatsheet?: () => void
}

export function Header({ onCheatsheet }: HeaderProps) {
  const { t } = useTranslation()
  const isDark = useUIStore((s) => s.isDark)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  const language = useUIStore((s) => s.language)
  const setLanguage = useUIStore((s) => s.setLanguage)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const togglePanel = useUIStore((s) => s.togglePanel)
  const setActiveActivity = useUIStore((s) => s.setActiveActivity)
  const sidebarVisible = useUIStore((s) => s.sidebarVisible)
  const panelVisible = useUIStore((s) => s.panelVisible)
  const setActivePanel = useUIStore((s) => s.setActivePanel)
  const saveActiveTab = useEditorStore((s) => s.saveActiveTab)
  const createProject = useProjectStore((s) => s.createProject)

  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [restartPromptOpen, setRestartPromptOpen] = useState(false)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [updateBusy, setUpdateBusy] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Popover 状态
  const [updatePopoverOpen, setUpdatePopoverOpen] = useState(false)
  const [langPopoverOpen, setLangPopoverOpen] = useState(false)
  const [themePopoverOpen, setThemePopoverOpen] = useState(false)

  // 窗口控制状态
  const [isMaximized, setIsMaximized] = useState(false)
  const isWin = window.electron?.versions?.platform === 'win32'

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    if (openMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenu])

  // 监听自动更新下载完成
  useEffect(() => {
    const cleanup = window.electron?.app?.onUpdateStatus((status) => {
      setUpdateStatus(status)
      setUpdateBusy(status.status === 'checking' || status.status === 'downloading')
      if (status.status === 'downloaded') {
        setUpdateDownloaded(true)
        setRestartPromptOpen(true)
      }
    })
    return cleanup
  }, [])

  // 监听窗口最大化状态变化
  useEffect(() => {
    const cleanup = window.electron?.window?.onMaximizeChange((maximized) => {
      setIsMaximized(maximized)
    })
    return cleanup
  }, [])

  // 菜单键盘导航：Alt+首字母打开对应菜单
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      const menuKeys: Record<string, string> = {
        f: 'file',
        e: 'edit',
        v: 'view',
        t: 'tools',
        h: 'help',
      }
      const menuId = menuKeys[e.key.toLowerCase()]
      if (menuId) {
        e.preventDefault()
        setOpenMenu((prev) => (prev === menuId ? null : menuId))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  const handleMenuClick = (menu: string) => {
    setOpenMenu(openMenu === menu ? null : menu)
  }

  const closeMenu = () => setOpenMenu(null)

  // === 文件菜单 handlers ===
  const handleNewProject = useCallback(async () => {
    const name = `Project_${Date.now().toString(36).toUpperCase()}`
    await createProject(name)
    closeMenu()
  }, [createProject])

  const handleOpenProjectDir = useCallback(async () => {
    try {
      const workspacePath = await window.electron?.app?.getPath('workspace')
      if (workspacePath) {
        window.electron?.shell?.showItemInFolder(workspacePath)
      }
    } catch {}
    closeMenu()
  }, [])

  const handleSaveFile = useCallback(() => {
    saveActiveTab()
    closeMenu()
  }, [saveActiveTab])

  const handleRefresh = useCallback(() => {
    window.location.reload()
    closeMenu()
  }, [])

  const handleExit = useCallback(() => {
    window.close()
    closeMenu()
  }, [])

  // === 编辑菜单 handlers ===
  const handleUndo = useCallback(() => {
    document.execCommand('undo')
    closeMenu()
  }, [])

  const handleRedo = useCallback(() => {
    document.execCommand('redo')
    closeMenu()
  }, [])

  const handleCopy = useCallback(() => {
    document.execCommand('copy')
    closeMenu()
  }, [])

  const handlePaste = useCallback(() => {
    document.execCommand('paste')
    closeMenu()
  }, [])

  const handleCheatsheet = useCallback(() => {
    onCheatsheet?.()
    closeMenu()
  }, [onCheatsheet])

  // === 视图菜单 handlers ===
  const handleGoToActivity = useCallback(
    (activity: string) => {
      setActiveActivity(activity as any)
      closeMenu()
    },
    [setActiveActivity],
  )

  const handleToggleSidebar = useCallback(() => {
    toggleSidebar()
    closeMenu()
  }, [toggleSidebar])

  const handleTogglePanel = useCallback(() => {
    togglePanel()
    closeMenu()
  }, [togglePanel])

  // === 工具菜单 handlers ===
  const handleCheckUpdate = useCallback(async () => {
    setUpdateBusy(true)
    try {
      await window.electron?.app?.checkUpdate()
    } catch {}
    closeMenu()
  }, [])

  const handleDownloadUpdate = useCallback(async () => {
    setUpdateBusy(true)
    try {
      await window.electron?.app?.downloadUpdate()
    } catch {}
    closeMenu()
  }, [])

  const handleInstallUpdate = useCallback(async () => {
    try {
      await window.electron?.app?.quitAndInstall()
    } catch {}
  }, [])

  const handleTerminal = useCallback(() => {
    setActivePanel('terminal')
    closeMenu()
  }, [setActivePanel])

  const handleLogViewer = useCallback(() => {
    setActivePanel('log')
    closeMenu()
  }, [setActivePanel])

  // === 帮助菜单 handlers ===
  const handleUserGuide = useCallback(async () => {
    try {
      const lang = await window.electron?.app?.getLanguage() || 'zh-CN'
      const content = await window.electron?.guide?.getContent(lang)
      if (content) {
        useEditorStore.getState().openFile({
          id: 'user-guide',
          title: 'MagicCommander User Guide',
          filePath: 'docs/user-guide.md',
          fileType: 'markdown',
          projectId: '',
          projectName: '',
          isDirty: false,
          content,
          isReadOnly: true,
        } as any)
      }
    } catch {}
    closeMenu()
  }, [])

  const handleAbout = useCallback(() => {
    setAboutOpen(true)
    closeMenu()
  }, [])

  const handleRestart = useCallback(async () => {
    try {
      await window.electron?.app?.quitAndInstall()
    } catch {}
    setRestartPromptOpen(false)
  }, [])

  // 窗口控制
  const handleMinimize = useCallback(() => {
    window.electron?.window?.minimize()
  }, [])

  const handleMaximize = useCallback(() => {
    window.electron?.window?.maximize()
  }, [])

  const handleClose = useCallback(() => {
    window.electron?.window?.close()
  }, [])

  // 切换主题
  const handleSelectTheme = useCallback((t: 'light' | 'dark' | 'system') => {
    setTheme(t)
  }, [setTheme])

  // 切换语言
  const handleSelectLanguage = useCallback((lang: string) => {
    setLanguage(lang)
  }, [setLanguage])

  const themeIcon = theme === 'light' ? <Sun size={14} /> : theme === 'dark' ? <Moon size={14} /> : <Monitor size={14} />

  // 菜单项渲染辅助函数
  const renderMenuItem = (
    key: string,
    label: string,
    shortcut?: string,
    onClick?: () => void,
    disabled?: boolean,
  ) => (
    <button
      key={key}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'w-full flex items-center justify-between px-3 py-1.5 text-xs text-left',
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'hover:bg-blue-50 dark:hover:bg-blue-900/30',
        isDark ? 'text-gray-200' : 'text-gray-700',
      )}
    >
      <span>{label}</span>
      {shortcut && (
        <span className={clsx('ml-4 text-[11px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
          {shortcut}
        </span>
      )}
    </button>
  )

  const renderSeparator = (key: string) => (
    <div key={key} className={clsx('my-1 border-t', isDark ? 'border-gray-700' : 'border-gray-200')} />
  )

  // 菜单定义
  const menus: Record<string, React.ReactNode[]> = {
    file: [
      renderMenuItem('newProject', t('menu.newProject'), 'Ctrl+N', handleNewProject),
      renderMenuItem('openProjectDir', t('menu.openProjectDir'), '', handleOpenProjectDir),
      renderSeparator('sep-f1'),
      renderMenuItem('saveFile', t('menu.saveFile'), 'Ctrl+S', handleSaveFile),
      renderSeparator('sep-f2'),
      renderMenuItem('settings', t('common:settings.title'), 'Ctrl+,', () => handleGoToActivity('settings')),
      renderSeparator('sep-f3'),
      renderMenuItem('refresh', t('app.refresh'), 'F5', handleRefresh),
      renderSeparator('sep-f4'),
      renderMenuItem('exit', t('menu.exit'), 'Alt+F4', handleExit),
    ],
    edit: [
      renderMenuItem('undo', t('menu.undo'), 'Ctrl+Z', handleUndo),
      renderMenuItem('redo', t('menu.redo'), 'Ctrl+Y', handleRedo),
      renderSeparator('sep-e1'),
      renderMenuItem('copy', t('menu.copy'), 'Ctrl+C', handleCopy),
      renderMenuItem('paste', t('menu.paste'), 'Ctrl+V', handlePaste),
      renderSeparator('sep-e2'),
      renderMenuItem('cheatsheet', t('menu.cheatsheet'), 'Ctrl+K S', handleCheatsheet),
    ],
    view: [
      renderMenuItem('chat', t('menu.chat'), 'Ctrl+Shift+H', () => handleGoToActivity('chat')),
      renderMenuItem('search', t('common:sidebar.search'), 'Ctrl+Shift+F', () => handleGoToActivity('search')),
      renderMenuItem('explorer', t('common:sidebar.explorer'), 'Ctrl+Shift+E', () => handleGoToActivity('explorer')),
      renderMenuItem('workbench', t('menu.workbench'), 'Ctrl+Shift+W', () => handleGoToActivity('workbench')),
      renderMenuItem('output', t('menu.outputResults'), 'Ctrl+Shift+O', () => handleGoToActivity('output')),
      renderSeparator('sep-v1'),
      renderMenuItem(
        'sidebar',
        sidebarVisible ? t('menu.hideSidebar') : t('menu.showSidebar'),
        'Ctrl+B',
        handleToggleSidebar,
      ),
      renderMenuItem(
        'panel',
        panelVisible ? t('menu.hidePanel') : t('menu.showPanel'),
        'Ctrl+J',
        handleTogglePanel,
      ),
    ],
    tools: [
      renderMenuItem('checkUpdate', t('menu.checkUpdate'), '', handleCheckUpdate),
      renderSeparator('sep-t1'),
      renderMenuItem('terminal', t('menu.terminal'), '', handleTerminal),
      renderMenuItem('logViewer', t('menu.logViewer'), '', handleLogViewer),
    ],
    help: [
      renderMenuItem('userGuide', t('menu.userGuide'), 'F1', handleUserGuide),
      renderSeparator('sep-h1'),
      renderMenuItem('about', t('menu.about'), '', handleAbout),
    ],
  }

  const menuOrder: { id: string; label: string }[] = [
    { id: 'file', label: t('menu.file') },
    { id: 'edit', label: t('menu.edit') },
    { id: 'view', label: t('menu.view') },
    { id: 'tools', label: t('menu.tools') },
    { id: 'help', label: t('menu.help') },
  ]

  return (
    <>
      <header
        ref={menuRef}
        className={clsx(
          'h-10 flex items-center shrink-0 border-b select-none',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-200',
        )}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Logo */}
        <div className="flex items-center px-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <AppLogo size={22} isDark={isDark} />
        </div>

        {/* 菜单栏 */}
        <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {menuOrder.map((menu) => (
            <div key={menu.id} className="relative h-full">
              <button
                onClick={() => handleMenuClick(menu.id)}
                className={clsx(
                  'h-full px-2.5 text-xs font-medium transition-colors',
                  openMenu === menu.id
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : isDark
                      ? 'text-gray-300 hover:bg-gray-700'
                      : 'text-gray-600 hover:bg-gray-200',
                )}
              >
                <span className="underline decoration-dotted underline-offset-[3px]">{menu.label[0]}</span>
                {menu.label.slice(1)}
              </button>
              {openMenu === menu.id && (
                <div
                  className={clsx(
                    'absolute top-full left-0 z-50 min-w-[200px] py-1 rounded-b shadow-lg border',
                    isDark
                      ? 'bg-gray-800 border-gray-700'
                      : 'bg-white border-gray-200',
                  )}
                >
                  {menus[menu.id]}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 右侧：标题 */}
        <div className="flex-1 flex items-center justify-center">
          <span className={clsx('text-xs font-medium', isDark ? 'text-gray-400' : 'text-gray-500')}>
            MagicCommander
          </span>
        </div>

        {/* 右侧：快捷操作 */}
        <div className="flex items-center gap-0.5 px-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* 切换语言 */}
          <div className="relative">
            <button
              onClick={() => { setLangPopoverOpen(!langPopoverOpen); setThemePopoverOpen(false); setUpdatePopoverOpen(false) }}
              className={clsx(
                'p-1.5 rounded transition-colors',
                isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500',
              )}
              title={t('menu.language')}
            >
              <span className="text-xs font-bold w-4 h-4 flex items-center justify-center select-none">{LANGUAGE_ICON_CHARS[language as keyof typeof LANGUAGE_ICON_CHARS] || 'A'}</span>
            </button>
            <LanguagePopover
              open={langPopoverOpen}
              onClose={() => setLangPopoverOpen(false)}
              isDark={isDark}
              currentLanguage={language}
              onSelect={handleSelectLanguage}
            />
          </div>

          {/* 切换主题 */}
          <div className="relative">
            <button
              onClick={() => { setThemePopoverOpen(!themePopoverOpen); setLangPopoverOpen(false); setUpdatePopoverOpen(false) }}
              className={clsx(
                'p-1.5 rounded transition-colors',
                isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500',
              )}
              title={t('common:settings.appearance.title')}
            >
              {themeIcon}
            </button>
            <ThemePopover
              open={themePopoverOpen}
              onClose={() => setThemePopoverOpen(false)}
              isDark={isDark}
              currentTheme={theme}
              onSelect={handleSelectTheme}
            />
          </div>

          {/* 检查更新 */}
          <div className="relative">
            <button
              onClick={() => { setUpdatePopoverOpen(!updatePopoverOpen); setLangPopoverOpen(false); setThemePopoverOpen(false) }}
              className={clsx(
                'relative p-1.5 rounded transition-colors',
                isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500',
              )}
              title={t('menu.checkUpdate')}
            >
              <RefreshCw size={14} />
              {updateDownloaded && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-blue-500" />
              )}
            </button>
            <UpdatePopover
              open={updatePopoverOpen}
              onClose={() => setUpdatePopoverOpen(false)}
              isDark={isDark}
              updateStatus={updateStatus}
              updateBusy={updateBusy}
              updateDownloaded={updateDownloaded}
              onCheckUpdate={handleCheckUpdate}
              onDownloadUpdate={handleDownloadUpdate}
              onInstallUpdate={handleInstallUpdate}
            />
          </div>
        </div>

        {/* 窗口控制按钮（仅 Windows） */}
        {isWin && (
          <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={handleMinimize}
              className={clsx(
                'h-full w-11 flex items-center justify-center transition-colors',
                isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500',
              )}
              title={t('common:window.minimize')}
            >
              <Minus size={14} />
            </button>
            <button
              onClick={handleMaximize}
              className={clsx(
                'h-full w-11 flex items-center justify-center transition-colors',
                isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500',
              )}
              title={isMaximized ? t('common:window.restore') : t('common:window.maximize')}
            >
              <Square size={12} />
            </button>
            <button
              onClick={handleClose}
              className={clsx(
                'h-full w-11 flex items-center justify-center transition-colors',
                'hover:bg-red-500 hover:text-white',
                isDark ? 'text-gray-400' : 'text-gray-500',
              )}
              title={t('common:window.close')}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </header>

      {/* 关于对话框 */}
      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        version="3.5.0"
        updateStatus={updateStatus}
        updateBusy={updateBusy}
        onCheckUpdate={handleCheckUpdate}
        onDownloadUpdate={handleDownloadUpdate}
        onInstallUpdate={handleInstallUpdate}
      />

      {/* 重启提示对话框 */}
      {restartPromptOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div
            className={clsx(
              'rounded-lg shadow-xl p-6 max-w-sm w-full mx-4',
              isDark ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900',
            )}
          >
            <h3 className="text-base font-semibold mb-2">{t('updates.title')}</h3>
            <p className={clsx('text-sm mb-4', isDark ? 'text-gray-300' : 'text-gray-600')}>
              {t('updates.restartHint')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRestartPromptOpen(false)}
                className={clsx(
                  'px-3 py-1.5 text-xs rounded',
                  isDark
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                )}
              >
                {t('updates.later')}
              </button>
              <button
                onClick={handleRestart}
                className="px-3 py-1.5 text-xs rounded bg-blue-500 text-white hover:bg-blue-600"
              >
                {t('updates.restart')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}