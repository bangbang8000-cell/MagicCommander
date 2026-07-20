import { useTranslation } from 'react-i18next'
import { Grid2X2, List, Search } from 'lucide-react'
import clsx from 'clsx'

type TemplateListToolbarProps = {
  query: string
  sortBy: 'name' | 'updatedAt' | 'sourceProject'
  viewMode: 'card' | 'compact'
  category: string
  categories: string[]
  onQueryChange: (value: string) => void
  onSortChange: (value: 'name' | 'updatedAt' | 'sourceProject') => void
  onViewModeChange: (value: 'card' | 'compact') => void
  onCategoryChange: (value: string) => void
}

export function TemplateListToolbar({
  query,
  sortBy,
  viewMode,
  category,
  categories,
  onQueryChange,
  onSortChange,
  onViewModeChange,
  onCategoryChange,
}: TemplateListToolbarProps) {
  const { t } = useTranslation('project')

  const getCategoryLabel = (cat: string): string => {
    if (cat === 'all') return t('template.category.all')
    return cat
  }

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
      {/* 分类筛选 */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={clsx(
                'px-2 py-0.5 rounded text-[11px] transition-colors',
                category === cat
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
              )}
            >
              {getCategoryLabel(cat)}
            </button>
          ))}
        </div>
      )}
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
