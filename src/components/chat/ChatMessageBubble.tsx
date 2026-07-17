import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'
import { User, Bot, Copy, Check } from 'lucide-react'
import { useState, useCallback } from 'react'
import type { ChatMessage } from '@/types/chat'
import { formatFileSize } from '@/types/chat'
import { AttachmentPreview } from './AttachmentPreview'

interface ChatMessageBubbleProps {
  message: ChatMessage
  isDark: boolean
}

export function ChatMessageBubble({ message, isDark }: ChatMessageBubbleProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }, [message.content])

  if (isSystem) {
    return (
      <div
        className={clsx(
          'px-4 py-2 text-xs text-center italic',
          isDark ? 'text-gray-500' : 'text-gray-400',
        )}
      >
        {message.content}
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'flex gap-3 px-4 py-3 group',
        isUser ? (isDark ? 'bg-gray-800/50' : 'bg-gray-50') : '',
      )}
    >
      {/* 头像 */}
      <div
        className={clsx(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5',
          isUser
            ? (isDark ? 'bg-blue-600' : 'bg-blue-500')
            : (isDark ? 'bg-emerald-600' : 'bg-emerald-500'),
        )}
      >
        {isUser ? (
          <User size={16} className="text-white" />
        ) : (
          <Bot size={16} className="text-white" />
        )}
      </div>

      {/* 消息内容 */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {/* 角色标签 */}
        <div className="flex items-center gap-2 mb-1">
          <span className={clsx('text-xs font-semibold', isDark ? 'text-gray-300' : 'text-gray-700')}>
            {isUser ? t('chat:role.user') : t('chat:role.assistant')}
          </span>
          <span className={clsx('text-[10px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>

        {/* 附件 */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {message.attachments.map((att) => (
              <AttachmentPreview key={att.id} attachment={att} isDark={isDark} compact />
            ))}
          </div>
        )}

        {/* Markdown 内容 */}
        <div
          className={clsx(
            'prose prose-sm max-w-none',
            isDark ? 'prose-invert' : '',
            'prose-pre:rounded-lg prose-pre:text-xs prose-code:text-xs',
            'prose-headings:mt-3 prose-headings:mb-1',
            'prose-p:my-1 prose-ul:my-1 prose-ol:my-1',
            'prose-table:text-xs',
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>

        {/* 工具调用信息（Phase 2 预留） */}
        {message.metadata?.tools && message.metadata.tools.length > 0 && (
          <div className={clsx('mt-2 flex flex-wrap gap-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
            {message.metadata.tools.map((tool) => (
              <span
                key={tool}
                className={clsx(
                  'text-[10px] px-1.5 py-0.5 rounded',
                  isDark ? 'bg-gray-700' : 'bg-gray-200',
                )}
              >
                {tool}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 复制按钮 */}
      <button
        onClick={handleCopy}
        className={clsx(
          'shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity',
          isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500',
        )}
        title={t('common:app.copy')}
      >
        {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
      </button>
    </div>
  )
}