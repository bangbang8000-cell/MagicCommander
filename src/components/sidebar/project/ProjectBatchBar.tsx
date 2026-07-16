import { useTranslation } from 'react-i18next'
import { CheckSquare, Square, Trash2 } from 'lucide-react'

type ProjectBatchBarProps = {
  selectedCount: number
  allSelected: boolean
  onToggleAll: () => void
  onRender: () => void
  onDelete: () => void
}

export function ProjectBatchBar({ selectedCount, allSelected, onToggleAll, onRender, onDelete }: ProjectBatchBarProps) {
  const { t } = useTranslation('project')
  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-200 dark:border-gray-700 text-xs">
      <button
        onClick={onToggleAll}
        className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
        全选
      </button>
      <button
        onClick={onRender}
        disabled={selectedCount === 0}
        className="px-1.5 py-1 rounded hover:bg-primary-50 dark:hover:bg-primary-900/30 disabled:opacity-40"
      >
        {t('projectBatch.batchRender')}
      </button>
      <button
        onClick={onDelete}
        disabled={selectedCount === 0}
        className="ml-auto flex items-center gap-1 px-1.5 py-1 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40"
      >
        <Trash2 size={13} />
        {t('projectBatch.delete')} {selectedCount || ''}
      </button>
    </div>
  )
}
