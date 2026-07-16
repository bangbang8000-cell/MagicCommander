import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppVersion, useBuildInfo } from '@/hooks/useAppVersion'
import { useUIStore } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
import { errorService } from '@/services/errorService'
import i18n from '@/i18n'
import { LOCALE_NAMES, type SupportedLocale } from '@/i18n/resources'
import {
  Settings,
  RefreshCw,
  Moon,
  Sun,
  HelpCircle,
  FolderPlus,
  FolderOpen,
  Search,
  PlayCircle,
  Tag,
  FileOutput,
  ChevronDown,
  Monitor,
  Info,
  Languages,
} from 'lucide-react'
import clsx from 'clsx'
import { MarkdownViewer } from '@/components/common/MarkdownViewer'
import { AboutDialog } from '@/components/dialogs/AboutDialog'
import { Modal } from '@/components/ui/Modal'
import type { UpdateStatus } from '@/types/ipc'

interface MenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  shortcut?: string
  action?: () => void
  divider?: boolean
  disabled?: boolean
}

interface MenuGroup {
  id: string
  label: string
  items: MenuItem[]
}

export function Header() {
  const { t } = useTranslation()
  const version = useAppVersion()
  const buildInfo = useBuildInfo()
  const isDark = useUIStore((s) => s.isDark)
  const toggleDark = useUIStore((s) => s.toggleDark)
  const setWelcomeOpen = useUIStore((s) => s.setWelcomeOpen)
  const setActiveActivity = useUIStore((s) => s.setActiveActivity)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const sidebarVisible = useUIStore((s) => s.sidebarVisible)
  const selectedProject = useProjectStore((s) => s.selectedProject)
  const triggerCreateProject = useProjectStore((s) => s.triggerCreateProject)

  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideContent, setGuideContent] = useState('')
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [updateBusy, setUpdateBusy] = useState(false)
  const [restartPromptOpen, setRestartPromptOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const langMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!window.electron?.app?.onUpdateStatus) return
    return window.electron.app.onUpdateStatus((status) => {
      setUpdateStatus(status)
      setUpdateBusy(status.status === 'checking' || status.status === 'downloading')
      // 自动下载完成后，弹出重启提示
      if (status.status === 'downloaded') {
        setRestartPromptOpen(true)
      }
    })
  }, [])

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null)
      }
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleRefresh = () => {
    window.location.reload()
    setActiveMenu(null)
  }

  const handleHelp = async () => {
    setActiveMenu(null)
    // 加载使用指南（通过 IPC 根据当前语言读取）
    try {
      const text = await window.electron.guide.getContent(i18n.language)
      setGuideContent(text)
    } catch (err) {
      errorService.handleError(err, 'Header.loadGuide')
      setGuideContent(t('menu.guideLoadFailed'))
    }
    setGuideOpen(true)
  }

  const handleAbout = () => {
    setAboutOpen(true)
    setActiveMenu(null)
  }

  const handleCheckUpdate = async () => {
    if (!window.electron?.app?.checkUpdate) return
    setUpdateBusy(true)
    setUpdateStatus({ status: 'checking' })
    try {
      await window.electron.app.checkUpdate()
    } catch (err) {
      setUpdateStatus({ status: 'error', error: (err as Error).message })
      setUpdateBusy(false)
    }
  }

  const handleDownloadUpdate = async () => {
    if (!window.electron?.app?.downloadUpdate) return
    setUpdateBusy(true)
    try {
      await window.electron.app.downloadUpdate()
    } catch (err) {
      setUpdateStatus({ status: 'error', error: (err as Error).message })
      setUpdateBusy(false)
    }
  }

  const handleInstallUpdate = async () => {
    if (!window.electron?.app?.quitAndInstall) return
    await window.electron.app.quitAndInstall()
  }

  const handleNewProject = () => {
    // 确保侧边栏可见并切换到项目浏览器（ExplorerPanel 挂载后才会响应创建对话框触发）
    if (!sidebarVisible) toggleSidebar()
    setActiveActivity('explorer')
    triggerCreateProject()
    setActiveMenu(null)
  }

  const handleOpenProjectDir = async () => {
    if (selectedProject) {
      const workspacePath = await window.electron.app.getPath('workspace')
      window.electron.shell.showItemInFolder(`${workspacePath}/${selectedProject.name}`)
    }
    setActiveMenu(null)
  }

  const handleSwitchPanel = (activity: string) => {
    if (!sidebarVisible) toggleSidebar()
    setActiveActivity(activity as any)
    setActiveMenu(null)
  }

  const handleLanguageChange = (lng: SupportedLocale) => {
    i18n.changeLanguage(lng)
    useUIStore.getState().setLanguage(lng)
    setLangMenuOpen(false)
    // 同步主进程
    if (window.electron?.app?.setLanguage) {
      window.electron.app.setLanguage(lng)
    }
  }

  const menus: MenuGroup[] = [
    {
      id: 'file',
      label: t('menu.file'),
      items: [
        { id: 'new-project', label: t('menu.newProject'), icon: <FolderPlus size={14} />, action: handleNewProject },
        {
          id: 'open-dir',
          label: t('menu.openProjectDir'),
          icon: <FolderOpen size={14} />,
          action: handleOpenProjectDir,
          disabled: !selectedProject,
        },
        { divider: true, id: 'div1', label: '' },
        {
          id: 'refresh',
          label: t('app.refresh'),
          icon: <RefreshCw size={14} />,
          shortcut: 'F5',
          action: handleRefresh,
        },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
      items: [
        {
          id: 'search',
          label: t('app.search'),
          icon: <Search size={14} />,
          shortcut: 'Ctrl+Shift+F',
          action: () => handleSwitchPanel('search'),
        },
        {
          id: 'explorer',
          label: t('menu.projectExplorer'),
          icon: <FolderOpen size={14} />,
          shortcut: 'Ctrl+Shift+E',
          action: () => handleSwitchPanel('explorer'),
        },
        {
          id: 'render',
          label: t('menu.renderOperations'),
          icon: <PlayCircle size={14} />,
          shortcut: 'Ctrl+Shift+R',
          action: () => handleSwitchPanel('render'),
        },
        {
          id: 'label',
          label: t('menu.labelPrint'),
          icon: <Tag size={14} />,
          shortcut: 'Ctrl+Shift+L',
          action: () => handleSwitchPanel('label'),
        },
        {
          id: 'output',
          label: t('menu.outputResults'),
          icon: <FileOutput size={14} />,
          shortcut: 'Ctrl+Shift+O',
          action: () => handleSwitchPanel('output'),
        },
        { divider: true, id: 'div2', label: '' },
        {
          id: 'toggle-sidebar',
          label: t(sidebarVisible ? 'menu.hideSidebar' : 'menu.showSidebar'),
          icon: <Monitor size={14} />,
          shortcut: 'Ctrl+B',
          action: () => {
            toggleSidebar()
            setActiveMenu(null)
          },
        },
        { divider: true, id: 'div3', label: '' },
        {
          id: 'theme',
          label: t(isDark ? 'menu.lightMode' : 'menu.darkMode'),
          icon: isDark ? <Sun size={14} /> : <Moon size={14} />,
          action: () => {
            toggleDark()
            setActiveMenu(null)
          },
        },
      ],
    },
    {
      id: 'help',
      label: t('menu.help'),
      items: [
        { id: 'guide', label: t('menu.userGuide'), icon: <HelpCircle size={14} />, action: handleHelp },
        { divider: true, id: 'div4', label: '' },
        { id: 'about', label: t('menu.about'), icon: <Info size={14} />, action: handleAbout },
      ],
    },
  ]

  const renderMenuDropdown = (menu: MenuGroup) => {
    if (activeMenu !== menu.id) return null

    return (
      <div
        className={clsx(
          'absolute top-full start-0 mt-1 min-w-[180px] rounded-md shadow-lg z-50 py-1',
          'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
        )}
      >
        {menu.items.map((item) => {
          if (item.divider) {
            return <div key={item.id} className="my-1 h-px bg-gray-200 dark:bg-gray-700" />
          }
          return (
            <button
              key={item.id}
              onClick={item.action}
              disabled={item.disabled}
              className={clsx(
                'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-start transition-colors',
                item.disabled
                  ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700',
              )}
            >
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              <span className="flex-1">{item.label}</span>
              {item.shortcut && <span className="text-xs text-gray-400 dark:text-gray-500">{item.shortcut}</span>}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <header
      className={clsx(
        'h-12 flex items-center justify-between px-4 shrink-0 relative',
        'bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700',
      )}
    >
      {/* Logo 和标题 */}
      <div className="flex items-center gap-2.5">
        <div
          className={clsx(
            'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold',
            'bg-primary-500 text-white',
          )}
        >
          M
        </div>
        <div>
          <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">MagicCommander</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('app.subtitle')}</p>
        </div>
      </div>

      {/* 菜单区 */}
      <div ref={menuRef} className="flex items-center gap-1">
        {menus.map((menu) => (
          <div key={menu.id} className="relative">
            <button
              onClick={() => setActiveMenu(activeMenu === menu.id ? null : menu.id)}
              className={clsx(
                'px-3 py-1.5 text-sm rounded-md flex items-center gap-1 transition-colors',
                activeMenu === menu.id
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
              )}
            >
              {menu.label}
              <ChevronDown size={12} />
            </button>
            {renderMenuDropdown(menu)}
          </div>
        ))}

        {/* 右侧工具按钮 */}
        <div className="flex items-center gap-0.5 ms-2 ps-2 border-s border-gray-200 dark:border-gray-700">
          {/* 语言切换 */}
          <div ref={langMenuRef} className="relative">
            <button
              onClick={() => setLangMenuOpen(!langMenuOpen)}
              className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={t('language.switch')}
            >
              <Languages size={16} />
            </button>
            {langMenuOpen && (
              <div
                className={clsx(
                  'absolute top-full end-0 mt-1 min-w-[140px] rounded-md shadow-lg z-50 py-1 max-h-[320px] overflow-y-auto',
                  'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
                )}
              >
                {(Object.keys(LOCALE_NAMES) as SupportedLocale[]).map((lng) => (
                  <button
                    key={lng}
                    onClick={() => handleLanguageChange(lng)}
                    className={clsx(
                      'w-full flex items-center justify-between px-3 py-1.5 text-sm text-start transition-colors',
                      i18n.language === lng
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-medium'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700',
                    )}
                  >
                    <span>{LOCALE_NAMES[lng]}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">{lng}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleHelp}
            className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={t('app.help')}
          >
            <HelpCircle size={16} />
          </button>
          <button
            onClick={toggleDark}
            className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={t(isDark ? 'menu.switchToLight' : 'menu.switchToDark')}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <span className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
            v{version}
            {buildInfo.build ? ` (${buildInfo.build})` : ''}
          </span>
        </div>
      </div>

      {/* 关于弹窗 */}
      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        version={version}
        displayVersion={buildInfo.displayVersion}
        build={buildInfo.build}
        updateStatus={updateStatus}
        updateBusy={updateBusy}
        onCheckUpdate={handleCheckUpdate}
        onDownloadUpdate={handleDownloadUpdate}
        onInstallUpdate={handleInstallUpdate}
      />

      {/* 更新下载完成重启提示 */}
      <Modal
        open={restartPromptOpen}
        onClose={() => setRestartPromptOpen(false)}
        title={t('updates.title')}
        width="360px"
        footer={
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setRestartPromptOpen(false)}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {t('updates.later')}
            </button>
            <button
              onClick={handleInstallUpdate}
              className="px-3 py-1.5 text-sm rounded-md bg-primary-500 text-white hover:bg-primary-600 transition-colors"
            >
              {t('updates.restart')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t('updates.downloaded')}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {t('updates.restartHint')}
        </p>
      </Modal>

      {/* 使用指南弹窗 */}
      {guideOpen && (
        <MarkdownViewer content={guideContent} title={t('menu.userGuide')} onClose={() => setGuideOpen(false)} />
      )}
    </header>
  )
}
