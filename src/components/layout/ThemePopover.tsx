import { useTranslation } from 'react-i18next'
import { Check, Sun, Moon, Monitor, Contrast } from 'lucide-react'
import clsx from 'clsx'
import { Popover } from '@/components/ui/Popover'
import type { ThemeMode } from '@/stores/ui.store'

interface ThemePopoverProps {
  open: boolean
  onClose: () => void
  isDark: boolean
  currentTheme: ThemeMode
  onSelect: (theme: ThemeMode) => void
}

const THEME_OPTIONS: { value: ThemeMode; icon: typeof Sun; labelKey: string }[] = [
  { value: 'light', icon: Sun, labelKey: 'menu.lightMode' },
  { value: 'dark', icon: Moon, labelKey: 'menu.darkMode' },
  { value: 'system', icon: Monitor, labelKey: 'menu.systemMode' },
  { value: 'high-contrast', icon: Contrast, labelKey: 'menu.highContrastMode' },
]

export function ThemePopover({ open, onClose, isDark, currentTheme, onSelect }: ThemePopoverProps) {
  const { t } = useTranslation()

  const handleSelect = (theme: ThemeMode) => {
    onSelect(theme)
    onClose()
  }

  return (
    <Popover open={open} onClose={onClose} isDark={isDark} className="min-w-[160px]">
      <div className="px-3 py-1">
        <h4 className="text-xs font-semibold text-text-primary">{t('common:settings.appearance.title')}</h4>
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
              isActive ? 'bg-primary/15 text-primary' : 'text-text-secondary hover:bg-app-hover',
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
