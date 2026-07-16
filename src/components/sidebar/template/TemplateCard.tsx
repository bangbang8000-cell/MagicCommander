import clsx from 'clsx'
import { Edit3, Plus, Trash2 } from 'lucide-react'
import type { TemplateInfo } from '@/types/project'
import { ProjectStatusBadge } from '@/components/sidebar/project/ProjectStatusBadge'

type TemplateCardProps = {
  template: TemplateInfo
  selected: boolean
  compact: boolean
  onSelect: () => void
  onCreateProject: () => void
  onEdit: () => void
  onDelete: () => void
}

export function TemplateCard({ template, selected, compact, onSelect, onCreateProject, onEdit, onDelete }: TemplateCardProps) {
  return (
    <div
      className={clsx(
        'rounded border p-2 text-xs cursor-pointer transition-colors',
        selected
          ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/30'
          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800',
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{template.name}</div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{template.scenario || '未设置场景'}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={(event) => { event.stopPropagation(); onCreateProject() }} className="p-1 rounded hover:bg-white dark:hover:bg-gray-700" title="从模板建立项目">
            <Plus size={13} />
          </button>
          <button onClick={(event) => { event.stopPropagation(); onEdit() }} className="p-1 rounded hover:bg-white dark:hover:bg-gray-700" title="编辑模板信息">
            <Edit3 size={13} />
          </button>
          <button onClick={(event) => { event.stopPropagation(); onDelete() }} className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="删除模板">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {!compact && (
        <div className="mt-2 space-y-1 text-[11px] text-gray-600 dark:text-gray-300">
          <div className="line-clamp-2">{template.description || '暂无简介'}</div>
          <div>来源项目：{template.sourceProject || '未知'}</div>
          <ProjectStatusBadge status={template.structure} />
        </div>
      )}
    </div>
  )
}
