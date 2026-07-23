import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Package, Download, Loader2, Clock, Tag, User } from 'lucide-react'
import { usePlatformStore } from '@/stores/platform.store'
import type { RemoteTemplate } from '@/api/platform'

interface TemplateMarketProps {
  searchQuery: string
}

export function TemplateMarket({ searchQuery }: TemplateMarketProps) {
  const { t } = useTranslation()
  const [category, setCategory] = useState('')
  const [installing, setInstalling] = useState<string | null>(null)

  const {
    remoteTemplates,
    remoteLoading,
    loggedIn,
    fetchRemoteTemplates,
    downloadTemplate,
  } = usePlatformStore()

  // Fetch templates when search or category changes
  useEffect(() => {
    fetchRemoteTemplates(searchQuery, category)
  }, [searchQuery, category, fetchRemoteTemplates])

  const handleInstall = useCallback(
    async (template: RemoteTemplate) => {
      const key = template.full_name || `${template.owner}/${template.name}`
      setInstalling(key)
      try {
        await downloadTemplate(template.owner, template.name)
      } catch (err) {
        alert((err as Error).message)
      } finally {
        setInstalling(null)
      }
    },
    [downloadTemplate],
  )

  const categories = [
    { value: '', label: t('cloud:categories.all') || '全部' },
    { value: 'switch', label: t('cloud:categories.switch') || '交换机' },
    { value: 'router', label: t('cloud:categories.router') || '路由器' },
    { value: 'firewall', label: t('cloud:categories.firewall') || '防火墙' },
    { value: 'wireless', label: t('cloud:categories.wireless') || '无线' },
    { value: 'other', label: t('cloud:categories.other') || '其他' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Category filter */}
      <div className="flex gap-1 px-4 py-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setCategory(cat.value)}
            className={`px-2.5 py-1 rounded text-xs whitespace-nowrap transition-colors ${
              category === cat.value
                ? 'bg-primary-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Template list */}
      <div className="flex-1 overflow-auto">
        {!loggedIn && (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">
            {t('cloud:dashboard.notLoggedIn')}
          </div>
        )}

        {loggedIn && remoteLoading && (
          <div className="flex items-center justify-center p-8">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        )}

        {loggedIn && !remoteLoading && remoteTemplates.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">
            {searchQuery
              ? t('cloud:search.noResultsTemplates')
              : t('cloud:noTemplates')}
          </div>
        )}

        {loggedIn &&
          !remoteLoading &&
          remoteTemplates.map((template) => (
            <div
              key={template.id}
              className="px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Package size={14} className="text-primary-500 shrink-0" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {template.name}
                    </span>
                    <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                      {template.category || t('cloud:categories.other') || '其他'}
                    </span>
                  </div>
                  {template.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                      {template.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                      <User size={10} />
                      {template.owner}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                      <Clock size={10} />
                      {new Date(template.updated_at).toLocaleDateString()}
                    </span>
                    {template.topics && template.topics.length > 0 && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                        <Tag size={10} />
                        {template.topics.slice(0, 3).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleInstall(template)}
                  disabled={installing === (template.full_name || `${template.owner}/${template.name}`)}
                    className="ml-3 px-3 py-1.5 text-xs rounded-md bg-primary-500 hover:bg-primary-600 text-white disabled:opacity-50 transition-colors shrink-0 flex items-center gap-1"
                  >
                    {installing === (template.full_name || `${template.owner}/${template.name}`) ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Download size={12} />
                  )}
                  {t('cloud:dashboard.install')}
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}