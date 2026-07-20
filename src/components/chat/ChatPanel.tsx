import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Plus, Trash2, MessageSquare, LayoutTemplate, FileCode, ChevronDown, Settings, Wifi, WifiOff, AlertCircle, Clock, X, Check } from 'lucide-react'
import { useChatStore, sendMessage } from '@/stores/chat.store'
import { useUIStore } from '@/stores/ui.store'
import type { ChatMode } from '@/types/chat'
import { CHAT_MODE_CONFIG } from '@/types/chat'
import { ChatMessageBubble } from './ChatMessageBubble'
import { ChatInput } from './ChatInput'

// Provider 名称映射（与后端 PROVIDER_CATALOG 保持一致）
const PROVIDER_NAMES: Record<string, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
  qwen: 'Qwen',
  glm: 'GLM',
  grok: 'Grok',
  ollama: 'Ollama (本地)',
  custom: '自定义',
}

export function ChatPanel() {
  const { t } = useTranslation()
  const isDark = useUIStore((s) => s.isDark)

  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const hasHydrated = useChatStore((s) => s.hasHydrated)
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
  const aiHubStatus = useChatStore((s) => s.aiHubStatus)
  const setAIHubStatus = useChatStore((s) => s.setAIHubStatus)
  const aiHubProviders = useChatStore((s) => s.aiHubProviders)
  const setAIHubProviders = useChatStore((s) => s.setAIHubProviders)
  const selectedProvider = useChatStore((s) => s.selectedProvider)
  const setSelectedProvider = useChatStore((s) => s.setSelectedProvider)

  // 从 Settings 读取 AI 配置（不依赖 AI Hub 轮询）
  const aiConfig = useUIStore((s) => s.aiConfig)

  const [lastError, setLastError] = useState<string | null>(null)
  const [aiHubError, setAIHubError] = useState<string | null>(null)
  const [sessionListOpen, setSessionListOpen] = useState(false)
  const sessionListRef = useRef<HTMLDivElement>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const activeSession = getActiveSession()

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeSession?.messages.length, isSending])

  // 点击外部关闭会话列表
  useEffect(() => {
    if (!sessionListOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (sessionListRef.current && !sessionListRef.current.contains(e.target as Node)) {
        setSessionListOpen(false)
      }
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [sessionListOpen])

  // 等待 rehydrate 完成后，如果没有活跃会话则自动创建
  useEffect(() => {
    if (!hasHydrated) return
    if (!activeSessionId) {
      createSession()
    }
  }, [hasHydrated, activeSessionId, createSession])

  // AI Hub 状态轮询
  useEffect(() => {
    const poll = async () => {
      try {
        const status = await window.electron.aihub.status()
        setAIHubStatus(status)
        setAIHubError(null)
        if (status.running) {
          const providers = await window.electron.aihub.getProviders()
          setAIHubProviders(providers)
        }
      } catch (e: any) {
        setAIHubError(e?.message || 'AI Hub 连接失败')
      }
    }
    poll()
    const interval = setInterval(poll, 10000)
    return () => clearInterval(interval)
  }, [setAIHubStatus, setAIHubProviders])

  // 打开 ChatPanel 时自动启动 AI Hub
  useEffect(() => {
    const startAIHub = async () => {
      try {
        const status = await window.electron.aihub.status()
        if (!status.running && !status.installing) {
          console.log('[ChatPanel] AI Hub 未运行，自动启动...')
          await window.electron.aihub.start()
          // 等待启动完成
          for (let i = 0; i < 15; i++) {
            await new Promise((r) => setTimeout(r, 1000))
            const s = await window.electron.aihub.status()
            if (s.running) {
              setAIHubStatus(s)
              setAIHubError(null)
              const providers = await window.electron.aihub.getProviders()
              setAIHubProviders(providers)
              return
            }
          }
          setAIHubError('AI Hub 启动超时，请检查 Python 环境')
        }
      } catch (e: any) {
        console.error('[ChatPanel] AI Hub 启动失败:', e)
        setAIHubError(e?.message || 'AI Hub 启动失败')
      }
    }
    startAIHub()
  }, [])

  // 从 Settings 同步默认 Provider 到 chat store
  useEffect(() => {
    if (!selectedProvider && aiConfig.defaultProvider) {
      setSelectedProvider(aiConfig.defaultProvider)
    }
  }, [aiConfig.defaultProvider, selectedProvider, setSelectedProvider])

  // 构建 Provider 列表（合并 Settings 配置 + AI Hub 状态）
  const configuredProviders = Object.entries(aiConfig.providers)
    .filter(([, cfg]) => cfg.apiKey)
    .map(([key, cfg]) => ({
      key,
      name: PROVIDER_NAMES[key] || key,
      model: cfg.model || key,
      models: [cfg.model || ''],
      enabled: true,
      is_default: key === aiConfig.defaultProvider,
    }))
  // 如果 AI Hub 在运行，优先使用 AI Hub 的列表；否则使用 Settings 的
  const displayProviders = aiHubStatus.running && aiHubProviders.length > 0
    ? aiHubProviders
    : configuredProviders

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isSending) return
    setLastError(null)
    const store = useChatStore.getState()
    const mode = store.currentMode
    const atts = [...store.pendingAttachments]
    try {
      await sendMessage(store, inputValue.trim(), mode, atts)
    } catch (e: any) {
      setLastError(e?.message || t('chat:aihub.error.unknown'))
    }
  }, [inputValue, isSending, t])

  const handleNewChat = useCallback(() => {
    createSession()
  }, [createSession])

  const handleClearChat = useCallback(() => {
    clearCurrentSession()
  }, [clearCurrentSession])

  const handleModeChange = useCallback(
    (mode: ChatMode) => {
      setMode(mode)
      // 更新当前会话的模式，不创建新会话，保留对话历史
      const store = useChatStore.getState()
      store.updateSessionMode(mode)
    },
    [setMode],
  )

  const handleDeleteSession = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      deleteSession(id)
      setSessionListOpen(false)
    },
    [deleteSession],
  )

  const handleSwitchSession = useCallback(
    (id: string) => {
      setActiveSession(id)
      setSessionListOpen(false)
      // 同步 mode
      const session = sessions.find((s) => s.id === id)
      if (session) {
        setMode(session.mode)
      }
    },
    [setActiveSession, sessions, setMode],
  )

  const formatRelativeTime = (ts: number): string => {
    const now = Date.now()
    const diff = now - ts
    if (diff < 60000) return t('chat:session.justNow')
    if (diff < 3600000) return `${Math.floor(diff / 60000)}${t('chat:session.minAgo')}`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}${t('chat:session.hourAgo')}`
    if (diff < 172800000) return t('chat:session.yesterday')
    return new Date(ts).toLocaleDateString()
  }

  const modeLabel = (mode: ChatMode): string => {
    const config = CHAT_MODE_CONFIG[mode]
    return t(config.labelKey)
  }

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div
        className={clsx(
          'flex items-center justify-between px-3 py-1.5 border-b shrink-0',
          isDark ? 'border-gray-700 bg-gray-900/60' : 'border-gray-200 bg-gray-50',
        )}
      >
        <div className="flex items-center gap-2">
          <h3
            className={clsx(
              'text-xs font-semibold uppercase tracking-wider',
              isDark ? 'text-gray-300' : 'text-gray-600',
            )}
          >
            {t('chat:title')}
          </h3>
          {/* 会话列表下拉 */}
          <div className="relative" ref={sessionListRef}>
            <button
              onClick={() => setSessionListOpen(!sessionListOpen)}
              className={clsx(
                'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors',
                isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500',
              )}
              title={t('chat:session.list')}
            >
              <span className="max-w-[80px] truncate">
                {activeSession ? modeLabel(activeSession.mode) : t('chat:session.list')}
              </span>
              <ChevronDown size={10} className={clsx('transition-transform', sessionListOpen && 'rotate-180')} />
            </button>
            {sessionListOpen && (
              <div
                className={clsx(
                  'absolute top-full left-0 z-50 mt-1 w-64 py-1 rounded-lg shadow-lg border',
                  isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
                )}
              >
                <div className={clsx('px-3 py-1.5 text-[10px] font-semibold uppercase', isDark ? 'text-gray-500' : 'text-gray-400')}>
                  {t('chat:session.list')} ({sessions.length})
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {sessions.length === 0 ? (
                    <div className={clsx('px-3 py-4 text-xs text-center', isDark ? 'text-gray-500' : 'text-gray-400')}>
                      {t('chat:session.noSessions')}
                    </div>
                  ) : (
                    sessions
                      .slice()
                      .sort((a, b) => b.updatedAt - a.updatedAt)
                      .map((s) => {
                        const isActive = s.id === activeSessionId
                        return (
                          <div
                            key={s.id}
                            onClick={() => handleSwitchSession(s.id)}
                            className={clsx(
                              'flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors group',
                              isActive
                                ? (isDark ? 'bg-blue-900/30' : 'bg-blue-50')
                                : (isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'),
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                {isActive && <Check size={10} className="text-blue-500 shrink-0" />}
                                <span
                                  className={clsx(
                                    'text-xs truncate',
                                    isActive
                                      ? (isDark ? 'text-blue-300 font-medium' : 'text-blue-700 font-medium')
                                      : (isDark ? 'text-gray-300' : 'text-gray-700'),
                                  )}
                                >
                                  {s.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span
                                  className={clsx(
                                    'text-[10px] px-1 rounded',
                                    isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500',
                                  )}
                                >
                                  {modeLabel(s.mode)}
                                </span>
                                <span className={clsx('text-[10px] flex items-center gap-0.5', isDark ? 'text-gray-500' : 'text-gray-400')}>
                                  <Clock size={9} />
                                  {formatRelativeTime(s.updatedAt)}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => handleDeleteSession(s.id, e)}
                              className={clsx(
                                'shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity',
                                isDark ? 'hover:bg-red-900/50 text-gray-500 hover:text-red-400' : 'hover:bg-red-100 text-gray-400 hover:text-red-500',
                              )}
                              title={t('chat:session.delete')}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )
                      })
                  )}
                </div>
              </div>
            )}
          </div>
          {/* AI Hub 状态 */}
          <span
            className={clsx(
              'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full',
              aiHubStatus.installing
                ? (isDark ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-100 text-blue-700')
                : aiHubStatus.running
                  ? (isDark ? 'bg-green-900/50 text-green-400' : 'bg-green-100 text-green-700')
                  : (isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'),
            )}
            title={
              aiHubStatus.installing
                ? 'AI 依赖安装中...'
                : aiHubStatus.running
                  ? t('chat:aihub.status.running')
                  : aiHubStatus.lastError
                    ? `${t('chat:aihub.status.error')}: ${aiHubStatus.lastError}`
                    : t('chat:aihub.status.stopped')
            }
          >
            {aiHubStatus.installing ? (
              <span className="animate-pulse">...</span>
            ) : aiHubStatus.running ? (
              <Wifi size={10} />
            ) : (
              <WifiOff size={10} />
            )}
            {aiHubStatus.installing ? '...' : aiHubStatus.running ? 'AI' : '--'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Provider 选择 */}
          <select
            value={selectedProvider || ''}
            onChange={(e) => setSelectedProvider(e.target.value || undefined)}
            className={clsx(
              'text-[10px] px-1.5 py-0.5 rounded border outline-none',
              isDark
                ? 'bg-gray-800 border-gray-600 text-gray-300'
                : 'bg-white border-gray-300 text-gray-600',
            )}
            title={t('chat:aihub.provider.select')}
          >
            {displayProviders.length === 0 && (
              <option value="">{t('chat:aihub.provider.noProvider')}</option>
            )}
            {displayProviders.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name} ({p.model})
              </option>
            ))}
          </select>
          {/* 配置按钮 - 跳转到设置 */}
          <button
            onClick={() => useUIStore.getState().setActiveActivity('settings')}
            className={clsx(
              'p-1 rounded transition-colors',
              isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500',
            )}
            title={t('chat:aihub.provider.configure')}
          >
            <Settings size={13} />
          </button>
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

      {/* AI Hub 错误提示 */}
      {aiHubError && (
        <div
          className={clsx(
            'flex items-center justify-between px-3 py-1.5 text-xs border-t shrink-0',
            isDark
              ? 'bg-amber-900/30 border-amber-800 text-amber-300'
              : 'bg-amber-50 border-amber-200 text-amber-700',
          )}
        >
          <div className="flex items-center gap-1.5">
            <AlertCircle size={12} />
            <span>AI 服务未启动: {aiHubError}</span>
          </div>
          <button
            onClick={async () => {
              try {
                setAIHubError(null)
                await window.electron.aihub.start()
                const status = await window.electron.aihub.status()
                setAIHubStatus(status)
              } catch (e: any) {
                setAIHubError(e?.message || '启动失败')
              }
            }}
            className={clsx(
              'px-2 py-0.5 rounded text-xs transition-colors',
              isDark ? 'hover:bg-amber-800/50' : 'hover:bg-amber-100',
            )}
          >
            {t('chat:aihub.error.retry')}
          </button>
        </div>
      )}

      {/* 错误提示 */}
      {lastError && (
        <div
          className={clsx(
            'flex items-center justify-between px-3 py-1.5 text-xs border-t shrink-0',
            isDark
              ? 'bg-red-900/30 border-red-800 text-red-300'
              : 'bg-red-50 border-red-200 text-red-700',
          )}
        >
          <div className="flex items-center gap-1.5">
            <AlertCircle size={12} />
            <span>{lastError}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleSend}
              className={clsx(
                'px-2 py-0.5 rounded text-xs transition-colors',
                isDark ? 'hover:bg-red-800/50' : 'hover:bg-red-100',
              )}
            >
              {t('chat:aihub.error.retry')}
            </button>
            <button
              onClick={() => setLastError(null)}
              className={clsx(
                'px-2 py-0.5 rounded text-xs transition-colors',
                isDark ? 'hover:bg-red-800/50' : 'hover:bg-red-100',
              )}
            >
              {t('chat:aihub.error.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}