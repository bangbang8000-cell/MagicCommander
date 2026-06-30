import { useUIStore, type ActivityType } from '@/stores/ui.store'
import {
  Search,
  FolderOpen,
  PlayCircle,
  Tag,
  FileOutput,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import clsx from 'clsx'

interface ActivityItem {
  id: ActivityType
  icon: React.ReactNode
  label: string
  shortcut: string
}

const activities: ActivityItem[] = [
  { id: 'search', icon: <Search size={20} />, label: '搜索', shortcut: 'Ctrl+Shift+F' },
  { id: 'explorer', icon: <FolderOpen size={20} />, label: '项目浏览器', shortcut: 'Ctrl+Shift+E' },
  { id: 'render', icon: <PlayCircle size={20} />, label: '渲染操作', shortcut: 'Ctrl+Shift+R' },
  { id: 'label', icon: <Tag size={20} />, label: '标签打印', shortcut: 'Ctrl+Shift+L' },
  { id: 'output', icon: <FileOutput size={20} />, label: '输出结果', shortcut: 'Ctrl+Shift+O' },
]

export function ActivityBar() {
  const activeActivity = useUIStore((s) => s.activeActivity)
  const setActiveActivity = useUIStore((s) => s.setActiveActivity)
  const sidebarVisible = useUIStore((s) => s.sidebarVisible)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)

  return (
    <div className="w-12 flex flex-col items-center py-2 gap-0.5 shrink-0 bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
      <div className="flex-1 flex flex-col items-center gap-0.5 w-full">
        {activities.map((item) => {
          const isActive = activeActivity === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveActivity(item.id)}
              title={`${item.label} (${item.shortcut})`}
              className={clsx(
                'w-12 h-12 flex items-center justify-center relative transition-colors',
                isActive
                  ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-gray-700'
                  : 'text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary-500 dark:bg-primary-400" />
              )}
              {item.icon}
            </button>
          )
        })}
      </div>

      <button
        onClick={toggleSidebar}
        title={sidebarVisible ? '隐藏侧边栏' : '显示侧边栏'}
        className="w-12 h-10 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        {sidebarVisible ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
      </button>
    </div>
  )
}
