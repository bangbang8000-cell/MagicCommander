import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n from '@/i18n'
import type { ChatMessage, ChatSession, ChatAttachment, ChatMode, AttachmentType } from '@/types/chat'
import { generateId } from '@/types/chat'
import type { AIHubStatus, AIHubProvider } from '@/types/ipc'

// ===== M-F4（PRD v3.6）：MC 上下文压缩——会话内手动摘要 / 长会话上限截断 =====
// 后端 /send 控制消息前缀：前端受限于 electron IPC 通道不可扩展，复用既有 aiHub.chat
// 通道 + 后端 /send 控制消息（@@MC_SUMMARIZE@@ / @@MC_TRUNCATE@@:N）转发压缩请求。
export const CTRL_SUMMARIZE_PREFIX = '@@MC_SUMMARIZE@@'
export const CTRL_TRUNCATE_PREFIX = '@@MC_TRUNCATE@@:'

/** 4.3 F3-2：确认卡片携带可编辑参数的确认控制消息前缀（后端 /send 解析后按新参数执行） */
export const CONFIRM_REPLY_PREFIX = '@@MC_CONFIRM_REPLY@@'

/** 4.3 F3-2：摘要后继续衔接文案（追加到摘要 marker，提示可基于摘要继续对话） */
export const SUMMARY_CONTINUE_HINT = '以上为本会话摘要。您可以直接继续提问，我将基于摘要上下文继续回答。'

/** 长会话截断阈值（消息条数）与保留条数 */
export const TRUNCATE_THRESHOLD = 200
export const TRUNCATE_KEEP = 100

/** 4.3 F3-2：带归档标记的会话类型（不改动共享 ChatSession 类型） */
export type SessionWithArchive = ChatSession & { archived?: boolean }

/** 是否达到截断阈值（纯函数，可测）：会话消息数 >= threshold 时提示 */
export function shouldShowTruncateNotice(count: number, threshold = TRUNCATE_THRESHOLD): boolean {
  return count >= threshold
}

interface ChatState {
  // 会话管理
  sessions: SessionWithArchive[]
  activeSessionId: string | null
  hasHydrated: boolean
  setActiveSession: (id: string) => void
  createSession: (mode?: ChatMode) => string
  updateSessionMode: (mode: ChatMode) => void
  deleteSession: (id: string) => void
  clearCurrentSession: () => void
  renameSession: (id: string, title: string) => void
  clearSessionContext: (sessionId?: string) => Promise<void>
  // 4.3 F3-2：会话归档
  archiveSession: (id: string) => void
  unarchiveSession: (id: string) => void
  getActiveSessions: () => SessionWithArchive[]
  getArchivedSessions: () => SessionWithArchive[]

  // 消息管理
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'> & { id?: string }) => void
  deleteMessage: (messageId: string) => void

  // 模式管理
  currentMode: ChatMode
  setMode: (mode: ChatMode) => void

  // 附件管理
  pendingAttachments: ChatAttachment[]
  addAttachment: (file: File) => Promise<void>
  removeAttachment: (id: string) => void
  clearAttachments: () => void

  // 输入状态
  inputValue: string
  setInputValue: (value: string) => void

  // 发送状态
  isSending: boolean
  setIsSending: (v: boolean) => void

  // 流式状态（PRD v3.3 AI-2 思考指示器）
  // waitingFirstChunk: assistant 占位已创建但尚未收到首 chunk（思考期）
  // pendingAssistantMsgId: 当前流对应的 assistant 消息 id（供气泡判定"正在思考"归属）
  waitingFirstChunk: boolean
  pendingAssistantMsgId: string | null

  // AI Hub 状态
  aiHubStatus: AIHubStatus
  setAIHubStatus: (status: AIHubStatus) => void
  aiHubProviders: AIHubProvider[]
  setAIHubProviders: (providers: AIHubProvider[]) => void
  selectedProvider: string | undefined
  setSelectedProvider: (provider: string | undefined) => void

  // 获取当前会话
  getActiveSession: () => ChatSession | null

