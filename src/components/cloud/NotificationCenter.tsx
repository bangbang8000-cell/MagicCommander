import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlatformStore } from '@/stores/platform.store'
import { client, type Announcement } from '@/api/platform'
import { Bell, Info, AlertTriangle, Megaphone, Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface NotificationCenterProps {
  isDark: boolean
}

export function NotificationCenter({ isDark }: NotificationCenterProps) {
  const { t } = useTranslation()
  const loggedIn = usePlatformStore((s) => s.loggedIn)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)

  useEffect(() => {
    if (loggedIn) {
      setLoading(true)
      client
        .notifications()
        .then((data) => {
          setAnnouncements(data.announcements || [])
          if (data.announcements?.length > 0) setHasUnread(true)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [loggedIn])

  const levelIcon = (level: Announcement['level']) => {
    switch (level) {
      case 'important':
        return <Megaphone size={12} className="text-red-400" />
      case 'warning':
        return <AlertTriangle size={12} className="text-yellow-400" />
      default:
        return <Info size={12} className="text-blue-400" />
    }
  }

  const levelColor = (level: Announcement['level']) => {
    switch (level) {
      case 'important':
        return 'border-red-800 bg-red-900/20'
      case 'warning':
        return 'border-yellow-800 bg-yellow-900/20'
      default:
        return 'border-blue-800 bg-blue-900/20'
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen(!open)
          if (!open) setHasUnread(false)
        }}
        className={clsx(
          'p-1.5 rounded transition-colors relative',
          isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200',
        )}
        title={t('cloud:dashboard.notifications')}
      >
        <Bell size={14} className="text-gray-400" />
        {hasUnread && (
          <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </button>

      {open && (
        <div
          className={clsx(
            'absolute right-0 top-full mt-1 w-72 rounded-lg shadow-lg z-50 overflow-hidden',
            isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200',
          )}
        >
          <div className="px-3 py-2 border-b border-gray-700">
            <span className={clsx('text-xs font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>
              {t('cloud:dashboard.notifications')}
            </span>
          </div>

          <div className="max-h-64 overflow-auto">
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={14} className="animate-spin text-gray-400" />
              </div>
            )}

            {!loading && announcements.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-gray-500">
                {t('cloud:notifications.empty') || '暂无通知'}
              </div>
            )}

            {!loading &&
              announcements.map((a) => (
                <div
                  key={a.id}
                  className={clsx('px-3 py-2 border-b border-gray-700/50', levelColor(a.level))}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5">{levelIcon(a.level)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-200">{a.title}</div>
                      {a.content && (
                        <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">
                          {a.content}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-500 mt-1">
                        {new Date(a.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>

          <div className="fixed inset-0 z-[-1]" onClick={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}