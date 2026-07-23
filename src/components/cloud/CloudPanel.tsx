import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutDashboard, Package, Cloud } from 'lucide-react'
import clsx from 'clsx'
import { DashboardView } from './DashboardView'
import { RemoteProjectView } from './RemoteProjectView'
import { TemplateMarket } from './TemplateMarket'
import { LoginDialog } from '@/components/auth/LoginDialog'
import { SearchInput } from '@/components/ui/SearchInput'
import { usePlatformStore } from '@/stores/platform.store'

type CloudTab = 'dashboard' | 'templates' | 'projects'

export function CloudPanel() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<CloudTab>('dashboard')
  const [showLogin, setShowLogin] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const loggedIn = usePlatformStore((s) => s.loggedIn)

  const tabs: { id: CloudTab; icon: React.ReactNode; labelKey: string }[] = [
    { id: 'dashboard', icon: <LayoutDashboard size={14} />, labelKey: 'cloud:panel.tabDashboard' },
    { id: 'templates', icon: <Package size={14} />, labelKey: 'cloud:panel.tabTemplates' },
    { id: 'projects', icon: <Cloud size={14} />, labelKey: 'cloud:panel.tabProjects' },
  ]

  const handlePullSuccess = useCallback(() => {
    window.dispatchEvent(new CustomEvent('project:refresh'))
  }, [])

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />
      case 'templates':
        return <TemplateMarket searchQuery={searchQuery} />
      case 'projects':
        return <RemoteProjectView onPullSuccess={handlePullSuccess} searchQuery={searchQuery} />
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('cloud:panel.title')}
        </h2>
        {!loggedIn && (
          <button
            onClick={() => setShowLogin(true)}
            className="px-3 py-1 text-xs text-white bg-primary-500 hover:bg-primary-600 rounded-md transition-colors"
          >
            {t('cloud:login')}
          </button>
        )}
      </div>

      {/* Search bar */}
      {activeTab !== 'dashboard' && (
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t('cloud:search.placeholder')}
          />
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            {tab.icon}
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>

      {/* Login dialog */}
      {showLogin && (
        <LoginDialog
          open={showLogin}
          onClose={() => setShowLogin(false)}
        />
      )}
    </div>
  )
}