  // AI 提炼标题
  generateTitle: (sessionId: string) => Promise<void>

  // M-F4（PRD v3.6 F4-1/F4-2）：上下文压缩——会话内手动摘要 / 长会话上限截断
  summarizeSession: (
    sessionId: string | undefined,
    opts?: { keepFull?: boolean },
  ) => Promise<{ ok: boolean; summary?: string; error?: string }>
  truncateSession: (sessionId: string | undefined, keep?: number) => Promise<{ ok: boolean }>
  truncateNotice: { sessionId: string; count: number } | null
  dismissTruncateNotice: () => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      hasHydrated: false,
      currentMode: 'general',
      pendingAttachments: [],
      inputValue: '',
      isSending: false,
      waitingFirstChunk: false,
      pendingAssistantMsgId: null,
      aiHubStatus: { running: false, port: 0 },
      aiHubProviders: [],
      selectedProvider: undefined,
      truncateNotice: null,

      setActiveSession: (id) =>
        set((s) => {
          const target = s.sessions.find((ses) => ses.id === id)
          let truncateNotice = s.truncateNotice
          // M-F4（F4-2）：切到超阈值会话时提示截断（每个会话只提示一次）
          if (target && shouldShowTruncateNotice(target.messages.length)) {
            if (!truncateNotice || truncateNotice.sessionId !== id) {
              truncateNotice = { sessionId: id, count: target.messages.length }
            }
          }
          return { activeSessionId: id, truncateNotice }
        }),

