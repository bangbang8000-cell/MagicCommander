/**
 * 空状态页面组件
 * 为列表、搜索结果等空状态提供友好提示
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
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

const DEFAULT_CONTENT_KEYS: Record<string, { titleKey: string; descriptionKey: string; icon: LucideIcon }> = {
  projects: {
    titleKey: 'common:emptyState.noProjects',
    descriptionKey: 'common:emptyState.noProjectsDesc',
    icon: FolderOpen,
  },
  files: {
    titleKey: 'common:emptyState.noFiles',
    descriptionKey: 'common:emptyState.noFilesDesc',
    icon: FileText,
  },
  search: {
    titleKey: 'common:emptyState.noResults',
    descriptionKey: 'common:emptyState.noResultsDesc',
    icon: Search,
  },
  output: {
    titleKey: 'common:emptyState.noOutput',
    descriptionKey: 'common:emptyState.noOutputDesc',
    icon: FileOutput,
  },
  templates: {
    titleKey: 'common:emptyState.noTemplates',
    descriptionKey: 'common:emptyState.noTemplatesDesc',
    icon: ClipboardList,
  },
  excel: {
    titleKey: 'common:emptyState.noExcel',
    descriptionKey: 'common:emptyState.noExcelDesc',
    icon: FileSpreadsheet,
  },
  general: {
    titleKey: 'common:emptyState.noContent',
    descriptionKey: 'common:emptyState.noContentDesc',
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
  const { t } = useTranslation()
  const defaultContent = DEFAULT_CONTENT_KEYS[type] || DEFAULT_CONTENT_KEYS.general
  const IconComponent = defaultContent.icon
  
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {/* 图标 */}
      <IconComponent size={48} className={clsx('mb-4', isDark ? 'text-gray-600' : 'text-gray-400')} />
      
      {/* 标题 */}
      <h3 className={clsx('text-lg font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
        {title || t(defaultContent.titleKey)}
      </h3>
      
      {/* 描述 */}
      <p className={clsx('text-sm mb-6 max-w-md', isDark ? 'text-gray-400' : 'text-gray-500')}>
        {description || t(defaultContent.descriptionKey)}
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
  title,
  message,
  retryText,
  onRetry,
  isDark = false,
}: ErrorStateProps) {
  const { t } = useTranslation()
  const finalTitle = title || t('common:emptyState.loadFailed')
  const finalRetryText = retryText || t('common:emptyState.reload')
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {/* 图标 */}
      <AlertTriangle size={48} className="mb-4 text-red-400" />
      
      {/* 标题 */}
      <h3 className={clsx('text-lg font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
        {finalTitle}
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
          {finalRetryText}
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
  title,
  message,
  isDark = false,
}: NoPermissionStateProps) {
  const { t } = useTranslation()
  const finalTitle = title || t('common:emptyState.noPermission')
  const finalMessage = message || t('common:emptyState.noPermissionDesc')
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {/* 图标 */}
      <Lock size={48} className="mb-4 text-yellow-400" />
      
      {/* 标题 */}
      <h3 className={clsx('text-lg font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
        {finalTitle}
      </h3>
      
      {/* 消息 */}
      <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-500')}>
        {finalMessage}
      </p>
    </div>
  )
}