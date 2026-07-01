import { useState, useCallback, useEffect, type ReactNode } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import clsx from 'clsx'
import { useUIStore } from '@/stores/ui.store'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: number
  type: ToastType
  message: string
  duration: number
}

let toastId = 0

/** 全局 Toast 容器（挂载到 App 根） */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const show = (type: ToastType, message: string, duration = 4000) => {
      const id = ++toastId
      setToasts((prev) => [...prev, { id, type, message, duration }])
      if (duration > 0) {
        setTimeout(() => removeToast(id), duration)
      }
    }
    const remove = (id: number) => removeToast(id)
    ;(window as Window & { __showToast?: typeof show; __removeToast?: typeof remove }).__showToast = show
    ;(window as Window & { __removeToast?: (id: number) => void }).__removeToast = remove

    return () => {
      delete (window as Window & { __showToast?: unknown }).__showToast
      delete (window as Window & { __removeToast?: unknown }).__removeToast
    }
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <div className="fixed bottom-4 end-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

/** 全局 showToast 入口 */
export function showToast(type: ToastType, message: string, duration = 4000) {
  const fn = (window as Window & { __showToast?: (t: ToastType, m: string, d: number) => void }).__showToast
  fn?.(type, message, duration)
}

export function showSuccess(message: string, duration?: number) {
  showToast('success', message, duration)
}

export function showError(message: string, duration?: number) {
  showToast('error', message, duration ?? 6000)
}

export function showWarning(message: string, duration?: number) {
  showToast('warning', message, duration)
}

export function showInfo(message: string, duration?: number) {
  showToast('info', message, duration)
}

function Toast({ toast, onClose }: { toast: ToastItem; onClose: () => void }) {
  const isDark = useUIStore((s) => s.isDark)
  const icons: Record<ToastType, ReactNode> = {
    success: <CheckCircle size={16} className="text-green-500 shrink-0" />,
    error: <AlertCircle size={16} className="text-red-500 shrink-0" />,
    warning: <AlertTriangle size={16} className="text-amber-500 shrink-0" />,
    info: <Info size={16} className="text-blue-500 shrink-0" />,
  }

  const bgColor = isDark ? 'bg-gray-800/95' : 'bg-white'
  const borderColor: Record<ToastType, string> = {
    success: isDark ? 'border-green-700' : 'border-green-200',
    error: isDark ? 'border-red-700' : 'border-red-200',
    warning: isDark ? 'border-amber-700' : 'border-amber-200',
    info: isDark ? 'border-blue-700' : 'border-blue-200',
  }
  const textColor = isDark ? 'text-gray-100' : 'text-gray-800'
  const hoverBg = isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
  const xColor = isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'

  return (
    <div
      className={clsx(
        'pointer-events-auto flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg min-w-[280px] max-w-[400px]',
        'animate-fade-in animate-slide-in-right',
        bgColor,
        borderColor[toast.type],
      )}
    >
      {icons[toast.type]}
      <p className={clsx('flex-1 text-sm leading-snug', textColor)}>{toast.message}</p>
      <button onClick={onClose} className={clsx('shrink-0 p-0.5 rounded transition-colors', hoverBg, xColor)}>
        <X size={14} />
      </button>
    </div>
  )
}
