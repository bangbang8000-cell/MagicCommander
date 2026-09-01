import { useRef, useEffect, type ReactNode } from 'react'
import clsx from 'clsx'

interface PopoverProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  /** 是否使用暗色主题 */
  isDark?: boolean
}

/**
 * 通用弹出面板（Popover）
 * 点击外部自动关闭
 */
export function Popover({ open, onClose, children, className }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // 延迟绑定，避免触发按钮的 click 立即关闭
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={ref}
      className={clsx(
        // 4.1 F1-3：浮层表面收敛到契约 token（popover-surface + app 表面）
        'absolute top-full right-0 z-50 min-w-[220px] border popover-surface bg-app border-edge-subtle',
        'py-[var(--popover-pad-y)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
