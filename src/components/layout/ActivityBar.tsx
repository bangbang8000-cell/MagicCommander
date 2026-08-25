import { useTranslation } from 'react-i18next'
import { useUIStore, type ActivityType } from '@/stores/ui.store'
import {
  Search,
  FolderOpen,
  Zap,
  FileCheck,
  MessageSquare,
  Settings,
  Cloud,
  PanelLeftClose,
  PanelLeft,
  HardDrive,
} from 'lucide-react'
import clsx from 'clsx'

interface ActivityItem {
  id: ActivityType
  icon: React.ReactNode
  labelKey: string
  shortcut: string
}

const activities: ActivityItem[] = [
  { id: 'search', icon: <Search size={20} />, labelKey: 'nav:search', shortcut: 'Ctrl+Shift+F' },
  { id: 'cloud', icon: <Cloud size={20} />, labelKey: 'nav:cloud', shortcut: 'Ctrl+Shift+C' },
  { id: 'chat', icon: <MessageSquare size={20} />, labelKey: 'nav:chat', shortcut: 'Ctrl+Shift+H' },
  { id: 'explorer', icon: <FolderOpen size={20} />, labelKey: 'nav:explorer', shortcut: 'Ctrl+Shift+E' },
  { id: 'workbench', icon: <Zap size={20} />, labelKey: 'nav:workbench', shortcut: 'Ctrl+Shift+W' },
  { id: 'output', icon: <FileCheck size={20} />, labelKey: 'nav:output', shortcut: 'Ctrl+Shift+O' },
  { id: 'settings', icon: <Settings size={20} />, labelKey: 'nav:settings', shortcut: 'Ctrl+,' },
]

/**
 * MC-M3l / MC-N1: 设备库一级入口预留（灰态 disabled 占位）。
 * MC 端本版不做设备库功能入口；与 AL 的 device_library 对齐，占位并提示使用 AL 端。
 */
const DEVICE_LIBRARY_PLACEHOLDER = true

/**
 * MC-M3j / MC-N2: 一级导航语义色映射（与 AL 对齐）。
 * search-teal / cloud-cyan / chat-fuchsia / explorer·workbench-primary / output-amber / settings-gray。
 * MC-N4: 激活条发光色不再硬编码绿色，而是按各入口语义色派生。
 */
const ACTIVITY_COLORS: Record<string, { text: string; bar: string; glow: string }> = {
  search: {
    text: 'text-teal-500 dark:text-teal-400',
    bar: 'bg-teal-500 dark:bg-teal-400',
    glow: 'rgba(20,184,166,0.45)',
  },
  cloud: {
    text: 'text-cyan-500 dark:text-cyan-400',
    bar: 'bg-cyan-500 dark:bg-cyan-400',
    glow: 'rgba(6,182,212,0.45)',
  },
  chat: {
    text: 'text-fuchsia-500 dark:text-fuchsia-400',
    bar: 'bg-fuchsia-500 dark:bg-fuchsia-400',
    glow: 'rgba(217,70,239,0.45)',
  },
  explorer: {
    text: 'text-primary-500 dark:text-primary-400',
    bar: 'bg-primary-500 dark:bg-primary-400',
    glow: 'rgba(59,130,246,0.45)',
  },
  workbench: {
    text: 'text-primary-500 dark:text-primary-400',
    bar: 'bg-primary-500 dark:bg-primary-400',
    glow: 'rgba(59,130,246,0.45)',
  },
  output: {
    text: 'text-amber-500 dark:text-amber-400',
    bar: 'bg-amber-500 dark:bg-amber-400',
    glow: 'rgba(245,158,11,0.45)',
  },
  settings: {
    text: 'text-gray-500 dark:text-gray-400',
    bar: 'bg-gray-500 dark:bg-gray-400',
    glow: 'rgba(107,114,128,0.45)',
  },
}

export function ActivityBar() {
  const { t } = useTranslation()
  const activeActivity = useUIStore((s) => s.activeActivity)
  const setActiveActivity = useUIStore((s) => s.setActiveActivity)
  const sidebarVisible = useUIStore((s) => s.sidebarVisible)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  // 打磨轮（v1.2 / M2）：云平台开关关闭时隐藏云一级菜单
  const cloudEnabled = useUIStore((s) => s.generalSettings.cloudEnabled)
  const items = activities.filter((a) => a.id !== 'cloud' || cloudEnabled)

  return (
    <div className="w-12 flex flex-col items-center py-2 gap-0.5 shrink-0 bg-gray-100 dark:bg-gray-900/80 border-e border-gray-200 dark:border-gray-700/50">
      <div className="flex-1 flex flex-col items-center gap-0.5 w-full">
        {items.map((item) => {
          const isActive = activeActivity === item.id
          const label = t(item.labelKey)
          const color = ACTIVITY_COLORS[item.id] ?? ACTIVITY_COLORS.workbench
          return (
            <button
              key={item.id}
              onClick={() => setActiveActivity(item.id)}
              title={`${label} (${item.shortcut})`}
              className={clsx(
                'w-12 h-12 flex items-center justify-center relative transition-colors',
                isActive
                  ? color.text
                  : 'text-gray-500 dark:text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-gray-200 dark:hover:bg-gray-700/50',
              )}
            >
              {isActive && (
                <div
                  className={clsx('absolute start-0 top-1.5 bottom-1.5 w-0.5 rounded-r', color.bar)}
                  style={{ boxShadow: `0 0 8px ${color.glow}` }}
                />
              )}
              {item.icon}
            </button>
          )
        })}
      </div>

      {/* MC-M3l / MC-N1: 设备库预留灰态入口（disabled，提示使用 AL 端） */}
      {DEVICE_LIBRARY_PLACEHOLDER && (
        <button
          type="button"
          disabled
          title={t('common:sidebar.deviceLibrary', { defaultValue: '设备库（MC 端暂不可用，请使用 AL 端）' })}
          className="w-12 h-12 flex items-center justify-center text-gray-300 dark:text-gray-600 cursor-not-allowed"
        >
          <HardDrive size={20} />
        </button>
      )}

      <button
        onClick={toggleSidebar}
        title={sidebarVisible ? t('menu.hideSidebar') : t('menu.showSidebar')}
        className="w-12 h-10 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        {sidebarVisible ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
      </button>
    </div>
  )
}
