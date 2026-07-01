import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useUIStore } from '@/stores/ui.store'
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
  const isDark = useUIStore((s) => s.isDark)

  useEffect(() => {
    const handleClick = () => setVisible(false)
    if (visible) {
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
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
            'fixed z-50 rounded-lg shadow-lg py-1 min-w-[160px] border',
            isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
          )}
          style={{ left: position.x, top: position.y }}
        >
          {items.map((item, i) => {
            if (item.separator) {
              return (
                <div
                  key={i}
                  className={clsx('border-t my-1', isDark ? 'border-gray-700' : 'border-gray-200')}
                />
              )
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
                    ? 'text-gray-400 cursor-not-allowed'
                    : item.danger
                      ? clsx(
                          'text-red-500',
                          isDark ? 'hover:bg-red-900/30' : 'hover:bg-red-50',
                        )
                      : clsx(
                          isDark ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100',
                        ),
                )}
              >
                {item.icon && <span className="w-4 flex justify-center">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <span className={clsx('text-[10px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
                    {item.shortcut}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
