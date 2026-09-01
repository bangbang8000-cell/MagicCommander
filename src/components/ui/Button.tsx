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
  // 4.1 F1-3：视觉收敛到契约 token（primary/secondary/ghost/danger × sm/md/lg，radius-md）
  const variantClasses: Record<Variant, string> = {
    primary: 'bg-primary text-white hover:bg-primary-hover focus:ring-focus',
    secondary: 'bg-app-surface text-text-primary hover:bg-app-hover border border-edge-subtle',
    ghost: 'text-text-secondary hover:bg-app-hover',
    danger: 'bg-danger text-white hover:bg-danger-700 focus:ring-danger',
    success: 'bg-success text-white hover:bg-success-700 focus:ring-success',
    warning: 'bg-warning text-white hover:bg-warning-700 focus:ring-warning',
    outline: 'border border-edge-subtle text-text-primary hover:bg-app-hover',
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
        'inline-flex items-center justify-center rounded-[var(--radius-md)] font-medium transition-all duration-150',
        'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-app',
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
