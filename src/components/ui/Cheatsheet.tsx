import { Modal } from '@/components/ui/Modal'
import { HotkeyKeys } from '@/components/ui/Kbd'
import { getHotkeysByCategory, CATEGORY_ORDER } from '@/hooks/hotkeyRegistry'
import { useUIStore } from '@/stores/ui.store'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'

interface CheatsheetProps {
  open: boolean
  onClose: () => void
}

export function Cheatsheet({ open, onClose }: CheatsheetProps) {
  const { t } = useTranslation()
  const isDark = useUIStore((s) => s.isDark)
  const byCategory = getHotkeysByCategory()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('common:cheatsheet.title')}
      width="580px"
      footer={
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-sm rounded bg-primary-600 text-white hover:bg-primary-700"
        >
          {t('common:cheatsheet.close')}
        </button>
      }
    >
      <div className="space-y-4">
        {CATEGORY_ORDER.map((category) => {
          const items = byCategory[category]
          if (!items?.length) return null
          return (
            <div key={category}>
              <h4
                className={clsx(
                  'text-xs font-semibold uppercase tracking-wider mb-2',
                  isDark ? 'text-gray-400' : 'text-gray-500',
                )}
              >
                {category}
              </h4>
              <div className="space-y-1">
                {items.map((item) => (
                  <div
                    key={item.combo}
                    className={clsx(
                      'flex items-center justify-between py-1.5 px-2 rounded',
                      isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50',
                    )}
                  >
                    <span className={clsx('text-sm', isDark ? 'text-gray-200' : 'text-gray-700')}>{item.label}</span>
                    <HotkeyKeys combo={item.combo} />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
