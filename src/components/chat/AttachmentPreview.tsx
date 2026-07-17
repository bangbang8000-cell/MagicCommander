import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import { X, FileText, FileSpreadsheet, FileCode, Settings, Paperclip } from 'lucide-react'
import type { ChatAttachment, AttachmentType } from '@/types/chat'
import { formatFileSize } from '@/types/chat'

interface AttachmentPreviewProps {
  attachment: ChatAttachment
  isDark: boolean
  compact?: boolean
  onRemove?: (id: string) => void
}

const ATTACHMENT_ICONS: Record<AttachmentType, React.ReactNode> = {
  template: <FileText size={14} />,
  excel: <FileSpreadsheet size={14} />,
  yaml: <FileCode size={14} />,
  config: <Settings size={14} />,
  document: <FileText size={14} />,
  other: <Paperclip size={14} />,
}

const ATTACHMENT_COLORS: Record<AttachmentType, string> = {
  template: 'text-blue-500 bg-blue-50 dark:bg-blue-900/30',
  excel: 'text-green-500 bg-green-50 dark:bg-green-900/30',
  yaml: 'text-orange-500 bg-orange-50 dark:bg-orange-900/30',
  config: 'text-purple-500 bg-purple-50 dark:bg-purple-900/30',
  document: 'text-gray-500 bg-gray-50 dark:bg-gray-700/50',
  other: 'text-gray-400 bg-gray-50 dark:bg-gray-700/50',
}

export function AttachmentPreview({ attachment, isDark, compact, onRemove }: AttachmentPreviewProps) {
  const { t } = useTranslation()
  const icon = ATTACHMENT_ICONS[attachment.type] || ATTACHMENT_ICONS.other

  if (compact) {
    return (
      <div
        className={clsx(
          'inline-flex items-center gap-1 px-2 py-1 rounded text-xs',
          ATTACHMENT_COLORS[attachment.type],
        )}
      >
        {icon}
        <span className="truncate max-w-[120px]">{attachment.name}</span>
        <span className="opacity-60">{formatFileSize(attachment.size)}</span>
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-3 py-2 rounded-lg border',
        isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white',
      )}
    >
      <div className={clsx('p-1.5 rounded', ATTACHMENT_COLORS[attachment.type])}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={clsx('text-sm truncate', isDark ? 'text-gray-200' : 'text-gray-700')}>
          {attachment.name}
        </div>
        <div className={clsx('text-[11px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
          {formatFileSize(attachment.size)}
        </div>
      </div>
      {onRemove && (
        <button
          onClick={() => onRemove(attachment.id)}
          className={clsx(
            'p-1 rounded transition-colors',
            isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500',
          )}
          title={t('common:app.delete')}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}