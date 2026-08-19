import { useTranslation } from 'react-i18next'
import { ArrowUpDown, Download, Plus, Save, Search } from 'lucide-react'

type ProjectListToolbarProps = {
  search: string
  sortBy: 'name' | 'date'
  canSaveTemplate: boolean
  onSearchChange: (value: string) => void
  onToggleSort: () => void
  onCreate: () => void
  onSaveTemplate: () => void
  onImportAl: () => void
}

export function ProjectListToolbar({
  search,
  sortBy,
  canSaveTemplate,
  onSearchChange,
  onToggleSort,
  onCreate,
  onSaveTemplate,
  onImportAl,
}: ProjectListToolbarProps) {
  const { t } = useTranslation('project')
  const btnCls = 'flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed'
  return (
    <div className="p-2 border-b border-gray-200 dark:border-gray-700 space-y-2">
      {/* 第一行：搜索 + 排序 */}
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
      </div>
      {/* 打磨轮（v1.2 / MC-1）：主操作改带文字按钮，提升可发现性 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={onCreate} className={btnCls}>
          <Plus size={13} />
          {t('projectList.newProject')}
        </button>
        <button onClick={onImportAl}
          className={`${btnCls} text-emerald-600 dark:text-emerald-400`}
          title="导入 AutoLink 项目（导入→校验→细化→渲染→校对）">
          <Download size={13} />
          {t('projectList.importAl')}
        </button>
        <button onClick={onSaveTemplate} disabled={!canSaveTemplate} className={btnCls}>
          <Save size={13} />
          {t('projectList.saveAsTemplate')}
        </button>
      </div>
    </div>
  )
}
