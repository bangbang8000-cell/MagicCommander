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
  'zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'ar', 'vi', 'th',
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
    <Popover open={open} onClose={onClose} isDark={isDark} className="min-w-[180px]">
      <div className="px-3 py-1">
        <h4 className={clsx('text-xs font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>
          {t('menu.language')}
        </h4>
      </div>
      <div className="max-h-[320px] overflow-y-auto">
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
                    ? 'bg-blue-900/30 text-blue-300'
                    : 'bg-blue-50 text-blue-700'
                  : isDark
                    ? 'text-gray-300 hover:bg-gray-700'
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