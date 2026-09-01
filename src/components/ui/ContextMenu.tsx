import { useEffect, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'

interface ContextMenuItem {
  label: string
  icon?: ReactNode
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  separator?: boolean
  onClick: () => void
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  children: ReactNode
  className?: string
}

export function ContextMenu({ items, children, className }: ContextMenuProps) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible) return
    const handleClick = () => setVisible(false)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisible(false)
    }
    document.addEventListener('click', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [visible])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setPosition({ x: e.clientX, y: e.clientY })
    setVisible(true)
  }

  return (
    <div onContextMenu={handleContextMenu} className={className}>
      {children}
      {visible && (
        <div
          ref={menuRef}
          className={clsx(
            // 4.1 F1-3：ContextMenu 表面收敛到契约 token
            'fixed z-50 rounded-[var(--radius-md)] shadow-md py-1 min-w-[160px] border bg-app border-edge-subtle',
          )}
          style={{ left: position.x, top: position.y }}
        >
          {items.map((item, i) => {
            if (item.separator) {
              return <div key={i} className="border-t border-edge-subtle my-1" />
            }
            return (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation()
                  item.onClick()
                  setVisible(false)
                }}
                disabled={item.disabled}
                className={clsx(
                  'w-full text-start px-3 py-1.5 text-xs flex items-center gap-2 transition-colors',
                  item.disabled
                    ? 'text-text-muted cursor-not-allowed'
                    : item.danger
                      ? 'text-danger hover:bg-danger/10'
                      : 'text-text-primary hover:bg-app-hover',
                )}
              >
                {item.icon && <span className="w-4 flex justify-center">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && <span className="text-[11px] text-text-muted">{item.shortcut}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
