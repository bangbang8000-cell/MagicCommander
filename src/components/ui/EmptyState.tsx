import clsx from 'clsx'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

/**
 * 通用空状态（4.1 F1-5：图标 + 主文案 + 次文案 + 操作，契约 token 驱动）
 */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-3 p-8 text-center', className)}>
      <div className="flex items-center justify-center text-text-muted">{icon}</div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        {description && <p className="text-xs text-text-muted max-w-xs">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
