// ============================================================
// Kbd 组件 - 展示键盘按键（类似 GitHub 的 <kbd> 样式）
// ============================================================

import clsx from 'clsx'

interface KbdProps {
  children: React.ReactNode
  className?: string
}

export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={clsx(
        'inline-flex items-center justify-center min-w-[1.4rem] h-5 px-1',
        'text-[10px] font-mono font-medium text-gray-600',
        'bg-gray-100 border border-gray-300 rounded',
        'shadow-[0_1px_0_0_rgba(0,0,0,0.1)]',
        'select-none',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

/** 将 "ctrl+s" 解析为一组 Kbd */
export function HotkeyKeys({ combo }: { combo: string }) {
  const parts = combo.toLowerCase().split('+')
  return (
    <span className="flex items-center gap-0.5">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center">
          {i > 0 && <span className="text-gray-400 mx-0.5 text-xs">+</span>}
          <Kbd>{part === 'ctrl' ? 'Ctrl' : part === 'shift' ? '⇧' : part === 'alt' ? 'Alt' : part === 'meta' ? '⌘' : part}</Kbd>
        </span>
      ))}
    </span>
  )
}
