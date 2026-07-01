import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { HotkeyKeys } from '@/components/ui/Kbd'
import { getHotkeysByCategory, CATEGORY_ORDER } from '@/hooks/hotkeyRegistry'
import { useUIStore } from '@/stores/ui.store'

interface CheatsheetProps {
  open: boolean
  onClose: () => void
}

export function Cheatsheet({ open, onClose }: CheatsheetProps) {
  const [active] = useState(true)
  const isDark = useUIStore((s) => s.isDark)
  const byCategory = getHotkeysByCategory()

  // 使用 active 避免 lint 警告
  void active

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="键盘快捷键"
      width="580px"
      footer={
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-sm rounded bg-primary-600 text-white hover:bg-primary-700"
        >
          关闭
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
                className={clsx('text-xs font-semibold uppercase tracking-wider mb-2',
                  isDark ? 'text-gray-400' : 'text-gray-500'
                )}
              >
                {category}
              </h4>
              <div className="space-y-1">
                {items.map((item) => (
                  <div
                    key={item.combo}
                    className={clsx('flex items-center justify-between py-1.5 px-2 rounded',
                      isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'
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

// 由于 ts 会编译错误移除 clsx 引用
function clsx(...args: any[]): string {
  return args.filter(Boolean).join(' ')
}