      createSession: (mode?: ChatMode) => {
        const m = mode || get().currentMode
        // PRD v3.5 MC-SESS1：id 追加随机后缀，避免同一毫秒内连续新建会话生成重复 id
        // （重复 id 会导致 sessions 出现同 id 会话：消息错写/删除误伤）
        const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const session: ChatSession = {
          id,
          title: i18n.t('chat:session.newChat'),
          messages: [],
          mode: m,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((s) => ({
          sessions: [...s.sessions, session],
          activeSessionId: id,
          currentMode: m,
        }))
        return id
      },

      updateSessionMode: (mode) => {
        const activeId = get().activeSessionId
        if (!activeId) return
        set((s) => ({
          currentMode: mode,
          sessions: s.sessions.map((ses) => (ses.id === activeId ? { ...ses, mode, updatedAt: Date.now() } : ses)),
        }))
      },

      deleteSession: (id) => {
        set((s) => {
          const filtered = s.sessions.filter((ses) => ses.id !== id)
          const newActiveId = s.activeSessionId === id ? filtered[0]?.id || null : s.activeSessionId
          return { sessions: filtered, activeSessionId: newActiveId }
        })
      },

      clearCurrentSession: () => {
        const activeId = get().activeSessionId
        if (!activeId) return
        set((s) => ({
          sessions: s.sessions.map((ses) =>
            ses.id === activeId ? { ...ses, messages: [], updatedAt: Date.now() } : ses,
          ),
          truncateNotice: s.truncateNotice && s.truncateNotice.sessionId === activeId ? null : s.truncateNotice,
        }))
      },

      // PRD v3.5 MC-SESS3：清空上下文 = 清空该会话前端消息 + 后端对应会话 history（新对话）
      renameSession: (id, title) => {
        const trimmed = title.trim()
        if (!trimmed) return
        set((s) => ({
          sessions: s.sessions.map((ses) => (ses.id === id ? { ...ses, title: trimmed, updatedAt: Date.now() } : ses)),
        }))
      },

      // PRD v3.5 MC-SESS3：清空上下文（前端 + 后端联动）
      // 复用既有后端能力 /api/chat/clear（electron aihub.clearSession 既有通道，无需扩展 IPC）
      // 后端不可用/失败时仅完成前端清空，不阻断（与清空交互一致性优先）
      clearSessionContext: async (sessionId) => {
        const id = sessionId || get().activeSessionId
        if (!id) return
        set((s) => ({
          sessions: s.sessions.map((ses) => (ses.id === id ? { ...ses, messages: [], updatedAt: Date.now() } : ses)),
          truncateNotice: s.truncateNotice && s.truncateNotice.sessionId === id ? null : s.truncateNotice,
        }))
        try {
          const aiHub = window.electron?.aihub
          if (aiHub?.clearSession) await aiHub.clearSession(id)
        } catch {
          /* 后端不可用/失败时仅完成前端清空 */
        }
      },

      // 4.3 F3-2：会话归档（不删除消息，仅标记归档；活跃/归档会话列表可区分）
      archiveSession: (id) => {
        set((s) => ({
          sessions: s.sessions.map((ses) => (ses.id === id ? { ...ses, archived: true, updatedAt: Date.now() } : ses)),
        }))
      },

      unarchiveSession: (id) => {
        set((s) => ({
          sessions: s.sessions.map((ses) => (ses.id === id ? { ...ses, archived: false, updatedAt: Date.now() } : ses)),
        }))
      },

      getActiveSessions: () => get().sessions.filter((s) => !s.archived),

      getArchivedSessions: () => get().sessions.filter((s) => !!s.archived),

      addMessage: (message) => {
        const activeId = get().activeSessionId
        if (!activeId) {
          get().createSession(message.mode)
        }
        const sessionId = get().activeSessionId
        if (!sessionId) return

        const newMsg: ChatMessage = {
          ...message,
          id: message.id || generateId(),
          timestamp: Date.now(),
        }

        set((s) => {
          const sessions = s.sessions.map((ses) =>
            ses.id === sessionId
              ? {
                  ...ses,
                  messages: [...ses.messages, newMsg],
                  // 首条用户消息自动设置会话标题
                  title:
                    ses.messages.length === 0 && message.role === 'user'
                      ? (message.content || '').slice(0, 20) || ses.title
                      : ses.title,
                  updatedAt: Date.now(),
                }
              : ses,
          )
          // M-F4（F4-2）：会话消息超阈值时提示截断（每个会话只提示一次）
          let truncateNotice = s.truncateNotice
          const target = sessions.find((ses) => ses.id === sessionId)
          if (target && shouldShowTruncateNotice(target.messages.length)) {
            if (!truncateNotice || truncateNotice.sessionId !== sessionId) {
              truncateNotice = { sessionId, count: target.messages.length }
            }
          }
          return { sessions, truncateNotice }
        })
      },

      deleteMessage: (messageId) => {
        const activeId = get().activeSessionId
        if (!activeId) return
        set((s) => ({
          sessions: s.sessions.map((ses) =>
            ses.id === activeId ? { ...ses, messages: ses.messages.filter((m) => m.id !== messageId) } : ses,
          ),
        }))
      },

      setMode: (mode) => set({ currentMode: mode }),

      addAttachment: async (file: File) => {
        const path = (file as File & { path?: string }).path || file.name
        const attachment: ChatAttachment = {
          id: generateId(),
          name: file.name,
          type: getAttachmentTypeByExt(file.name),
          path,
          size: file.size,
        }
        set((s) => ({
          pendingAttachments: [...s.pendingAttachments, attachment],
        }))
      },

      removeAttachment: (id) => {
        set((s) => ({
          pendingAttachments: s.pendingAttachments.filter((a) => a.id !== id),
        }))
      },

      clearAttachments: () => set({ pendingAttachments: [] }),

      setInputValue: (value) => set({ inputValue: value }),
      setIsSending: (v) => set({ isSending: v }),
      setAIHubStatus: (status) => set({ aiHubStatus: status }),
      setAIHubProviders: (providers) => set({ aiHubProviders: providers }),
      setSelectedProvider: (provider) => set({ selectedProvider: provider }),

      getActiveSession: () => {
        const { sessions, activeSessionId } = get()
        return sessions.find((s) => s.id === activeSessionId) || null
      },

      generateTitle: async (sessionId) => {
        const session = get().sessions.find((s) => s.id === sessionId)
        if (!session) return
        const userMsg = session.messages.find((m) => m.role === 'user')
        if (!userMsg?.content) return
        // 已有 AI 标题则跳过
        if (session.title && session.title !== i18n.t('chat:session.newChat') && !session.title.startsWith('新对话'))
          return
        try {
          const aiHub = window.electron?.aihub
          if (!aiHub) return
          const status = await aiHub.status()
          if (!status.running) return
          const { useUIStore } = await import('@/stores/ui.store')
          const aiConfig = useUIStore.getState().aiConfig
          const provider = get().selectedProvider || aiConfig.defaultProvider
          if (!provider) return
          await aiHub.chat(
            `title_${sessionId}`, // 独立会话 ID 避免污染聊天
            `用5个字以内概括以下问题的主题，只回复主题不要其他内容："${userMsg.content.slice(0, 100)}"`,
            'general',
            provider,
            undefined,
            useUIStore.getState().autonomyMode,
          )
          // 读取 AI 回复（通过临时订阅）
          let title = ''
          const unsub = aiHub.onStream(({ sessionId: sid, chunk }) => {
            if (sid === `title_${sessionId}`) title += chunk
          })
          await new Promise<void>((resolve) => {
            setTimeout(() => {
              unsub()
              resolve()
            }, 8000) // 最多等 8 秒
          })
          const cleanTitle = title
            .replace(/[""'']/g, '')
            .trim()
            .slice(0, 15)
          if (cleanTitle && cleanTitle.length >= 2) {
            set((s) => ({
              sessions: s.sessions.map((ses) => (ses.id === sessionId ? { ...ses, title: cleanTitle } : ses)),
            }))
          }
        } catch {
          /* 静默失败，保持默认标题 */
        }
      },

      // ===== M-F4（PRD v3.6 F4-1）：会话内手动摘要 =====
      // 前端受限于 electron IPC 通道不可扩展，复用既有 aiHub.chat 通道 + 后端 /send 控制消息
      // （@@MC_SUMMARIZE@@前缀）生成摘要；默认用摘要替换会话历史（新对话语义），
      // keepFull=true 保留完整历史、仅在会话顶部标记摘要。
      summarizeSession: async (sessionId, opts) => {
        const id = sessionId || get().activeSessionId
        if (!id) return { ok: false, error: i18n.t('common:chat.summarizeNoSession') }
        const session = get().sessions.find((s) => s.id === id)
        if (!session || session.messages.length === 0)
          return { ok: false, error: i18n.t('common:chat.summarizeNoSession') }
        const aiHub = window.electron?.aihub
        if (!aiHub) return { ok: false, error: i18n.t('chat:aihub.error.hubFailed') }
        try {
          // 确保 AI Hub 已运行
          const status = await aiHub.status()
          if (!status.running) {
            await aiHub.start()
            for (let i = 0; i < 15; i++) {
              await new Promise((r) => setTimeout(r, 1000))
              const st = await aiHub.status()
              if (st.running) break
            }
          }
          const { useUIStore } = await import('@/stores/ui.store')
          const aiConfig = useUIStore.getState().aiConfig
          const provider = get().selectedProvider || aiConfig.defaultProvider
          if (!provider) return { ok: false, error: i18n.t('chat:aihub.error.noModel') }
          // 构建历史文本（跳过 system 摘要标记，避免把摘要本身再摘要）
          const historyText = session.messages
            .filter((m) => m.role !== 'system')
            .map((m) => `${m.role === 'user' ? '用户' : 'AI'}：${(m.content || '').trim()}`)
            .join('\n')
          if (!historyText.trim()) return { ok: false, error: i18n.t('common:chat.summarizeNoSession') }
          const summary = await aiHub.chat(
            id,
            `${CTRL_SUMMARIZE_PREFIX}${historyText}`,
            'general',
            provider,
            [],
            'semi_auto',
          )
          if (!summary || /^(错误|Error)/.test(summary.trim())) {
            return { ok: false, error: summary || i18n.t('common:chat.summarizeFailed') }
          }
          const keepFull = opts?.keepFull ?? false
          const markerLabel = keepFull ? i18n.t('common:chat.summarizeMarker') : i18n.t('common:chat.summarizeReplaced')
          set((s) => ({
            sessions: s.sessions.map((ses) => {
              if (ses.id !== id) return ses
              // 4.3 F3-2：摘要 marker 追加「摘要后继续」衔接提示
              const marker: ChatMessage = {
                id: generateId(),
                role: 'system',
                content: buildSummarizedMarker(markerLabel, summary),
                timestamp: Date.now(),
                mode: ses.mode,
              }
              return {
                ...ses,
                messages: keepFull ? [marker, ...ses.messages] : [marker],
                updatedAt: Date.now(),
              }
            }),
          }))
          return { ok: true, summary }
        } catch (e) {
          // 失败保持原历史 + 返回错误（不破坏会话）
          return { ok: false, error: e instanceof Error ? e.message : String(e) }
        }
      },

      // ===== M-F4（PRD v3.6 F4-2）：长会话上限截断 =====
      // 前端同步裁剪保留最近 keep 条（新对话语义），并复用既有 aiHub.chat 通道 +
      // 后端 /send 控制消息（@@MC_TRUNCATE@@:N）截断后端会话 history。
      truncateSession: async (sessionId, keep) => {
        const id = sessionId || get().activeSessionId
        if (!id) return { ok: false }
        const n = Math.max(1, keep ?? TRUNCATE_KEEP)
        set((s) => ({
          sessions: s.sessions.map((ses) =>
            ses.id === id && ses.messages.length > n
              ? { ...ses, messages: ses.messages.slice(-n), updatedAt: Date.now() }
              : ses,
          ),
          truncateNotice: s.truncateNotice && s.truncateNotice.sessionId === id ? null : s.truncateNotice,
        }))
        try {
          const aiHub = window.electron?.aihub
          if (aiHub?.chat) await aiHub.chat(id, `${CTRL_TRUNCATE_PREFIX}${n}`, 'general', undefined, [], 'semi_auto')
        } catch {
          /* 后端不可用时仅完成前端裁剪 */
        }
        return { ok: true }
      },

      dismissTruncateNotice: () => set({ truncateNotice: null }),
    }),
    {
      name: 'mc-chat-state',
      partialize: (state) => ({
        sessions: state.sessions.slice(-20),
        activeSessionId: state.activeSessionId,
        currentMode: state.currentMode,
        selectedProvider: state.selectedProvider,
        aiHubProviders: state.aiHubProviders,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hasHydrated = true
          // 如果 rehydrate 后没有活跃会话，且没有历史会话，ChatPanel 会创建新的
        }
      },
    },
  ),
)

