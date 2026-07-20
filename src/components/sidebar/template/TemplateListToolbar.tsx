import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import clsx from 'clsx'

type TemplateListToolbarProps = {
  query: string
  sortBy: 'name' | 'updatedAt' | 'sourceProject'
  category: string
  categories: string[]
  onQueryChange: (value: string) => void
  onSortChange: (value: 'name' | 'updatedAt' | 'sourceProject') => void
  onCategoryChange: (value: string) => void
}

export function TemplateListToolbar({
  query,
  sortBy,
  category,
  categories,
  onQueryChange,
  onSortChange,
  onCategoryChange,
}: TemplateListToolbarProps) {
  const { t } = useTranslation('project')

  return (
    <div className="p-2 border-b border-gray-200 dark:border-gray-700 space-y-1.5">
      {/* 第1行：搜索 + 排序 */}
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('template.list.searchPlaceholder')}
            className="w-full pl-6 pr-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 outline-none focus:border-primary-400"
          />
        </div>
        <select
          value={sortBy}
          onChange={(event) => onSortChange(event.target.value as 'name' | 'updatedAt' | 'sourceProject')}
          className="text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-1.5 py-1 w-[72px] shrink-0"
        >
          <option value="name">{t('template.list.sortByName')}</option>
          <option value="updatedAt">{t('template.list.sortByUpdated')}</option>
          <option value="sourceProject">{t('template.list.sortBySource')}</option>
        </select>
      </div>

      {/* 第2行：分类标签（仅多分类时显示） */}
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
              {cat === 'all' ? t('template.category.all') : cat}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
