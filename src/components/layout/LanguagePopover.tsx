import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import clsx from 'clsx'
import { Popover } from '@/components/ui/Popover'
import { LOCALE_NAMES, type SupportedLocale } from '@/i18n/resources'
import i18n from '@/i18n'

interface LanguagePopoverProps {
  open: boolean
  onClose: () => void
  isDark: boolean
  currentLanguage: string
  onSelect: (lang: string) => void
}

const LANGUAGES: SupportedLocale[] = [
  'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr',
]

export function LanguagePopover({
  open,
  onClose,
  isDark,
  currentLanguage,
  onSelect,
}: LanguagePopoverProps) {
  const { t } = useTranslation()

  const handleSelect = (lang: string) => {
    onSelect(lang)
    i18n.changeLanguage(lang)
    onClose()
  }

  return (
    <Popover open={open} onClose={onClose} isDark={isDark} className="min-w-[160px]">
      <div className="px-3 py-1">
        <h4 className={clsx('text-xs font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>
          {t('menu.language')}
        </h4>
      </div>
      <div className="max-h-[280px] overflow-y-auto">
        {LANGUAGES.map((lang) => {
          const isActive = lang === currentLanguage
          return (
            <button
              key={lang}
              onClick={() => handleSelect(lang)}
              className={clsx(
                'w-full flex items-center justify-between px-3 py-1.5 text-xs text-left transition-colors',
                isActive
                  ? isDark
                    ? 'bg-primary-500/10 text-primary-400'
                    : 'bg-primary-50 text-primary-700'
                  : isDark
                    ? 'text-gray-300 hover:bg-gray-700/50'
                    : 'text-gray-600 hover:bg-gray-100',
              )}
            >
              <span>{LOCALE_NAMES[lang]}</span>
              {isActive && <Check size={12} />}
            </button>
          )
        })}
      </div>
    </Popover>
  )
}