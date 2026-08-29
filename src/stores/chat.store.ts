import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n from '@/i18n'
import type { ChatMessage, ChatSession, ChatAttachment, ChatMode, AttachmentType } from '@/types/chat'
import { generateId } from '@/types/chat'
import type { AIHubStatus, AIHubProvider } from '@/types/ipc'

interface ChatState {
  // 会话管理
  sessions: ChatSession[]
  activeSessionId: string | null
  hasHydrated: boolean
  setActiveSession: (id: string) => void
  createSession: (mode?: ChatMode) => string
  updateSessionMode: (mode: ChatMode) => void
  deleteSession: (id: string) => void
  clearCurrentSession: () => void

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

      setActiveSession: (id) => set({ activeSessionId: id }),

      createSession: (mode?: ChatMode) => {
        const m = mode || get().currentMode
        const id = `session_${Date.now()}`
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
        }))
      },

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

        set((s) => ({
          sessions: s.sessions.map((ses) =>
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
          ),
        }))
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
 * 从 assistant 消息内容解析确认标记（后端 run_stream CONFIRM 分支 yield 的独立行
 * `---CONFIRM:<tool>---`）。返回工具名与剥离标记后的展示内容；无标记返回 null。
 * 向后兼容：无标记时前端不渲染卡片，用户仍可手动输入"确认"/"取消"。
 */
export function parseConfirmationMarker(content: string): { tool: string; displayContent: string } | null {
  const rx = /(^|\n)---CONFIRM:([^\s-]+)---(\n|$)/
  const m = content.match(rx)
  if (!m) return null
  const tool = m[2]
  const displayContent = content.replace(rx, '\n').trim()
  return { tool, displayContent }
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
 * @param projectName 当前项目名（由调用方传入，避免后端 set_mode 重置项目上下文）
 * 返回是否已发起（isSending 期间的点击将被忽略并返回 false）。
 */
export function sendConfirmationReply(reply: '确认' | '取消', projectName?: string): boolean {
  const store = useChatStore.getState()
  if (store.isSending) return false
  const session = store.getActiveSession()
  const mode = session?.mode || store.currentMode
  void (async () => {
    try {
      await sendMessage(store, reply, mode, [], projectName)
    } catch (e) {
      console.error('[chat.store] 确认/取消回复发送失败', e)
    }
  })()
  return true
}
