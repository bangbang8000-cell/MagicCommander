/**
 * Toast 通知组件
 * 用于显示操作结果、错误提示等
 */

import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react'
import clsx from 'clsx'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastMessage {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastProps {
  message: ToastMessage
  onRemove: (id: string) => void
}

const TYPE_CONFIG: Record<ToastType, { icon: typeof CheckCircle; bgColor: string; textColor: string }> = {
  success: {
    icon: CheckCircle,
    bgColor: 'bg-green-50 border-green-200 dark:bg-green-900/30 dark:border-green-700',
    textColor: 'text-green-700 dark:text-green-400',
  },
  error: {
    icon: XCircle,
    bgColor: 'bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-700',
    textColor: 'text-red-700 dark:text-red-400',
  },
  warning: {
    icon: AlertCircle,
    bgColor: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/30 dark:border-yellow-700',
    textColor: 'text-yellow-700 dark:text-yellow-400',
  },
  info: {
    icon: Info,
    bgColor: 'bg-blue-50 border-blue-200 dark:bg-blue-900/30 dark:border-blue-700',
    textColor: 'text-blue-700 dark:text-blue-400',
  },
}

function ToastItem({ message, onRemove }: ToastProps) {
  const config = TYPE_CONFIG[message.type]
  const Icon = config.icon

  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(message.id)
    }, message.duration || 3000)

    return () => clearTimeout(timer)
  }, [message.id, message.duration, onRemove])

  return (
    <div
      className={clsx(
        'flex items-center gap-3 px-4 py-3 rounded-lg border shadow-sm',
        config.bgColor,
        'animate-in slide-in-from-top-4 fade-in duration-200',
      )}
    >
      <Icon className={clsx('w-5 h-5 shrink-0', config.textColor)} />
      <span className={clsx('text-sm font-medium', config.textColor)}>{message.message}</span>
      <button
        onClick={() => onRemove(message.id)}
        className={clsx('ml-auto p-1 rounded hover:bg-black/5 transition-colors', config.textColor)}
      >
        <XCircle size={16} />
      </button>
    </div>
  )
}

interface ToastContainerProps {
  messages: ToastMessage[]
  onRemove: (id: string) => void
}

export function ToastContainer({ messages, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {messages.map((msg) => (
        <ToastItem key={msg.id} message={msg} onRemove={onRemove} />
      ))}
    </div>
  )
}

/**
 * Toast 状态管理 Hook
 */
export function useToast() {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  const add = (message: string, type: ToastType = 'info', duration?: number) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    setMessages((prev) => [...prev, { id, message, type, duration }])
  }

  const remove = (id: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== id))
  }

  const success = (message: string, duration?: number) => add(message, 'success', duration)
  const error = (message: string, duration?: number) => add(message, 'error', duration)
  const warning = (message: string, duration?: number) => add(message, 'warning', duration)
  const info = (message: string, duration?: number) => add(message, 'info', duration)

  return {
    messages,
    add,
    remove,
    success,
    error,
    warning,
    info,
  }
}