// 辅助函数：根据文件扩展名判断附件类型
function getAttachmentTypeByExt(fileName: string): AttachmentType {
  const ext = fileName.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'xlsx':
    case 'xls':
      return 'excel'
    case 'yaml':
    case 'yml':
      return 'yaml'
    case 'j2':
    case 'jinja2':
      return 'template'
    case 'json':
    case 'toml':
    case 'ini':
    case 'cfg':
      return 'config'
    case 'md':
    case 'txt':
    case 'pdf':
      return 'document'
    default:
      return 'other'
  }
}

/**
 * 发送消息（真实 AI Hub 流式响应）
 * 如果 AI Hub 不可用，回退到模拟响应
 */

// M7-e（回灌 AL T6-1）：已同步的 Provider 配置指纹（provider → 配置指纹）。
// 连续对话仅首次/配置变更时下发到后端，避免每次对话全量重建。
const syncedProviderFingerprints: Record<string, string> = {}

/** M7-e: 计算 Provider 配置指纹（apiKey/model/baseUrl 任一变化即重新同步） */
function providerFingerprint(cfg: { apiKey?: string; model?: string; baseUrl?: string }): string {
  return [cfg.apiKey || '', cfg.model || '', cfg.baseUrl || ''].join('|')
}

export async function sendMessage(
  store: ReturnType<typeof useChatStore.getState>,
  content: string,
  mode: ChatMode,
  attachments: ChatAttachment[],
  projectName?: string,
) {
  const sessionId = store.activeSessionId
  if (!sessionId) return

  // 添加用户消息
  store.addMessage({
    role: 'user',
    content,
    mode,
    attachments: attachments.length > 0 ? [...attachments] : undefined,
  })

  store.setIsSending(true)
  store.setInputValue('')
  store.clearAttachments()

  // 创建 AI 消息占位
  const aiMsgId = generateId()
  store.addMessage({
    id: aiMsgId,
    role: 'assistant',
    content: '',
    mode,
  })
  // PRD v3.3 AI-2：assistant 占位已创建但尚无内容 → 进入「等待首 chunk/思考期」态
  useChatStore.setState({ waitingFirstChunk: true, pendingAssistantMsgId: aiMsgId })

  // 尝试使用 AI Hub
  try {
    const aiHub = window.electron.aihub
    if (!aiHub) throw new Error('AI Hub API not available')

    // 检查 AI Hub 状态，如果未运行则尝试启动
    const status = await aiHub.status()
    if (!status.running) {
      console.log('[chat.store] AI Hub 未运行，尝试启动...')
      await aiHub.start()
      // 等待启动（最多 15 秒）
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        const s = await aiHub.status()
        if (s.running) break
      }
      const finalStatus = await aiHub.status()
      if (!finalStatus.running) {
        throw new Error(i18n.t('chat:aihub.error.hubFailed'))
      }
    }

    // 同步配置到 AI Hub（确保 Provider 已注册；M7-e 指纹去重，仅首次/变更时下发）
    const { useUIStore } = await import('@/stores/ui.store')
    const aiConfig = useUIStore.getState().aiConfig
    const configs = Object.entries(aiConfig.providers)
      .filter(([, cfg]) => cfg.apiKey)
      .map(([key, cfg]) => ({
        provider: key,
        apiKey: cfg.apiKey,
        model: cfg.model || '',
        baseUrl: cfg.baseUrl || '',
      }))
    let syncChanged = false
    for (const c of configs) {
      const fp = providerFingerprint(c)
      if (syncedProviderFingerprints[c.provider] !== fp) syncChanged = true
      syncedProviderFingerprints[c.provider] = fp
    }
    if (syncChanged) await aiHub.syncProviders(configs, aiConfig.defaultProvider)

    // 使用选中的 Provider（优先 chat.store，回退到 Settings 默认）
    let provider = store.selectedProvider || aiConfig.defaultProvider
    if (!provider) {
      throw new Error(i18n.t('chat:aihub.error.noModel'))
    }

    // 策略路由：根据消息内容自动选择最优 Provider
    if (aiConfig.routingEnabled && aiConfig.routingRules.length > 0) {
      const resolved = await aiHub.resolveProvider(content, aiConfig.routingRules, aiConfig.defaultProvider)
      if (resolved && resolved !== provider) {
        console.log(`[chat.store] 策略路由: ${provider} → ${resolved}`)
        provider = resolved
      }
    }

    // 监听流式响应（M7-e 回灌 AL T6-6：rAF 合并 chunk 批量更新，仅更新目标消息，避免长会话卡顿）
    let fullContent = ''
    let pendingContent = ''
    let rafId = 0
    const flushStream = () => {
      rafId = 0
      if (!pendingContent) return
      const content = pendingContent
      pendingContent = ''
      useChatStore.setState((s) => ({
        sessions: s.sessions.map((ses) =>
          ses.id === sessionId
            ? {
                ...ses,
                messages: ses.messages.map((m) => (m.id === aiMsgId ? { ...m, content } : m)),
              }
            : ses,
        ),
      }))
    }
    const unsub = aiHub.onStream(({ sessionId: sid, chunk }) => {
      if (sid !== sessionId) return
      fullContent += chunk
      pendingContent = fullContent
      // PRD v3.3 AI-2：收到首 chunk 即清除「正在思考」指示
      if (useChatStore.getState().waitingFirstChunk) {
        useChatStore.setState({ waitingFirstChunk: false })
      }
      // M7-e 回灌 AL T6-7：活跃超时——有输出则重置计时（长工具链不因硬超时中断）
      scheduleTimeout()
      if (!rafId) {
        rafId = requestAnimationFrame(flushStream)
      }
    })

    // M7-e 回灌 AL T6-7：60s 硬超时改为活跃超时：最后一次 chunk 起算 60s 无输出才超时
    const timeoutMs = 60000
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let rejectActiveTimeout: (reason?: unknown) => void = () => {}
    const scheduleTimeout = () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        timeoutId = null
        rejectActiveTimeout(new Error(i18n.t('chat:aihub.error.timeout')))
      }, timeoutMs)
    }

    // 发送请求（带超时）
    const chatPromise = aiHub.chat(
      sessionId,
      content,
      mode,
      provider,
      attachments.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        path: a.path,
        size: a.size,
      })),
      useUIStore.getState().autonomyMode,
      projectName,
    )

    const timeoutPromise = new Promise<string>((_, reject) => {
      rejectActiveTimeout = reject
    })
    scheduleTimeout()

    await Promise.race([chatPromise, timeoutPromise])
    if (timeoutId) clearTimeout(timeoutId)
    // 补最终 flush：把 pendingContent 落库（rAF 未触发时单 chunk 短回复也能保存）
    flushStream()
    if (rafId) cancelAnimationFrame(rafId)
    unsub()
    // 空内容兜底：后端无任何产出（SSE 仅 done）时补友好提示，避免空气泡；
    // 后端已产出友好文本时 fullContent 非空，此处不重复追加
    if (!fullContent.trim()) {
      useChatStore.setState((s) => ({
        sessions: s.sessions.map((ses) =>
          ses.id === sessionId
            ? {
                ...ses,
                messages: ses.messages.map((m) => (m.id === aiMsgId ? { ...m, content: 'AI 未返回内容，请重试' } : m)),
              }
            : ses,
        ),
      }))
    }
    store.setIsSending(false)
    // 流正常结束：清除「等待首 chunk」态
    useChatStore.setState({ waitingFirstChunk: false, pendingAssistantMsgId: null })
  } catch (err) {
    const errorMsg = (err instanceof Error ? err.message : String(err)) || i18n.t('chat:aihub.error.unknown')

    // 如果已有流式内容，追加错误提示
    const currentMsg = useChatStore
      .getState()
      .sessions.find((s) => s.id === sessionId)
      ?.messages.find((m) => m.id === aiMsgId)

    const existingContent = currentMsg?.content || ''

    if (existingContent) {
      // 已有部分流式内容，追加中断提示
      useChatStore.setState((s) => ({
        sessions: s.sessions.map((ses) =>
          ses.id === sessionId
            ? {
                ...ses,
                messages: ses.messages.map((m) =>
                  m.id === aiMsgId ? { ...m, content: existingContent + '\n\n> 连接中断，请重试。' } : m,
                ),
              }
            : ses,
        ),
      }))
    } else {
      // 完全没有响应，显示错误信息
      useChatStore.setState((s) => ({
        sessions: s.sessions.map((ses) =>
          ses.id === sessionId
            ? {
                ...ses,
                messages: ses.messages.map((m) => (m.id === aiMsgId ? { ...m, content: `> 错误: ${errorMsg}` } : m)),
              }
            : ses,
        ),
      }))
    }

    store.setIsSending(false)
    // 流异常结束：清除「等待首 chunk」态
    useChatStore.setState({ waitingFirstChunk: false, pendingAssistantMsgId: null })
    throw err // 抛出给 ChatPanel 显示错误提示
  }
}

