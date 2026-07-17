import { useTranslation } from 'react-i18next'
import { useUIStore, type ActivityType } from '@/stores/ui.store'
import { Search, FolderOpen, Zap, FileCheck, MessageSquare, Wrench, Settings, PanelLeftClose, PanelLeft } from 'lucide-react'
import clsx from 'clsx'

interface ActivityItem {
  id: ActivityType
  icon: React.ReactNode
  labelKey: string
  shortcut: string
}

const ACTIVITY_LABEL_KEYS: Record<string, string> = {
  search: 'menu.projectExplorer',
  explorer: 'menu.projectExplorer',
  render: 'menu.renderOperations',
  output: 'menu.outputResults',
  chat: 'chat:title',
  workbench: 'menu.workbench',
  settings: 'common:settings.title',
}

const activities: ActivityItem[] = [
  { id: 'search', icon: <Search size={20} />, labelKey: 'common:sidebar.search', shortcut: 'Ctrl+Shift+F' },
  { id: 'chat', icon: <MessageSquare size={20} />, labelKey: 'chat:title', shortcut: 'Ctrl+Shift+H' },
  { id: 'explorer', icon: <FolderOpen size={20} />, labelKey: 'menu.projectExplorer', shortcut: 'Ctrl+Shift+E' },
  { id: 'render', icon: <Zap size={20} />, labelKey: 'menu.renderOperations', shortcut: 'Ctrl+Shift+R' },
  { id: 'output', icon: <FileCheck size={20} />, labelKey: 'menu.outputResults', shortcut: 'Ctrl+Shift+O' },
  { id: 'workbench', icon: <Wrench size={20} />, labelKey: 'menu.workbench', shortcut: 'Ctrl+Shift+W' },
  { id: 'settings', icon: <Settings size={20} />, labelKey: 'common:settings.title', shortcut: 'Ctrl+,' },
]

export function ActivityBar() {
  const { t } = useTranslation()
  const activeActivity = useUIStore((s) => s.activeActivity)
  const setActiveActivity = useUIStore((s) => s.setActiveActivity)
  const sidebarVisible = useUIStore((s) => s.sidebarVisible)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)

  return (
    <div className="w-12 flex flex-col items-center py-2 gap-0.5 shrink-0 bg-gray-100 dark:bg-gray-800 border-e border-gray-200 dark:border-gray-700">
      <div className="flex-1 flex flex-col items-center gap-0.5 w-full">
        {activities.map((item) => {
          const isActive = activeActivity === item.id
          const label = t(item.labelKey)
          return (
            <button
              key={item.id}
              onClick={() => setActiveActivity(item.id)}
              title={`${label} (${item.shortcut})`}
              className={clsx(
                'w-12 h-12 flex items-center justify-center relative transition-colors',
                isActive
                  ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-gray-700'
                  : 'text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-200 dark:hover:bg-gray-700',
              )}
            >
              {isActive && (
                <div className="absolute start-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary-500 dark:bg-primary-400" />
              )}
              {item.icon}
            </button>
          )
        })}
      </div>

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
