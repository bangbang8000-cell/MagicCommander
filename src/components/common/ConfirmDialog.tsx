/**
 * 确认对话框组件
 * 用于删除、关闭等危险操作的二次确认
 */

import React from 'react'
import clsx from 'clsx'
import { AlertTriangle, Trash2, Info, type LucideIcon } from 'lucide-react'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'warning' | 'danger' | 'info'
  onConfirm: () => void
  onCancel: () => void
}

const TYPE_CONFIG: Record<string, { icon: LucideIcon; confirmColor: string }> = {
  warning: {
    icon: AlertTriangle,
    confirmColor: 'bg-yellow-500 hover:bg-yellow-600',
  },
  danger: {
    icon: Trash2,
    confirmColor: 'bg-red-500 hover:bg-red-600',
  },
  info: {
    icon: Info,
    confirmColor: 'bg-primary-500 hover:bg-primary-600',
  },
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  type = 'warning',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null

  const config = TYPE_CONFIG[type] || TYPE_CONFIG.warning

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* 对话框内容 */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* 图标和标题 */}
        <div className={clsx('flex items-center gap-3 p-4', type === 'danger' ? 'bg-red-50 dark:bg-red-900/20' : type === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-blue-50 dark:bg-blue-900/20')}>
          <config.icon size={28} className={clsx(type === 'danger' ? 'text-red-500' : type === 'warning' ? 'text-yellow-500' : 'text-blue-500')} />
          <h3 className={clsx('text-lg font-semibold', type === 'danger' ? 'text-red-700 dark:text-red-400' : type === 'warning' ? 'text-yellow-700 dark:text-yellow-400' : 'text-blue-700 dark:text-blue-400')}>
            {title}
          </h3>
        </div>

        {/* 消息内容 */}
        <div className="p-4">
          <p className="text-gray-600 dark:text-gray-300 text-sm">{message}</p>
        </div>

        {/* 按钮区域 */}
        <div className="flex items-center justify-end gap-2 p-4 bg-gray-50 dark:bg-gray-700/50">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={clsx('px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors', config.confirmColor)}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}