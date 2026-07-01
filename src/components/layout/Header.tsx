import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppVersion } from '@/hooks/useAppVersion'
import { useUIStore } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
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
import { Modal } from '@/components/ui/Modal'
import { MarkdownViewer } from '@/components/common/MarkdownViewer'

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
  const isDark = useUIStore((s) => s.isDark)
  const toggleDark = useUIStore((s) => s.toggleDark)
  const setWelcomeOpen = useUIStore((s) => s.setWelcomeOpen)
  const setActiveActivity = useUIStore((s) => s.setActiveActivity)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const sidebarVisible = useUIStore((s) => s.sidebarVisible)
  const selectedProject = useProjectStore((s) => s.selectedProject)

  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideContent, setGuideContent] = useState('')
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const langMenuRef = useRef<HTMLDivElement>(null)

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
    // 加载使用指南
    if (!guideContent) {
      try {
        const response = await fetch('/docs/user-guide.md')
        const text = await response.text()
        setGuideContent(text)
      } catch (err) {
        console.error('加载使用指南失败:', err)
        setGuideContent(t('menu.guideLoadFailed'))
      }
    }
    setGuideOpen(true)
  }

  const handleAbout = () => {
    setAboutOpen(true)
    setActiveMenu(null)
  }

  const handleNewProject = () => {
    // 切换到项目浏览器面板，让用户使用那里的新建按钮
    if (!sidebarVisible) toggleSidebar()
    setActiveActivity('explorer')
    setActiveMenu(null)
  }

  const handleOpenProjectDir = async () => {
    if (selectedProject) {
      const backendPath = await window.electron.app.getPath('backend')
      window.electron.shell.showItemInFolder(`${backendPath}/${selectedProject.name}`)
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
        { id: 'open-dir', label: t('menu.openProjectDir'), icon: <FolderOpen size={14} />, action: handleOpenProjectDir, disabled: !selectedProject },
        { divider: true, id: 'div1', label: '' },
        { id: 'refresh', label: t('app.refresh'), icon: <RefreshCw size={14} />, shortcut: 'F5', action: handleRefresh },
      ],
    },
    {
      id: 'view',
      label: t('menu.view'),
      items: [
        { id: 'search', label: t('app.search'), icon: <Search size={14} />, shortcut: 'Ctrl+Shift+F', action: () => handleSwitchPanel('search') },
        { id: 'explorer', label: t('menu.projectExplorer'), icon: <FolderOpen size={14} />, shortcut: 'Ctrl+Shift+E', action: () => handleSwitchPanel('explorer') },
        { id: 'render', label: t('menu.renderOperations'), icon: <PlayCircle size={14} />, shortcut: 'Ctrl+Shift+R', action: () => handleSwitchPanel('render') },
        { id: 'label', label: t('menu.labelPrint'), icon: <Tag size={14} />, shortcut: 'Ctrl+Shift+L', action: () => handleSwitchPanel('label') },
        { id: 'output', label: t('menu.outputResults'), icon: <FileOutput size={14} />, shortcut: 'Ctrl+Shift+O', action: () => handleSwitchPanel('output') },
        { divider: true, id: 'div2', label: '' },
        { id: 'toggle-sidebar', label: t(sidebarVisible ? 'menu.hideSidebar' : 'menu.showSidebar'), icon: <Monitor size={14} />, shortcut: 'Ctrl+B', action: () => { toggleSidebar(); setActiveMenu(null) } },
        { divider: true, id: 'div3', label: '' },
        { id: 'theme', label: t(isDark ? 'menu.lightMode' : 'menu.darkMode'), icon: isDark ? <Sun size={14} /> : <Moon size={14} />, action: () => { toggleDark(); setActiveMenu(null) } },
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
          'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
        )}
      >
        {menu.items.map((item) => {
          if (item.divider) {
            return (
              <div
                key={item.id}
                className="my-1 h-px bg-gray-200 dark:bg-gray-700"
              />
            )
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
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
              )}
            >
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {item.shortcut}
                </span>
              )}
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
        'bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700'
      )}
    >
      {/* Logo 和标题 */}
      <div className="flex items-center gap-2.5">
        <div className={clsx(
          'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold',
          'bg-primary-500 text-white'
        )}>
          M
        </div>
        <div>
          <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">MagicCommander</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('app.subtitle')}
          </p>
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
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
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
              <div className={clsx(
                'absolute top-full end-0 mt-1 min-w-[140px] rounded-md shadow-lg z-50 py-1 max-h-[320px] overflow-y-auto',
                'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
              )}>
                {(Object.keys(LOCALE_NAMES) as SupportedLocale[]).map((lng) => (
                  <button
                    key={lng}
                    onClick={() => handleLanguageChange(lng)}
                    className={clsx(
                      'w-full flex items-center justify-between px-3 py-1.5 text-sm text-start transition-colors',
                      i18n.language === lng
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-medium'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
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
          </span>
        </div>
      </div>

      {/* 关于弹窗 */}
      <Modal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title={t('app.about')}
        width="420px"
        footer={
          <button
            onClick={() => setAboutOpen(false)}
            className="px-4 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {t('app.close')}
          </button>
        }
      >
        <div className="space-y-4">
          {/* Logo 和标题 */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold bg-primary-500 text-white">
              M
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">MagicCommander</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('app.version')} {version}
              </p>
            </div>
          </div>

          {/* 简介 */}
          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            {t('about.description')}
          </p>

          {/* 功能特性 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t('about.keyFeatures')}
            </h3>
            <ul className="text-sm space-y-1.5 text-gray-600 dark:text-gray-400">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0"></span>
                {t('about.feature1')}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0"></span>
                {t('about.feature2')}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0"></span>
                {t('about.feature3')}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0"></span>
                {t('about.feature4')}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0"></span>
                {t('about.feature5')}
              </li>
            </ul>
          </div>

          {/* 技术栈 */}
          <div className="text-xs text-center pt-3 border-t border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
            Electron + React + TypeScript + Vite + Zustand
          </div>
        </div>
      </Modal>

      {/* 使用指南弹窗 */}
      {guideOpen && (
        <MarkdownViewer
          content={guideContent}
          title={t('menu.userGuide')}
          onClose={() => setGuideOpen(false)}
        />
      )}
    </header>
  )
}