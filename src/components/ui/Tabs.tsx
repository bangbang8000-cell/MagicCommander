import type { ReactNode } from 'react'
import clsx from 'clsx'

export interface TabItem {
  id: string
  label: ReactNode
  disabled?: boolean
}

interface TabsProps {
  items: TabItem[]
  activeId: string
  onChange: (id: string) => void
  className?: string
}

/**
 * 通用标签页（4.1 F1-3：active primary + 下划线，收敛到契约 token）
 * 行为基准：role=tablist / tab，键盘/aria 语义由浏览器保证。
 */
export function Tabs({ items, activeId, onChange, className }: TabsProps) {
  return (
    <div role="tablist" className={clsx('flex gap-1 border-b border-edge-subtle', className)}>
      {items.map((it) => {
        const isActive = it.id === activeId
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={isActive}
            disabled={it.disabled}
            onClick={() => onChange(it.id)}
            className={clsx(
              'relative px-3 py-1.5 text-sm transition-colors',
              isActive
                ? 'text-primary font-medium after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-app-hover',
              it.disabled && 'opacity-40 cursor-not-allowed',
            )}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
