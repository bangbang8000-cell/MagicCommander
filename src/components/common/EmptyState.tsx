/**
 * 空状态 / 错误状态 / 无权限状态组件
 * 4.1 F1-5：统一空态/加载/错误态视觉，契约 token 驱动。
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderOpen,
  FileText,
  Search,
  FileOutput,
  ClipboardList,
  FileSpreadsheet,
  Inbox,
  AlertTriangle,
  Lock,
  type LucideIcon,
} from 'lucide-react'

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

export function EmptyState({ type, title, description, actionText, onAction }: EmptyStateProps) {
  const { t } = useTranslation()
  const defaultContent = DEFAULT_CONTENT_KEYS[type] || DEFAULT_CONTENT_KEYS.general
  const IconComponent = defaultContent.icon

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {/* 图标 */}
      <IconComponent size={48} className="mb-4 text-text-muted" />

      {/* 标题 */}
      <h3 className="text-lg font-medium mb-2 text-text-primary">{title || t(defaultContent.titleKey)}</h3>

      {/* 描述 */}
      <p className="text-sm mb-6 max-w-md text-text-secondary">{description || t(defaultContent.descriptionKey)}</p>

      {/* 操作按钮 */}
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 bg-primary text-white rounded-[var(--radius-md)] hover:bg-primary-hover transition-colors text-sm font-medium"
        >
          {actionText}
        </button>
      )}
    </div>
  )
}

/**
 * 错误状态组件（4.1 F1-5：图标 + 主文案 + 错误消息 + 重试）
 */
interface ErrorStateProps {
  title?: string
  message: string
  retryText?: string
  onRetry?: () => void
  isDark?: boolean
}

export function ErrorState({ title, message, retryText, onRetry }: ErrorStateProps) {
  const { t } = useTranslation()
  const finalTitle = title || t('common:emptyState.loadFailed')
  const finalRetryText = retryText || t('common:emptyState.reload')
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {/* 图标 */}
      <AlertTriangle size={48} className="mb-4 text-danger" />

      {/* 标题 */}
      <h3 className="text-lg font-medium mb-2 text-text-primary">{finalTitle}</h3>

      {/* 错误消息 */}
      <p className="text-sm mb-6 max-w-md text-text-secondary">{message}</p>

      {/* 重试按钮 */}
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-[var(--radius-md)] transition-colors text-sm font-medium bg-app-surface text-text-primary hover:bg-app-hover border border-edge-subtle"
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

export function NoPermissionState({ title, message }: NoPermissionStateProps) {
  const { t } = useTranslation()
  const finalTitle = title || t('common:emptyState.noPermission')
  const finalMessage = message || t('common:emptyState.noPermissionDesc')
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {/* 图标 */}
      <Lock size={48} className="mb-4 text-warning" />

      {/* 标题 */}
      <h3 className="text-lg font-medium mb-2 text-text-primary">{finalTitle}</h3>

      {/* 消息 */}
      <p className="text-sm text-text-secondary">{finalMessage}</p>
    </div>
  )
}
