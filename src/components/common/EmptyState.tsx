/**
 * 空状态页面组件
 * 为列表、搜索结果等空状态提供友好提示
 */

import React from 'react'
import { FolderOpen, FileText, Search, FileOutput, ClipboardList, FileSpreadsheet, Inbox, AlertTriangle, Lock, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'

interface EmptyStateProps {
  type: 'projects' | 'files' | 'search' | 'output' | 'templates' | 'excel' | 'general'
  title?: string
  description?: string
  actionText?: string
  onAction?: () => void
  isDark?: boolean
}

const DEFAULT_CONTENT: Record<string, { title: string; description: string; icon: LucideIcon }> = {
  projects: {
    title: '暂无项目',
    description: '点击左侧"新建项目"按钮创建您的第一个项目',
    icon: FolderOpen,
  },
  files: {
    title: '暂无文件',
    description: '当前目录下没有文件',
    icon: FileText,
  },
  search: {
    title: '未找到结果',
    description: '请尝试其他搜索关键词',
    icon: Search,
  },
  output: {
    title: '暂无输出文件',
    description: '请先执行配置渲染生成输出文件',
    icon: FileOutput,
  },
  templates: {
    title: '暂无模板文件',
    description: '请在 templates 目录下添加 Jinja2 模板文件',
    icon: ClipboardList,
  },
  excel: {
    title: '暂无参数表',
    description: '请在 excel 目录下添加 Excel 参数表文件',
    icon: FileSpreadsheet,
  },
  general: {
    title: '暂无内容',
    description: '当前没有可显示的内容',
    icon: Inbox,
  },
}

export function EmptyState({
  type,
  title,
  description,
  actionText,
  onAction,
  isDark = false,
}: EmptyStateProps) {
  const defaultContent = DEFAULT_CONTENT[type] || DEFAULT_CONTENT.general
  const IconComponent = defaultContent.icon
  
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {/* 图标 */}
      <IconComponent size={48} className={clsx('mb-4', isDark ? 'text-gray-600' : 'text-gray-400')} />
      
      {/* 标题 */}
      <h3 className={clsx('text-lg font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
        {title || defaultContent.title}
      </h3>
      
      {/* 描述 */}
      <p className={clsx('text-sm mb-6 max-w-md', isDark ? 'text-gray-400' : 'text-gray-500')}>
        {description || defaultContent.description}
      </p>
      
      {/* 操作按钮 */}
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
        >
          {actionText}
        </button>
      )}
    </div>
  )
}

/**
 * 错误状态组件
 */
interface ErrorStateProps {
  title?: string
  message: string
  retryText?: string
  onRetry?: () => void
  isDark?: boolean
}

export function ErrorState({
  title = '加载失败',
  message,
  retryText = '重新加载',
  onRetry,
  isDark = false,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {/* 图标 */}
      <AlertTriangle size={48} className="mb-4 text-red-400" />
      
      {/* 标题 */}
      <h3 className={clsx('text-lg font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
        {title}
      </h3>
      
      {/* 错误消息 */}
      <p className={clsx('text-sm mb-6 max-w-md', isDark ? 'text-gray-400' : 'text-gray-500')}>
        {message}
      </p>
      
      {/* 重试按钮 */}
      {onRetry && (
        <button
          onClick={onRetry}
          className={clsx(
            'px-4 py-2 rounded-lg transition-colors text-sm font-medium',
            isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          )}
        >
          {retryText}
        </button>
      )}
    </div>
  )
}

/**
 * 无权限状态组件
 */
interface NoPermissionStateProps {
  title?: string
  message?: string
  isDark?: boolean
}

export function NoPermissionState({
  title = '无访问权限',
  message = '您没有权限访问此内容',
  isDark = false,
}: NoPermissionStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {/* 图标 */}
      <Lock size={48} className="mb-4 text-yellow-400" />
      
      {/* 标题 */}
      <h3 className={clsx('text-lg font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
        {title}
      </h3>
      
      {/* 消息 */}
      <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-500')}>
        {message}
      </p>
    </div>
  )
}