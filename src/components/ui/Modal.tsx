import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { useUIStore } from '@/stores/ui.store'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  width?: string
  footer?: ReactNode
}

export function Modal({ open, onClose, title, children, width = '500px', footer }: ModalProps) {
  const isDark = useUIStore((s) => s.isDark)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose} style={{ animationDuration: '0.15s' }}>
      <div
        className={clsx(
          'rounded-lg flex flex-col max-h-[90vh] animate-scale-in',
          isDark ? 'bg-gray-800 border border-gray-700 shadow-xl shadow-black/30' : 'bg-white shadow-2xl',
        )}
        style={{ width, animationDuration: '0.15s' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={clsx(
            'flex items-center justify-between px-5 py-3 border-b',
            isDark ? 'border-gray-700' : 'border-gray-200',
          )}
        >
          <h3 className={clsx('text-base font-semibold', isDark ? 'text-gray-100' : 'text-gray-900')}>{title}</h3>
          <button
            onClick={onClose}
            className={clsx(
              'p-1.5 rounded transition-colors',
              isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500',
            )}
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">{children}</div>
        {footer && (
          <div
            className={clsx(
              'px-5 py-3 border-t flex justify-end gap-2',
              isDark ? 'border-gray-700' : 'border-gray-200',
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

interface ConfirmOptions {
  title: string
  message: string
}

export function useConfirm() {
  const [state, setState] = useState<{ open: boolean; options: ConfirmOptions | null; resolve?: (v: boolean) => void }>({
    open: false,
    options: null,
  })

  const confirm = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ open: true, options, resolve })
    })
  }

  const close = (result: boolean) => {
    state.resolve?.(result)
    setState({ open: false, options: null })
  }

  const ConfirmDialog = () => {
    const isDark = useUIStore((s) => s.isDark)
    return state.open && state.options ? (
      <Modal
        open
        onClose={() => close(false)}
        title={state.options.title}
        width="400px"
        footer={
          <>
            <button
              onClick={() => close(false)}
              className={clsx(
                'px-4 py-1.5 text-sm rounded border transition-colors',
                isDark
                  ? 'border-gray-600 text-gray-200 hover:bg-gray-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50',
              )}
            >
              取消
            </button>
            <button
              onClick={() => close(true)}
              className={clsx(
                'px-4 py-1.5 text-sm rounded transition-colors',
                isDark
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'bg-primary-600 text-white hover:bg-primary-700',
              )}
            >
              确定
            </button>
          </>
        }
      >
        <p className={clsx('text-sm', isDark ? 'text-gray-200' : 'text-gray-700')}>{state.options.message}</p>
      </Modal>
    ) : null
  }

  return { confirm, ConfirmDialog }
}

// danger 操作样式示例（可在 Modal 的 footer 或 children 中直接应用）
// danger: isDark
//   ? 'bg-red-900/50 text-red-300 border border-red-800 hover:bg-red-900/70 rounded px-4 py-1.5 text-sm'
//   : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded px-4 py-1.5 text-sm'
