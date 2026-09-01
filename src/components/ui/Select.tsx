import clsx from 'clsx'
import { forwardRef } from 'react'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[]
}

/**
 * 通用选择器（4.0 组件行为契约）
 * 基于原生 <select> 的受控封装，行为基准：打开/选择/禁用/键盘操作由浏览器保证。
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ options, className, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={clsx(
        'w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm',
        'text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
})

Select.displayName = 'Select'
