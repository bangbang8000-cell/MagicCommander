import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning' | 'outline'
type Size = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
  loading?: boolean
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading,
  fullWidth,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const variantClasses: Record<Variant, string> = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
    secondary:
      'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600',
    ghost: 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
    danger: 'bg-danger-600 text-white hover:bg-danger-700 focus:ring-danger-500',
    success: 'bg-success-600 text-white hover:bg-success-700 focus:ring-success-500',
    warning: 'bg-warning-600 text-white hover:bg-warning-700 focus:ring-warning-500',
    outline:
      'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700',
  }

  const sizeClasses: Record<Size, string> = {
    xs: 'px-2 py-0.5 text-xs gap-1',
    sm: 'px-2.5 py-1 text-xs gap-1',
    md: 'px-3 py-1.5 text-sm gap-1.5',
    lg: 'px-4 py-2 text-base gap-2',
  }

  const iconOnly = !children && icon

  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center rounded-md font-medium transition-all duration-150',
        'focus:outline-none focus:ring-2 focus:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'active:scale-[0.98]',
        variantClasses[variant],
        iconOnly
          ? {
              xs: 'w-5 h-5',
              sm: 'w-6 h-6',
              md: 'w-7 h-7',
              lg: 'w-8 h-8',
            }[size]
          : sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin shrink-0" />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <span className={clsx(iconOnly ? '' : 'shrink-0')}>
              {typeof icon === 'number' ? <Loader2 size={14} className="animate-spin" /> : icon}
            </span>
          )}
          {children && <span>{children}</span>}
          {icon && iconPosition === 'right' && (
            <span className={clsx(iconOnly ? '' : 'shrink-0')}>
              {typeof icon === 'number' ? <Loader2 size={14} className="animate-spin" /> : icon}
            </span>
          )}
        </>
      )}
    </button>
  )
}
