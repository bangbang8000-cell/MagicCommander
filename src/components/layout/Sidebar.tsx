import { useUIStore, type ActivityType } from '@/stores/ui.store'
import { X } from 'lucide-react'
import clsx from 'clsx'
import type { ReactNode } from 'react'

const PANEL_TITLES: Record<ActivityType, string> = {
  search: '搜索',
  explorer: '项目浏览器',
  render: '渲染操作',
  label: '标签打印',
  output: '输出结果',
  workbench: '工作台',
}

interface SidebarProps {
  panels: Record<string, ReactNode>
}

export function Sidebar({ panels }: SidebarProps) {
  const activeActivity = useUIStore((s) => s.activeActivity)
  const sidebarVisible = useUIStore((s) => s.sidebarVisible)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const isDark = useUIStore((s) => s.isDark)

  if (!sidebarVisible) return null

  const activePanel = panels[activeActivity]

  return (
    <aside
      className={clsx(
        'flex flex-col h-full animate-fade-in',
        isDark ? 'bg-gray-800 border-r border-gray-700 text-gray-200' : 'bg-white border-r border-gray-200',
      )}
      style={{ minWidth: '0' }}
    >
      <div
        className={clsx(
          'flex items-center justify-between px-3 py-2 border-b shrink-0',
          isDark ? 'border-gray-700 bg-gray-900/60' : 'border-gray-200 bg-gray-50 shadow-sm',
        )}
      >
        <h3
          className={clsx(
            'text-xs font-semibold uppercase tracking-wider',
            isDark ? 'text-gray-300' : 'text-gray-600',
          )}
        >
          {PANEL_TITLES[activeActivity]}
        </h3>
        <button
          onClick={toggleSidebar}
          className={clsx(
            'p-0.5 rounded transition-colors',
            isDark ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200',
          )}
          title="关闭侧边栏"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden min-h-0">
        {activePanel || (
          <div className={clsx('flex items-center justify-center h-full text-xs', isDark ? 'text-gray-500' : 'text-gray-400')}>
            暂无内容
          </div>
        )}
      </div>
    </aside>
  )
}
