import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import type { SyncStatusResponse } from '@/api/platform'
import { Check, Cloud, ArrowUp, ArrowDown, AlertTriangle, Minus } from 'lucide-react'

type SyncStatusBadgeProps = {
  syncStatus?: SyncStatusResponse
  className?: string
}

export function SyncStatusBadge({ syncStatus, className }: SyncStatusBadgeProps) {
  const { t } = useTranslation()

  const statusConfig: Record<string, { icon: typeof Check; labelKey: string; color: string }> = {
    synced: { icon: Check, labelKey: 'cloud:syncStatus.synced', color: 'text-green-500' },
    local_only: { icon: Minus, labelKey: 'cloud:syncStatus.localOnly', color: 'text-gray-400' },
    remote_only: { icon: Cloud, labelKey: 'cloud:syncStatus.remoteOnly', color: 'text-blue-500' },
    local_ahead: { icon: ArrowUp, labelKey: 'cloud:syncStatus.localAhead', color: 'text-orange-500' },
    remote_ahead: { icon: ArrowDown, labelKey: 'cloud:syncStatus.remoteAhead', color: 'text-blue-500' },
    conflict: { icon: AlertTriangle, labelKey: 'cloud:syncStatus.conflict', color: 'text-red-500' },
  }

  if (!syncStatus) return null

  const config = statusConfig[syncStatus.status] || statusConfig.local_only
  const Icon = config.icon
  const label = t(config.labelKey)

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 text-[10px]',
        config.color,
        className,
      )}
      title={label}
    >
      <Icon size={10} />
      {label}
    </span>
  )
}