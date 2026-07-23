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
      <Search
        size={14}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none"
      />
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className={clsx(
          'w-full pl-8 pr-8 py-1.5 text-xs rounded-md border outline-none transition-colors',
          'bg-gray-50 dark:bg-gray-750 border-gray-200 dark:border-gray-600',
          'text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500',
          'focus:border-primary-400 dark:focus:border-primary-500 focus:ring-1 focus:ring-primary-400/30',
        )}
      />
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}