import { useTranslation } from 'react-i18next'
import { Check, Sun, Moon, Monitor } from 'lucide-react'
import clsx from 'clsx'
import { Popover } from '@/components/ui/Popover'

interface ThemePopoverProps {
  open: boolean
  onClose: () => void
  isDark: boolean
  currentTheme: 'light' | 'dark' | 'system'
  onSelect: (theme: 'light' | 'dark' | 'system') => void
}

const THEME_OPTIONS: { value: 'light' | 'dark' | 'system'; icon: typeof Sun; labelKey: string }[] = [
  { value: 'light', icon: Sun, labelKey: 'menu.lightMode' },
  { value: 'dark', icon: Moon, labelKey: 'menu.darkMode' },
  { value: 'system', icon: Monitor, labelKey: 'menu.systemMode' },
]

export function ThemePopover({
  open,
  onClose,
  isDark,
  currentTheme,
  onSelect,
}: ThemePopoverProps) {
  const { t } = useTranslation()

  const handleSelect = (theme: 'light' | 'dark' | 'system') => {
    onSelect(theme)
    onClose()
  }

  return (
    <Popover open={open} onClose={onClose} isDark={isDark} className="min-w-[160px]">
      <div className="px-3 py-1">
        <h4 className={clsx('text-xs font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>
          {t('common:settings.appearance.title')}
        </h4>
      </div>
      {THEME_OPTIONS.map((opt) => {
        const isActive = opt.value === currentTheme
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            onClick={() => handleSelect(opt.value)}
            className={clsx(
              'w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors',
              isActive
                ? isDark
                  ? 'bg-blue-900/30 text-blue-300'
                  : 'bg-blue-50 text-blue-700'
                : isDark
                  ? 'text-gray-300 hover:bg-gray-700'
                  : 'text-gray-600 hover:bg-gray-100',
            )}
          >
            <span className="flex items-center gap-2">
              <Icon size={14} />
              {t(opt.labelKey)}
            </span>
            {isActive && <Check size={12} />}
          </button>
        )
      })}
    </Popover>
  )
}