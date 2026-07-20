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
export function Popover({ open, onClose, children, className, isDark }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // 延迟绑定，避免触发按钮的 click 立即关闭
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={ref}
      className={clsx(
        'absolute top-full right-0 z-50 min-w-[220px] py-1.5 rounded-lg shadow-lg border',
        isDark
          ? 'bg-gray-800 border-gray-700'
          : 'bg-white border-gray-200',
        className,
      )}
    >
      {children}
    </div>
  )
}