// ===== PRD v3.3 AI-1/AI-2：确认卡片 + 思考指示器的可测纯函数与回灌入口 =====

/**
 * 4.3 F3-2：摘要 marker 组装——在摘要后追加「摘要后继续」衔接提示（可测纯函数）
 */
export function buildSummarizedMarker(label: string, summary: string): string {
  return `${label}\n\n${summary}\n\n${SUMMARY_CONTINUE_HINT}`
}

/** 4.3 F3-2：UTF-8 安全的 base64 编码（浏览器 btoa / node Buffer 双兼容） */
export function encodeConfirmArgs(args: Record<string, unknown>): string {
  const json = JSON.stringify(args)
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  if (typeof btoa === 'function') return btoa(binary)
  return Buffer.from(json, 'utf-8').toString('base64')
}

/** 4.3 F3-2：UTF-8 安全的 base64 解码；非法输入返回 null（不抛错） */
export function decodeConfirmArgs(encoded: string): Record<string, unknown> | null {
  try {
    let json: string
    if (typeof atob === 'function') {
      const binary = atob(encoded)
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
      json = new TextDecoder().decode(bytes)
    } else {
      json = Buffer.from(encoded, 'base64').toString('utf-8')
    }
    const parsed = JSON.parse(json)
    if (parsed && typeof parsed === 'object') return parsed
    return null
  } catch {
    return null
  }
}

