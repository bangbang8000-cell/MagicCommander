import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlatformStore } from '@/stores/platform.store'
import { useUIStore } from '@/stores/ui.store'
import { client, type VersionInfo } from '@/api/platform'
import { Cloud, CloudOff, CloudRain, Wifi } from 'lucide-react'
import clsx from 'clsx'

type ConnectionState = 'unknown' | 'checking' | 'connected' | 'error'

const CURRENT_BUILD = '26090601'

export function CloudStatusIndicator() {
  const { t } = useTranslation()
  const isDark = useUIStore((s) => s.isDark)
  const baseUrl = usePlatformStore((s) => s.baseUrl)
  const loggedIn = usePlatformStore((s) => s.loggedIn)
  const setActiveActivity = useUIStore((s) => s.setActiveActivity)

  const [connState, setConnState] = useState<ConnectionState>('unknown')
  const [hasUpdate, setHasUpdate] = useState(false)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)

  useEffect(() => {
    if (!baseUrl) {
      setConnState('unknown')
      return
    }

    setConnState('checking')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    fetch(`${baseUrl.replace(/\/+$/, '')}/api/v1/health`, { signal: controller.signal })
      .then((res) => {
        clearTimeout(timeout)
        setConnState(res.ok ? 'connected' : 'error')
      })
      .catch(() => {
        clearTimeout(timeout)
        setConnState('error')
      })

    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [baseUrl])

  // Check for version updates
  useEffect(() => {
    if (loggedIn) {
      client
        .version()
        .then((info) => {
          setVersionInfo(info)
          if (info.latest_build && info.latest_build > CURRENT_BUILD) {
            setHasUpdate(true)
          }
        })
        .catch(() => {})
    }
  }, [loggedIn])

  const handleClick = () => {
    setActiveActivity('settings')
  }

  const colorClass = (() => {
    switch (connState) {
      case 'connected': return loggedIn ? 'text-green-400' : 'text-yellow-400'
      case 'error': return 'text-red-400'
      case 'checking': return 'text-gray-400 animate-pulse'
      default: return 'text-gray-500'
    }
  })()

  const tooltip = (() => {
    if (!baseUrl) return t('cloud:status.notConfigured')
    const parts: string[] = []
    switch (connState) {
      case 'connected':
        parts.push(loggedIn
          ? `${t('cloud:status.connected')} - ${t('cloud:status.loggedIn') || '已登录'}`
          : `${t('cloud:status.connected')} - ${t('cloud:status.notLoggedIn')}`)
        break
      case 'error': parts.push(t('cloud:status.error')); break
      case 'checking': parts.push(t('cloud:status.connecting')); break
      default: parts.push(t('cloud:status.disconnected'))
    }
    if (hasUpdate && versionInfo) {
      parts.push(`${t('cloud:status.updateAvailable') || '有新版本'}: ${versionInfo.latest_version}`)
    }
    return parts.join('\n')
  })()

  return (
    <button
      onClick={handleClick}
      className={clsx('p-1.5 rounded transition-colors relative', isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200')}
      title={tooltip}
    >
      <Cloud size={16} className={colorClass} />
      {hasUpdate && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-gray-800" />
      )}
    </button>
  )
}