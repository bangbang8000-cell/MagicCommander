import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useRef } from 'react'
import clsx from 'clsx'
import { Plus, Trash2, MessageSquare, LayoutTemplate, FileCode, ChevronDown } from 'lucide-react'
import { useChatStore, simulateSendMessage } from '@/stores/chat.store'
import { useUIStore } from '@/stores/ui.store'
import type { ChatMode } from '@/types/chat'
import { CHAT_MODE_CONFIG } from '@/types/chat'
import { ChatMessageBubble } from './ChatMessageBubble'
import { ChatInput } from './ChatInput'

export function ChatPanel() {
  const { t } = useTranslation()
  const isDark = useUIStore((s) => s.isDark)

  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const createSession = useChatStore((s) => s.createSession)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const setActiveSession = useChatStore((s) => s.setActiveSession)
  const clearCurrentSession = useChatStore((s) => s.clearCurrentSession)
  const currentMode = useChatStore((s) => s.currentMode)
  const setMode = useChatStore((s) => s.setMode)
  const inputValue = useChatStore((s) => s.inputValue)
  const pendingAttachments = useChatStore((s) => s.pendingAttachments)
  const isSending = useChatStore((s) => s.isSending)
  const getActiveSession = useChatStore((s) => s.getActiveSession)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const activeSession = getActiveSession()

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeSession?.messages.length, isSending])

  // 如果没有活跃会话，自动创建
  useEffect(() => {
    if (!activeSessionId) {
      createSession()
    }
  }, [activeSessionId, createSession])

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isSending) return
    const store = useChatStore.getState()
    const mode = store.currentMode
    const atts = [...store.pendingAttachments]
    await simulateSendMessage(store, inputValue.trim(), mode, atts)
  }, [inputValue, isSending])

  const handleNewChat = useCallback(() => {
    createSession()
  }, [createSession])

  const handleClearChat = useCallback(() => {
    clearCurrentSession()
  }, [clearCurrentSession])

  const handleModeChange = useCallback(
    (mode: ChatMode) => {
      setMode(mode)
      // 创建新会话使用新模式
      createSession(mode)
    },
    [setMode, createSession],
  )

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div
        className={clsx(
          'flex items-center justify-between px-3 py-2 border-b shrink-0',
          isDark ? 'border-gray-700 bg-gray-900/60' : 'border-gray-200 bg-gray-50',
        )}
      >
        <h3
          className={clsx(
            'text-xs font-semibold uppercase tracking-wider',
            isDark ? 'text-gray-300' : 'text-gray-600',
          )}
        >
          {t('chat:title')}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewChat}
            className={clsx(
              'p-1 rounded transition-colors',
              isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500',
            )}
            title={t('chat:newChat')}
          >
            <Plus size={14} />
          </button>
          {activeSession?.messages.length ? (
            <button
              onClick={handleClearChat}
              className={clsx(
                'p-1 rounded transition-colors',
                isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500',
              )}
              title={t('chat:clearChat')}
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {/* 模式切换 */}
      <div
        className={clsx(
          'flex items-center gap-1 px-2 py-1.5 border-b shrink-0 overflow-x-auto',
          isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-100/50',
        )}
      >
        {(Object.entries(CHAT_MODE_CONFIG) as [ChatMode, typeof CHAT_MODE_CONFIG[ChatMode]][]).map(
          ([mode, config]) => {
            const isActive = currentMode === mode
            return (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                className={clsx(
                  'flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-blue-500 text-white'
                    : isDark
                      ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                      : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700',
                )}
              >
                {mode === 'template' && <LayoutTemplate size={12} />}
                {mode === 'config' && <FileCode size={12} />}
                {mode === 'general' && <MessageSquare size={12} />}
                {t(config.labelKey)}
              </button>
            )
          },
        )}
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto">
        {!activeSession || activeSession.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <MessageSquare
              size={40}
              className={clsx('mb-4', isDark ? 'text-gray-600' : 'text-gray-300')}
            />
            <h3 className={clsx('text-base font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-600')}>
              {t('chat:empty.title')}
            </h3>
            <p className={clsx('text-sm max-w-xs', isDark ? 'text-gray-500' : 'text-gray-400')}>
              {t('chat:empty.desc')}
            </p>
          </div>
        ) : (
          <div className="py-1">
            {activeSession.messages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} isDark={isDark} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 输入栏 */}
      <ChatInput isDark={isDark} onSend={handleSend} />
    </div>
  )
}