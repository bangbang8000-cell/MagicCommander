import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import clsx from 'clsx'

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
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  // 5.4.11-F54-11-2/5：hover 暂停 / 移开恢复（对齐 AL ToastContainer，避免文案未读完被吞）
  const pauseToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id)
    if (timer) clearTimeout(timer)
  }, [])

  const resumeToast = useCallback(
    (id: number, duration: number) => {
      const timer = timersRef.current.get(id)
      if (timer) clearTimeout(timer)
      if (duration > 0) {
        timersRef.current.set(
          id,
          setTimeout(() => removeToast(id), duration),
        )
      }
    },
    [removeToast],
  )

  useEffect(() => {
    const show = (type: ToastType, message: string, duration = 4000) => {
      const id = ++toastId
      setToasts((prev) => [...prev, { id, type, message, duration }])
      if (duration > 0) {
        timersRef.current.set(
          id,
          setTimeout(() => removeToast(id), duration),
        )
      }
    }
    const remove = (id: number) => removeToast(id)
    ;(window as Window & { __showToast?: typeof show; __removeToast?: typeof remove }).__showToast = show
    ;(window as Window & { __removeToast?: (id: number) => void }).__removeToast = remove

    return () => {
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current.clear()
      delete (window as Window & { __showToast?: unknown }).__showToast
      delete (window as Window & { __removeToast?: unknown }).__removeToast
    }
  }, [removeToast])

  return (
    <div
      // 5.4.11-F54-11-2：Toast 容器声明 live 区域，屏幕阅读器可感知非打断性提示
      role="status"
      aria-live="polite"
      className="fixed bottom-4 end-4 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto"
          onMouseEnter={() => pauseToast(toast.id)}
          onMouseLeave={() => resumeToast(toast.id, toast.duration)}
        >
          <Toast toast={toast} onClose={() => removeToast(toast.id)} />
        </div>
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
  const icons: Record<ToastType, ReactNode> = {
    success: <CheckCircle size={16} className="text-success shrink-0" />,
    error: <AlertCircle size={16} className="text-danger shrink-0" />,
    warning: <AlertTriangle size={16} className="text-warning shrink-0" />,
    info: <Info size={16} className="text-info shrink-0" />,
  }

  const borderColor: Record<ToastType, string> = {
    success: 'border-success/50',
    error: 'border-danger/50',
    warning: 'border-warning/50',
    info: 'border-info/50',
  }

  return (
    <div
      className={clsx(
        // 4.1 F1-3：Toast 表面收敛到契约 token（app 表面 + shadow-lg）
        'pointer-events-auto flex items-start gap-2 px-4 py-3 rounded-[var(--radius-md)] border bg-app shadow-lg min-w-[280px] max-w-[400px]',
        'animate-fade-in animate-slide-in-right',
        borderColor[toast.type],
      )}
    >
      {icons[toast.type]}
      <p className={clsx('flex-1 text-sm leading-snug text-text-primary')}>{toast.message}</p>
      <button
        onClick={onClose}
        className="shrink-0 p-0.5 rounded transition-colors hover:bg-app-hover text-text-muted hover:text-text-secondary"
      >
        <X size={14} />
      </button>
    </div>
  )
}
