import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface LoadingStateProps {
  /** 变体: skeleton=骨架屏, spinner=旋转加载, inline=行内加载 */
  variant?: 'skeleton' | 'spinner' | 'inline'
  /** 加载文案 */
  text?: string
  /** 骨架屏行数 */
  lines?: number
  /** 是否使用 dark 主题 */
  isDark?: boolean
}

export function LoadingState({ variant = 'spinner', text, lines = 3, isDark = false }: LoadingStateProps) {
  const { t } = useTranslation()

  const loadingText = text || t('common:loading.loading')

  if (variant === 'inline') {
    return (
      <span className={clsx('inline-flex items-center gap-1.5 text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
        <Loader2 size={12} className="animate-spin" />
        {loadingText}
      </span>
    )
  }

  if (variant === 'skeleton') {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={clsx(
              'h-3 rounded animate-pulse',
              isDark ? 'bg-gray-700' : 'bg-gray-200',
              i === lines - 1 ? 'w-3/4' : 'w-full',
            )}
          />
        ))}
      </div>
    )
  }

  // spinner (default)
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8">
      <Loader2
        size={24}
        className={clsx('animate-spin', isDark ? 'text-blue-400' : 'text-blue-500')}
      />
      <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
        {loadingText}
      </span>
    </div>
  )
}