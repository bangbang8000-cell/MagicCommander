import { useTranslation } from 'react-i18next'
import { ArrowUpDown, Plus, Save, Search } from 'lucide-react'

type ProjectListToolbarProps = {
  search: string
  sortBy: 'name' | 'date'
  canSaveTemplate: boolean
  onSearchChange: (value: string) => void
  onToggleSort: () => void
  onCreate: () => void
  onSaveTemplate: () => void
}

export function ProjectListToolbar({
  search,
  sortBy,
  canSaveTemplate,
  onSearchChange,
  onToggleSort,
  onCreate,
  onSaveTemplate,
}: ProjectListToolbarProps) {
  const { t } = useTranslation('project')
  return (
    <div className="p-2 border-b border-gray-200 dark:border-gray-700 space-y-2">
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('projectList.searchPlaceholder')}
            className="w-full pl-7 pr-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 outline-none focus:border-primary-400"
          />
        </div>
        <button
          onClick={onToggleSort}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          title={sortBy === 'name' ? t('projectList.sortByName') : t('projectList.sortByDate')}
        >
          <ArrowUpDown size={14} />
        </button>
        <button onClick={onCreate} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700" title={t('projectList.newProject')}>
          <Plus size={14} />
        </button>
        <button
          onClick={onSaveTemplate}
          disabled={!canSaveTemplate}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
          title={t('projectList.saveAsTemplate')}
        >
          <Save size={14} />
        </button>
      </div>
    </div>
  )
}
