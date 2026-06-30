import { useState, useRef, useEffect } from 'react'
import { useAppVersion } from '@/hooks/useAppVersion'
import { useUIStore } from '@/stores/ui.store'
import { useProjectStore } from '@/stores/project.store'
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
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null)
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
        setGuideContent('# 加载失败\n\n无法加载使用指南，请稍后重试。')
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

  const menus: MenuGroup[] = [
    {
      id: 'file',
      label: '文件',
      items: [
        { id: 'new-project', label: '新建项目', icon: <FolderPlus size={14} />, action: handleNewProject },
        { id: 'open-dir', label: '打开项目目录', icon: <FolderOpen size={14} />, action: handleOpenProjectDir, disabled: !selectedProject },
        { divider: true, id: 'div1', label: '' },
        { id: 'refresh', label: '刷新', icon: <RefreshCw size={14} />, shortcut: 'F5', action: handleRefresh },
      ],
    },
    {
      id: 'view',
      label: '视图',
      items: [
        { id: 'search', label: '搜索', icon: <Search size={14} />, shortcut: 'Ctrl+Shift+F', action: () => handleSwitchPanel('search') },
        { id: 'explorer', label: '项目浏览器', icon: <FolderOpen size={14} />, shortcut: 'Ctrl+Shift+E', action: () => handleSwitchPanel('explorer') },
        { id: 'render', label: '渲染操作', icon: <PlayCircle size={14} />, shortcut: 'Ctrl+Shift+R', action: () => handleSwitchPanel('render') },
        { id: 'label', label: '标签打印', icon: <Tag size={14} />, shortcut: 'Ctrl+Shift+L', action: () => handleSwitchPanel('label') },
        { id: 'output', label: '输出结果', icon: <FileOutput size={14} />, shortcut: 'Ctrl+Shift+O', action: () => handleSwitchPanel('output') },
        { divider: true, id: 'div2', label: '' },
        { id: 'toggle-sidebar', label: sidebarVisible ? '隐藏侧边栏' : '显示侧边栏', icon: <Monitor size={14} />, shortcut: 'Ctrl+B', action: () => { toggleSidebar(); setActiveMenu(null) } },
        { divider: true, id: 'div3', label: '' },
        { id: 'theme', label: isDark ? '浅色模式' : '深色模式', icon: isDark ? <Sun size={14} /> : <Moon size={14} />, action: () => { toggleDark(); setActiveMenu(null) } },
      ],
    },
    {
      id: 'help',
      label: '帮助',
      items: [
        { id: 'guide', label: '使用指南', icon: <HelpCircle size={14} />, action: handleHelp },
        { divider: true, id: 'div4', label: '' },
        { id: 'about', label: '关于', icon: <Info size={14} />, action: handleAbout },
      ],
    },
  ]

  const renderMenuDropdown = (menu: MenuGroup) => {
    if (activeMenu !== menu.id) return null

    return (
      <div
        className={clsx(
          'absolute top-full left-0 mt-1 min-w-[180px] rounded-md shadow-lg z-50 py-1',
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
                'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors',
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
            网络设备配置管理工具
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
        <div className="flex items-center gap-0.5 ml-2 pl-2 border-l border-gray-200 dark:border-gray-700">
          <button
            onClick={handleHelp}
            className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="帮助"
          >
            <HelpCircle size={16} />
          </button>
          <button
            onClick={toggleDark}
            className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={isDark ? '切换到浅色模式' : '切换到深色模式'}
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
        title="关于 MagicCommander"
        width="420px"
        footer={
          <button
            onClick={() => setAboutOpen(false)}
            className="px-4 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            关闭
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
                版本 {version}
              </p>
            </div>
          </div>

          {/* 简介 */}
          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
            MagicCommander 是一款专业的网络设备配置管理工具，基于 Electron + React + TypeScript 构建。
            它可以帮助您高效地管理网络设备配置文件，支持 Excel 参数导入、Jinja2 模板渲染、批量输出配置等功能。
          </p>

          {/* 功能特性 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              主要功能
            </h3>
            <ul className="text-sm space-y-1.5 text-gray-600 dark:text-gray-400">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0"></span>
                项目管理 - 创建、编辑、删除网络设备配置项目
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0"></span>
                参数配置 - 支持 Excel 表格导入设备参数
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0"></span>
                模板渲染 - 使用 Jinja2 模板批量生成配置文件
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0"></span>
                标签打印 - 支持设备标签批量打印
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0"></span>
                YAML 输出 - 支持生成 YAML 格式配置文件
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
          title="使用指南"
          onClose={() => setGuideOpen(false)}
        />
      )}
    </header>
  )
}