/**
 * 从 assistant 消息内容解析确认标记（后端 run_stream CONFIRM 分支 yield 的独立行
 * `---CONFIRM:<tool>---`）。返回工具名、可选参数（b64 编码的工具参数，供确认前预览）与
 * 剥离标记后的展示内容；无标记返回 null。
 * 向后兼容：无标记时前端不渲染卡片，用户仍可手动输入"确认"/"取消"。
 */
export function parseConfirmationMarker(content: string): {
  tool: string
  args?: Record<string, unknown>
  displayContent: string
} | null {
  // 支持两种格式：`---CONFIRM:<tool>---`（v3.3 向后兼容）与 `---CONFIRM:<tool>:<b64args>---`（4.3 预览参数）
  const rx = /(^|\n)---CONFIRM:([^\s:]+)(?::([^\s-]+))?---(\n|$)/
  const m = content.match(rx)
  if (!m) return null
  const tool = m[2]
  let args: Record<string, unknown> | undefined
  const encoded = m[3]
  if (encoded) {
    const decoded = decodeConfirmArgs(encoded)
    if (decoded) args = decoded
  }
  const displayContent = content.replace(rx, '\n').trim()
  return { tool, args, displayContent }
}

/**
 * 判定 assistant 消息是否处于「等待首 chunk/思考期」。
 * 条件：全局 waitingFirstChunk 置位、归属于当前流、assistant 角色、且尚无内容。
 */
