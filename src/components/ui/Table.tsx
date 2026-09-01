import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import clsx from 'clsx'

/**
 * 通用表格（4.1 F1-3：视觉收敛到契约 token）
 * - 表头：app-surface / text-secondary
 * - 行 hover：app-hover
 * - 细分隔：edge-subtle
 * 行为基准由原生 <table> 语义保证。
 */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={clsx('w-full text-sm border-collapse', className)} {...props} />
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={clsx('bg-app-surface text-text-secondary', className)} {...props} />
}

export function TableHeaderCell({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={clsx('text-start px-3 py-2 text-xs font-medium', className)} {...props} />
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={clsx('bg-app', className)} {...props} />
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={clsx('hover:bg-app-hover transition-colors', className)} {...props} />
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={clsx('px-3 py-2 border-t border-edge-subtle text-text-primary', className)} {...props} />
}
