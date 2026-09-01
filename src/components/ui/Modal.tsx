import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  width?: string
  footer?: ReactNode
  /** ESC 关闭（默认开启，符合 4.0 组件行为契约） */
  closeOnEsc?: boolean
}

export function Modal({ open, onClose, title, children, width = '500px', footer, closeOnEsc = true }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // 4.0 行为契约：ESC 关闭 + 打开后焦点进入对话框
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEsc) {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    const focusTimer = setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, select, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      focusable?.focus()
    }, 0)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      clearTimeout(focusTimer)
    }
  }, [open, closeOnEsc, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in"
      onClick={onClose}
      style={{ animationDuration: '0.15s' }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={clsx(
          // 4.1 F1-3：radius-lg + shadow-lg（契约 token）
          'rounded-[var(--radius-lg)] flex flex-col max-h-[90vh] animate-scale-in',
          'bg-app border border-edge-subtle shadow-lg',
        )}
        style={{ width, animationDuration: '0.15s' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-edge-subtle">
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded transition-colors hover:bg-app-hover text-text-secondary">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-edge-subtle flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

interface ConfirmOptions {
  title: string
  message: string
}

export function useConfirm() {
  const [state, setState] = useState<{ open: boolean; options: ConfirmOptions | null; resolve?: (v: boolean) => void }>(
    {
      open: false,
      options: null,
    },
  )

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
              className="px-4 py-1.5 text-sm rounded-[var(--radius-md)] border border-edge-subtle text-text-primary hover:bg-app-hover transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => close(true)}
              className="px-4 py-1.5 text-sm rounded-[var(--radius-md)] bg-primary text-white hover:bg-primary-hover transition-colors"
            >
              确定
            </button>
          </>
        }
      >
        <p className="text-sm text-text-primary">{state.options.message}</p>
      </Modal>
    ) : null
  }

  return { confirm, ConfirmDialog }
}

// danger 操作样式示例（可在 Modal 的 footer 或 children 中直接应用）
// danger: isDark
//   ? 'bg-red-900/50 text-red-300 border border-red-800 hover:bg-red-900/70 rounded px-4 py-1.5 text-sm'
//   : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded px-4 py-1.5 text-sm'