export function isWaitingFirstChunk(
  message: ChatMessage,
  waitingFirstChunk: boolean,
  pendingAssistantMsgId: string | null,
): boolean {
  return waitingFirstChunk && pendingAssistantMsgId === message.id && message.role === 'assistant' && !message.content
}

/**
 * PRD v3.3 AI-1：确认/取消按钮回灌。
 * 以用户身份发送「确认」/「取消」消息（复用 sendMessage 路径），
 * 仅在空闲（非 isSending）时发起，避免与进行中的流并发；fire-and-forget，不阻塞按钮交互。
 * 4.3 F3-2：options.tool + options.args 携带「可编辑确认参数」——确认时若参数被修改，
 * 发送确认控制消息（@@MC_CONFIRM_REPLY@@<b64>），后端按新参数执行。
 * @param projectName 当前项目名（由调用方传入，避免后端 set_mode 重置项目上下文）
 * @param options 可选：确认时携带修改后的工具参数（tool/args）
 * 返回是否已发起（isSending 期间的点击将被忽略并返回 false）。
 */
export function sendConfirmationReply(
  reply: '确认' | '取消',
  projectName?: string,
  options?: { tool?: string; args?: Record<string, unknown> },
): boolean {
  const store = useChatStore.getState()
  if (store.isSending) return false
  const session = store.getActiveSession()
  const mode = session?.mode || store.currentMode
  let message: string = reply
  if (reply === '确认' && options?.tool && options?.args) {
    message = `${CONFIRM_REPLY_PREFIX}${encodeConfirmArgs({ tool: options.tool, args: options.args })}`
  }
  void (async () => {
    try {
      await sendMessage(store, message, mode, [], projectName)
    } catch (e) {
      console.error('[chat.store] 确认/取消回复发送失败', e)
    }
  })()
  return true
}
