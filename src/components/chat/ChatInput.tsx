import { useTranslation } from 'react-i18next'
import { useRef, useCallback, type KeyboardEvent } from 'react'
import clsx from 'clsx'
import { Send, Paperclip, X, Loader2 } from 'lucide-react'
import { useChatStore } from '@/stores/chat.store'
import { AttachmentPreview } from './AttachmentPreview'

interface ChatInputProps {
  isDark: boolean
  onSend: () => void
}

export function ChatInput({ isDark, onSend }: ChatInputProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const inputValue = useChatStore((s) => s.inputValue)
  const setInputValue = useChatStore((s) => s.setInputValue)
  const pendingAttachments = useChatStore((s) => s.pendingAttachments)
  const addAttachment = useChatStore((s) => s.addAttachment)
  const removeAttachment = useChatStore((s) => s.removeAttachment)
  const isSending = useChatStore((s) => s.isSending)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (!isSending && inputValue.trim()) {
          onSend()
        }
      }
    },
    [onSend, isSending, inputValue],
  )

  const handleFileSelect = useCallback(async () => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return

      for (let i = 0; i < files.length; i++) {
        await addAttachment(files[i])
      }
      // 重置 input 以便重复选择同一文件
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [addAttachment],
  )

  const canSend = !isSending && inputValue.trim().length > 0

  return (
    <div className={clsx('border-t', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50/50')}>
      {/* 待发送附件 */}
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-2">
          {pendingAttachments.map((att) => (
            <AttachmentPreview
              key={att.id}
              attachment={att}
              isDark={isDark}
              compact
              onRemove={removeAttachment}
            />
          ))}
        </div>
      )}

      {/* 输入区域 */}
      <div className="flex items-end gap-2 px-3 py-2">
        {/* 附件按钮 */}
        <button
          onClick={handleFileSelect}
          className={clsx(
            'p-2 rounded-lg transition-colors shrink-0',
            isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500',
          )}
          title={t('chat:input.attach')}
          disabled={isSending}
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
          accept=".xlsx,.xls,.yaml,.yml,.j2,.jinja2,.json,.toml,.md,.txt,.pdf,.csv,.cfg,.ini,.conf"
        />

        {/* 文本输入 */}
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('chat:input.placeholder')}
          rows={1}
          className={clsx(
            'flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none',
            'min-h-[36px] max-h-[120px]',
            isDark
              ? 'bg-gray-700 text-gray-100 placeholder-gray-500 focus:ring-1 focus:ring-blue-500'
              : 'bg-white text-gray-900 placeholder-gray-400 focus:ring-1 focus:ring-blue-400 border border-gray-200',
          )}
          disabled={isSending}
        />

        {/* 发送按钮 */}
        <button
          onClick={onSend}
          disabled={!canSend}
          className={clsx(
            'p-2 rounded-lg transition-colors shrink-0',
            canSend
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : (isDark ? 'bg-gray-700 text-gray-500' : 'bg-gray-200 text-gray-400'),
          )}
          title={t('chat:input.send')}
        >
          {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  )
}