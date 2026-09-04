import { useTranslation } from 'react-i18next'
import { useUIStore, type ActivityType } from '@/stores/ui.store'
import { X } from 'lucide-react'
import clsx from 'clsx'
import type { ReactNode } from 'react'

interface SidebarProps {
  panels: Record<string, ReactNode>
}

export function Sidebar({ panels }: SidebarProps) {
  const { t } = useTranslation()
  const activeActivity = useUIStore((s) => s.activeActivity)
  const sidebarVisible = useUIStore((s) => s.sidebarVisible)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const isDark = useUIStore((s) => s.isDark)

  if (!sidebarVisible) return null

  // MC-M2e / MC-I18-2: 面板标题在每次渲染时用 t() 求值（语言切换经 useTranslation 订阅触发
  // 重渲染即时更新），不依赖模块顶层静态对象缓存，杜绝切换语言后标题停留在旧语言。
  const panelTitle: Record<ActivityType, string> = {
    cloud: t('nav:cloud'),
    search: t('nav:search'),
    explorer: t('nav:explorer'),
    output: t('nav:output'),
    workbench: t('nav:workbench'),
    chat: t('nav:chat'),
    settings: t('nav:settings'),
    doc: t('nav:doc'),
  }

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
          'flex items-center justify-between px-3 py-1 border-b shrink-0',
          isDark ? 'border-gray-700/50 bg-gray-900/40' : 'border-gray-200 bg-gray-50',
        )}
      >
        <h3 className={clsx('type-caption font-medium', isDark ? 'text-gray-400' : 'text-gray-500')}>
          {panelTitle[activeActivity] || t('common:noContent')}
        </h3>
        <button
          onClick={toggleSidebar}
          className={clsx(
            'p-0.5 rounded transition-colors',
            isDark
              ? 'text-gray-400 hover:text-gray-100 hover:bg-gray-700'
              : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200',
          )}
          title={t('sidebar.collapse')}
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden min-h-0">
        {activePanel || (
          <div
            className={clsx(
              'flex items-center justify-center h-full text-xs',
              isDark ? 'text-gray-500' : 'text-gray-400',
            )}
          >
            {t('common:noContent')}
          </div>
        )}
      </div>
    </aside>
  )
}
