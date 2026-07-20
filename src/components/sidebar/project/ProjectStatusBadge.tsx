import clsx from 'clsx'
import type { ProjectStatus } from '@/types/project'

type ProjectStatusBadgeProps = {
  status?: ProjectStatus
}

export function ProjectStatusBadge({ status }: ProjectStatusBadgeProps) {
  if (!status) return null

  const items = [
    { show: !status.hasPara, label: '缺参数', tone: 'red' },
    { show: !status.hasTemplates, label: '缺模板', tone: 'amber' },
    { show: status.hasExcel && status.hasTemplates && status.hasPara, label: '可渲染', tone: 'green' },
    { show: status.hasOutput || status.hasYaml || status.hasLabelOutput, label: '有输出', tone: 'blue' },
  ].filter((item) => item.show)

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item.label}
          className={clsx(
            'rounded px-1.5 py-0.5 text-[11px]',
            item.tone === 'red' && 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
            item.tone === 'amber' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
            item.tone === 'green' && 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200',
            item.tone === 'blue' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
          )}
        >
          {item.label}
        </span>
      ))}
    </div>
  )
}
