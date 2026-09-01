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
  /** 是否使用 dark 主题（视觉收敛后由 token 驱动，保留参数向后兼容） */
  isDark?: boolean
}

/**
 * 统一加载状态（4.1 F1-5：spinner / 骨架屏 / 行内，契约 token 驱动）
 */
export function LoadingState({ variant = 'spinner', text, lines = 3 }: LoadingStateProps) {
  const { t } = useTranslation()

  const loadingText = text || t('common:loading.loading')

  if (variant === 'inline') {
    return (
      <span className={clsx('inline-flex items-center gap-1.5 text-xs text-text-secondary')}>
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
            className={clsx('h-3 rounded animate-pulse bg-app-hover', i === lines - 1 ? 'w-3/4' : 'w-full')}
          />
        ))}
      </div>
    )
  }

  // spinner (default)
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8">
      <Loader2 size={24} className={clsx('animate-spin text-primary')} />
      <span className="text-xs text-text-secondary">{loadingText}</span>
    </div>
  )
}
