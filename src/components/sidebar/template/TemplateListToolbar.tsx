import { useTranslation } from 'react-i18next'
import { Grid2X2, List, Search } from 'lucide-react'

type TemplateListToolbarProps = {
  query: string
  sortBy: 'name' | 'updatedAt' | 'sourceProject'
  viewMode: 'card' | 'compact'
  onQueryChange: (value: string) => void
  onSortChange: (value: 'name' | 'updatedAt' | 'sourceProject') => void
  onViewModeChange: (value: 'card' | 'compact') => void
}

export function TemplateListToolbar({
  query,
  sortBy,
  viewMode,
  onQueryChange,
  onSortChange,
  onViewModeChange,
}: TemplateListToolbarProps) {
  const { t } = useTranslation('project')
  return (
    <div className="p-2 border-b border-gray-200 dark:border-gray-700 space-y-2">
      <div className="relative">
        <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('template.list.searchPlaceholder')}
          className="w-full pl-7 pr-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 outline-none focus:border-primary-400"
        />
      </div>
      <div className="flex items-center gap-1 text-xs">
        <select
          value={sortBy}
          onChange={(event) => onSortChange(event.target.value as 'name' | 'updatedAt' | 'sourceProject')}
          className="flex-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1"
        >
          <option value="name">{t('template.list.sortByName')}</option>
          <option value="updatedAt">{t('template.list.sortByUpdated')}</option>
          <option value="sourceProject">{t('template.list.sortBySource')}</option>
        </select>
        <button
          onClick={() => onViewModeChange(viewMode === 'card' ? 'compact' : 'card')}
          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          title={t('template.list.toggleView')}
        >
          {viewMode === 'card' ? <List size={14} /> : <Grid2X2 size={14} />}
        </button>
      </div>
    </div>
  )
}
