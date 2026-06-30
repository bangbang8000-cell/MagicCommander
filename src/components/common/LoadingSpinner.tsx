/**
 * 统一加载状态组件
 * 提供一致的加载动画样式
 */

import React from 'react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  text?: string
  fullScreen?: boolean
}

const SIZE_MAP = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
}

export function LoadingSpinner({ size = 'md', text, fullScreen = false }: LoadingSpinnerProps) {
  const spinnerClass = SIZE_MAP[size]
  
  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-50">
        <div className="flex flex-col items-center gap-3">
          <div className={`${spinnerClass} border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin`} />
          {text && <p className="text-sm text-gray-500 dark:text-gray-400">{text}</p>}
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex items-center gap-2">
      <div className={`${spinnerClass} border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin`} />
      {text && <span className="text-sm text-gray-500 dark:text-gray-400">{text}</span>}
    </div>
  )
}

/**
 * 加载覆盖层组件
 * 用于覆盖在内容区域上显示加载状态
 */
interface LoadingOverlayProps {
  loading: boolean
  text?: string
  children: React.ReactNode
}

export function LoadingOverlay({ loading, text = '加载中...', children }: LoadingOverlayProps) {
  return (
    <div className="relative">
      {children}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-gray-900/60 z-10">
          <LoadingSpinner size="md" text={text} />
        </div>
      )}
    </div>
  )
}

/**
 * 按钮加载状态
 */
interface LoadingButtonProps {
  loading: boolean
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  type?: 'button' | 'submit' | 'reset'
}

export function LoadingButton({
  loading,
  children,
  onClick,
  disabled,
  className = '',
  type = 'button',
}: LoadingButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex items-center justify-center gap-2 ${className} ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
    >
      {loading && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  )
}