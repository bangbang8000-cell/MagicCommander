import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Trash2, MessageSquare, Settings, Wifi, WifiOff, AlertCircle, MessageSquarePlus, RotateCcw, ChevronDown, Check } from 'lucide-react'
import { useChatStore, sendMessage } from '@/stores/chat.store'
import { useUIStore } from '@/stores/ui.store'
import type { ChatMode } from '@/types/chat'
import { ChatMessageBubble } from './ChatMessageBubble'
import { ChatInput } from './ChatInput'

const PROVIDER_NAMES: Record<string, string> = {
  deepseek: 'DeepSeek', openai: 'OpenAI', claude: 'Claude', gemini: 'Gemini',
  qwen: 'Qwen', glm: 'GLM', grok: 'Grok', ollama: 'Ollama (本地)', custom: '自定义',
}

export function ChatPanel() {
  const { t } = useTranslation()
  const isDark = useUIStore((s) => s.isDark)
  const fontSize = useUIStore((s) => s.generalSettings.fontSize || 'medium')

  const sessions = useChatStore((s) => s.sessions)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const hasHydrated = useChatStore((s) => s.hasHydrated)
  const createSession = useChatStore((s) => s.createSession)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const setActiveSession = useChatStore((s) => s.setActiveSession)
  const clearCurrentSession = useChatStore((s) => s.clearCurrentSession)
  const currentMode = useChatStore((s) => s.currentMode)
  const inputValue = useChatStore((s) => s.inputValue)
  const isSending = useChatStore((s) => s.isSending)
  const getActiveSession = useChatStore((s) => s.getActiveSession)
  const generateTitle = useChatStore((s) => s.generateTitle)
  const aiHubStatus = useChatStore((s) => s.aiHubStatus)
  const setAIHubStatus = useChatStore((s) => s.setAIHubStatus)
  const setAIHubProviders = useChatStore((s) => s.setAIHubProviders)
  const selectedProvider = useChatStore((s) => s.selectedProvider)
  const setSelectedProvider = useChatStore((s) => s.setSelectedProvider)

  const aiConfig = useUIStore((s) => s.aiConfig)

  const [lastError, setLastError] = useState<string | null>(null)
  const [aiHubError, setAIHubError] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const tabBarRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<HTMLDivElement>(null)
  const [overflowCount, setOverflowCount] = useState(0)
  const activeSession = getActiveSession()

  // 自动滚动
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeSession?.messages.length, isSending])

  // rehydrate 后自动创建会话
  useEffect(() => {
    if (!hasHydrated) return
    if (!activeSessionId) createSession()
  }, [hasHydrated, activeSessionId, createSession])

  // AI Hub 轮询
  useEffect(() => {
    const poll = async () => {
      try {
        const status = await window.electron.aihub.status()
        setAIHubStatus(status); setAIHubError(null)
        if (status.running) setAIHubProviders(await window.electron.aihub.getProviders())
      } catch (e: any) {
        setAIHubError(e?.message || t('chat:aihub.error.hubFailed'))
      }
    }
    poll()
    const i = setInterval(poll, 10000)
    return () => clearInterval(i)
  }, [])

  // 自动启动 AI Hub
  useEffect(() => {
    (async () => {
      try {
        const s = await window.electron.aihub.status()
        if (!s.running && !s.installing) {
          await window.electron.aihub.start()
          for (let i = 0; i < 15; i++) {
            await new Promise((r) => setTimeout(r, 1000))
            const st = await window.electron.aihub.status()
            if (st.running) { setAIHubStatus(st); setAIHubError(null); setAIHubProviders(await window.electron.aihub.getProviders()); return }
          }
          setAIHubError(t('common:settings.ai.hubTimeout'))
        }
      } catch (e: any) { console.error('[ChatPanel] AI Hub', e); setAIHubError(e?.message || t('chat:aihub.error.hubFailed')) }
    })()
  }, [])

  // 同步默认 Provider
  useEffect(() => {
    if (!selectedProvider && aiConfig.defaultProvider) setSelectedProvider(aiConfig.defaultProvider)
  }, [aiConfig.defaultProvider])

  // 标签溢出检测
  useEffect(() => {
    const bar = tabBarRef.current
    if (!bar || sessions.length <= 1) { setOverflowCount(0); return }
    const check = () => {
      const children = bar.querySelectorAll('[data-tab]')
      let used = bar.clientWidth - 68 // 预留「历史」入口 + 新建按钮空间
      let visible = 0
      for (let i = 0; i < children.length; i++) {
        const w = (children[i] as HTMLElement).offsetWidth + 4
        if (used - w > 30) { used -= w; visible++ }
        else break
      }
      setOverflowCount(Math.max(0, children.length - visible))
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(bar)
    return () => ro.disconnect()
  }, [sessions])

  // 点击外部关闭历史下拉
  useEffect(() => {
    if (!historyOpen) return
    const h = (e: MouseEvent) => { if (historyRef.current && !historyRef.current.contains(e.target as Node)) setHistoryOpen(false) }
    setTimeout(() => document.addEventListener('mousedown', h), 0)
    return () => document.removeEventListener('mousedown', h)
  }, [historyOpen])

  const configuredProviders = Object.entries(aiConfig.providers)
    .filter(([, cfg]) => cfg.apiKey)
    .map(([key, cfg]) => ({ key, name: PROVIDER_NAMES[key] || key, model: cfg.model || key, enabled: true, is_default: key === aiConfig.defaultProvider }))

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isSending) return
    setLastError(null)
    const store = useChatStore.getState()
    try {
      await sendMessage(store, inputValue.trim(), store.currentMode, [...store.pendingAttachments])
      // 首轮对话完成后异步生成标题
      const ses = useChatStore.getState().getActiveSession()
      if (ses && ses.messages.filter(m => m.role === 'user').length === 1) {
        setTimeout(() => generateTitle(ses.id), 500)
      }
    } catch (e: any) {
      setLastError(e?.message || t('chat:aihub.error.unknown'))
    }
  }, [inputValue, isSending, t, generateTitle])

  const handleNewChat = useCallback(() => createSession(), [createSession])
  const handleClearChat = useCallback(() => clearCurrentSession(), [clearCurrentSession])

  const sortedSessions = sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt)
  const visibleSessions = overflowCount > 0 ? sortedSessions.slice(0, sortedSessions.length - overflowCount) : sortedSessions
  const overflowSessions = overflowCount > 0 ? sortedSessions.slice(sortedSessions.length - overflowCount) : []

  // 字体大小映射
  const fontSizeClass = fontSize === 'small' ? 'text-[12px]' : fontSize === 'large' ? 'text-[14px]' : 'text-[13px]'

  return (
    <div className="flex flex-col h-full">
      {/* === 顶部工具栏 === */}
      <div className={clsx('flex items-center gap-1.5 px-3 py-1.5 border-b shrink-0', isDark ? 'border-gray-700 bg-gray-900/60' : 'border-gray-200 bg-gray-50')}>
        <span className={clsx('flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full shrink-0',
          aiHubStatus.installing ? (isDark ? 'bg-blue-900/50 text-blue-400' : 'bg-blue-100 text-blue-700')
          : aiHubStatus.running ? (isDark ? 'bg-green-900/50 text-green-400' : 'bg-green-100 text-green-700')
          : (isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'))}
          title={aiHubStatus.running ? t('chat:aihub.status.running') : aiHubStatus.lastError || t('chat:aihub.status.stopped')}>
          {aiHubStatus.installing ? <span className="animate-pulse">...</span> : aiHubStatus.running ? <Wifi size={10} /> : <WifiOff size={10} />}
        </span>
        <select value={selectedProvider || ''} onChange={(e) => setSelectedProvider(e.target.value || undefined)}
          className={clsx('text-[11px] px-1.5 py-0.5 rounded border outline-none shrink-0 max-w-[130px]', isDark ? 'bg-gray-800 border-gray-600 text-gray-300' : 'bg-white border-gray-300 text-gray-600')}>
          {configuredProviders.length === 0
            ? <option value="">{t('chat:aihub.provider.noProvider')}</option>
            : configuredProviders.map(p => <option key={p.key} value={p.key}>{p.name} ({p.model})</option>)}
        </select>
        <div className="flex-1" />
        <button onClick={() => useUIStore.getState().setActiveActivity('settings')} className={clsx('p-1 rounded transition-colors', isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500')} title={t('chat:aihub.provider.configure')}><Settings size={13} /></button>
        {activeSession?.messages.length ? <button onClick={handleClearChat} className={clsx('p-1 rounded transition-colors', isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500')} title={t('chat:clearChat')}><RotateCcw size={13} /></button> : null}
      </div>

      {/* === 会话标签栏 === */}
      <div ref={tabBarRef} className={clsx('flex items-center gap-0.5 px-1.5 py-1 border-b shrink-0 overflow-hidden', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-100/50')}>
        {visibleSessions.map((s) => {
          const isActive = s.id === activeSessionId
          return (
            <div key={s.id} data-tab onClick={() => setActiveSession(s.id)}
              className={clsx('group flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer transition-colors whitespace-nowrap shrink-0 max-w-[160px]',
                isActive ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white')
                : (isDark ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'))}
              title={s.title}>
              <MessageSquare size={10} className="shrink-0" />
              <span className="truncate">{s.title}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
                className={clsx('shrink-0 p-0.5 rounded-full transition-opacity', isActive ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-100',
                  isActive ? 'hover:bg-blue-700' : (isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-300'))}
                title={t('chat:session.delete')}><Trash2 size={8} /></button>
            </div>
          )
        })}
        {/* 溢出标签 → 历史下拉 */}
        {overflowCount > 0 && (
          <div className="relative shrink-0" ref={historyRef}>
            <button onClick={() => setHistoryOpen(!historyOpen)}
              className={clsx('flex items-center gap-0.5 px-2 py-0.5 rounded text-xs transition-colors', isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-200')}>
              <ChevronDown size={10} /> {overflowCount}
            </button>
            {historyOpen && (
              <div className={clsx('absolute top-full right-0 z-50 mt-1 w-56 py-1 rounded-lg shadow-lg border', isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200')}>
                {overflowSessions.map(s => {
                  const isActive = s.id === activeSessionId
                  return (
                    <div key={s.id} onClick={() => { setActiveSession(s.id); setHistoryOpen(false) }}
                      className={clsx('flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs group', isActive ? (isDark ? 'bg-blue-900/30' : 'bg-blue-50') : (isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'))}>
                      {isActive && <Check size={10} className="text-blue-500 shrink-0" />}
                      <span className={clsx('flex-1 truncate', isActive ? (isDark ? 'text-blue-300 font-medium' : 'text-blue-700 font-medium') : (isDark ? 'text-gray-300' : 'text-gray-700'))}>{s.title}</span>
                      <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
                        className={clsx('shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100', isDark ? 'hover:bg-red-900/50 text-gray-500' : 'hover:bg-red-100 text-gray-400')}><Trash2 size={10} /></button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
        <div className="flex-1" />
        <button onClick={handleNewChat}
          className={clsx('flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] transition-colors shrink-0', isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-200 text-gray-600')}
          title={t('chat:newChat')}>
          <MessageSquarePlus size={13} />
          <span className="hidden sm:inline">{t('chat:newChat')}</span>
        </button>
      </div>

      {/* === 消息列表 === */}
      <div className="flex-1 overflow-y-auto">
        {!activeSession || activeSession.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <MessageSquare size={40} className={clsx('mb-4', isDark ? 'text-gray-600' : 'text-gray-300')} />
            <h3 className={clsx('text-base font-medium mb-2', isDark ? 'text-gray-300' : 'text-gray-600')}>{t('chat:empty.title')}</h3>
            <p className={clsx('text-sm max-w-xs', isDark ? 'text-gray-500' : 'text-gray-400')}>{t('chat:empty.desc')}</p>
          </div>
        ) : (
          <div className="py-1">
            {activeSession.messages.map((msg) => <ChatMessageBubble key={msg.id} message={msg} isDark={isDark} fontSizeClass={fontSizeClass} />)}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <ChatInput isDark={isDark} onSend={handleSend} />

      {aiHubError && (
        <div className={clsx('flex items-center justify-between px-3 py-1.5 text-xs border-t shrink-0', isDark ? 'bg-amber-900/30 border-amber-800 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700')}>
          <div className="flex items-center gap-1.5"><AlertCircle size={12} /><span>{t('chat:aihub.error.serviceNotRunning')}: {aiHubError}</span></div>
          <button onClick={async () => {
            try { setAIHubError(null); await window.electron.aihub.start(); setAIHubStatus(await window.electron.aihub.status()) }
            catch (e: any) { setAIHubError(e?.message || t('chat:aihub.error.hubFailed')) }
          }} className={clsx('px-2 py-0.5 rounded text-xs transition-colors', isDark ? 'hover:bg-amber-800/50' : 'hover:bg-amber-100')}>{t('chat:aihub.error.retry')}</button>
        </div>
      )}
    </div>
  )
}
