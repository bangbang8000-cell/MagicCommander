import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/ui.store'
import { Settings, Cpu, Globe, Palette, Shield, Sun, Moon, Monitor } from 'lucide-react'
import clsx from 'clsx'

/**
 * 设置面板
 * Phase 2 将实现：大模型配置、API Key 管理、Provider 切换等
 */
export function SettingsPanel() {
  const { t } = useTranslation()
  const isDark = useUIStore((s) => s.isDark)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)

  const themeOptions: { value: 'light' | 'dark' | 'system'; icon: React.ReactNode; label: string }[] = [
    { value: 'light', icon: <Sun size={16} />, label: t('menu.lightMode') },
    { value: 'dark', icon: <Moon size={16} />, label: t('menu.darkMode') },
    { value: 'system', icon: <Monitor size={16} />, label: t('menu.systemMode') },
  ]

  const sections = [
    {
      icon: <Cpu size={16} />,
      title: t('common:settings.ai.title'),
      desc: t('common:settings.ai.desc'),
      coming: true,
    },
    {
      icon: <Globe size={16} />,
      title: t('common:settings.general.title'),
      desc: t('common:settings.general.desc'),
      coming: true,
    },
    {
      icon: <Palette size={16} />,
      title: t('common:settings.appearance.title'),
      desc: t('common:settings.appearance.desc'),
      coming: false,
    },
    {
      icon: <Shield size={16} />,
      title: t('common:settings.advanced.title'),
      desc: t('common:settings.advanced.desc'),
      coming: true,
    },
  ]

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Settings size={16} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
          <span className={clsx('text-sm font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>
            {t('common:settings.title')}
          </span>
        </div>

        {sections.map((section) => (
          <div
            key={section.title}
            className={clsx(
              'rounded-lg border p-3 transition-colors',
              isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50',
              section.coming ? 'opacity-60' : '',
            )}
          >
            <div className="flex items-start gap-3">
              <div className={clsx('mt-0.5', isDark ? 'text-gray-400' : 'text-gray-500')}>
                {section.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className={clsx('text-sm font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>
                    {section.title}
                  </h4>
                  {section.coming && (
                    <span className={clsx(
                      'text-[10px] px-1.5 py-0.5 rounded',
                      isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-600',
                    )}>
                      {t('common:settings.comingSoon')}
                    </span>
                  )}
                </div>
                <p className={clsx('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-400')}>
                  {section.desc}
                </p>

                {/* 外观主题切换 */}
                {!section.coming && section.title === t('common:settings.appearance.title') && (
                  <div className="flex gap-1.5 mt-3">
                    {themeOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setTheme(opt.value)}
                        className={clsx(
                          'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-colors',
                          theme === opt.value
                            ? isDark
                              ? 'bg-blue-600 text-white'
                              : 'bg-blue-500 text-white'
                            : isDark
                              ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              : 'bg-gray-200 text-gray-600 hover:bg-gray-300',
                        )}
                      >
                        {opt.icon}
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}