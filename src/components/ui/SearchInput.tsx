import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X } from 'lucide-react'
import clsx from 'clsx'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  debounceMs?: number
}

export function SearchInput({
  value: externalValue,
  onChange,
  placeholder = 'Search...',
  className,
  debounceMs = 380,
}: SearchInputProps) {
  const [localValue, setLocalValue] = useState(externalValue)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRender = useRef(true)

  // Sync external value changes (e.g., clear from parent)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setLocalValue(externalValue)
  }, [externalValue])

  const handleChange = useCallback(
    (newVal: string) => {
      setLocalValue(newVal)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onChange(newVal)
      }, debounceMs)
    },
    [onChange, debounceMs],
  )

  const handleClear = useCallback(() => {
    setLocalValue('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    onChange('')
  }, [onChange])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div className={clsx('relative', className)}>
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className={clsx(
          'w-full pl-8 pr-8 py-1.5 text-xs rounded-[var(--radius-md)] border outline-none transition-colors',
          'bg-app-surface border-edge-subtle',
          'text-text-primary placeholder-text-muted',
          'focus:border-focus focus:ring-1 focus:ring-focus',
        )}
      />
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}
