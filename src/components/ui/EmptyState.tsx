import clsx from 'clsx'
import { useUIStore } from '@/stores/ui.store'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  const isDark = useUIStore((s) => s.isDark)
  return (
    <div className={clsx('flex flex-col items-center justify-center gap-3 p-8 text-center', className)}>
      <div className="flex items-center justify-center">{icon}</div>
      <div className="space-y-1">
        <p className={clsx('text-sm font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>{title}</p>
        {description && (
          <p className={clsx('text-xs', isDark ? 'text-gray-500' : 'text-gray-400', 'max-w-xs')}>{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
