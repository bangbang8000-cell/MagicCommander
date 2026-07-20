import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/ui.store'
import { HOTKEY_REGISTRY } from '@/hooks/hotkeyRegistry'
import { HotkeyKeys } from '@/components/ui/Kbd'
import clsx from 'clsx'

export interface CommandItem {
  id: string
  label: string
  category: string
  shortcut?: string
  action: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  commands: CommandItem[]
}

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const { t } = useTranslation()
  const isDark = useUIStore((s) => s.isDark)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = query
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.category.toLowerCase().includes(query.toLowerCase()),
      )
    : commands

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Clamp selectedIndex
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1))
    }
  }, [filtered.length, selectedIndex])

  const execute = useCallback(
    (index: number) => {
      const item = filtered[index]
      if (item) {
        item.action()
        onClose()
      }
    },
    [filtered, onClose],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        execute(selectedIndex)
        break
      case 'Escape':
        onClose()
        break
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined
      selected?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div
        className={clsx(
          'w-[560px] max-h-[400px] rounded-lg shadow-2xl border overflow-hidden flex flex-col',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={clsx('px-4 py-3 border-b', isDark ? 'border-gray-700' : 'border-gray-200')}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('common:commandPalette.placeholder')}
            className={clsx(
              'w-full bg-transparent text-sm outline-none',
              isDark ? 'text-gray-100 placeholder:text-gray-500' : 'text-gray-900 placeholder:text-gray-400',
            )}
          />
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className={clsx('px-4 py-8 text-center text-sm', isDark ? 'text-gray-500' : 'text-gray-400')}>
              {t('common:commandPalette.noResults')}
            </div>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
                onClick={() => execute(i)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors',
                  i === selectedIndex
                    ? isDark
                      ? 'bg-blue-900/30 text-blue-300'
                      : 'bg-blue-50 text-blue-700'
                    : isDark
                      ? 'text-gray-200 hover:bg-gray-700'
                      : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                <span className="flex-1 truncate">{item.label}</span>
                <span className={clsx('text-xs shrink-0', isDark ? 'text-gray-500' : 'text-gray-400')}>
                  {item.category}
                </span>
                {item.shortcut && <HotkeyKeys combo={item.shortcut} />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
