import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  ChatMessage,
  ChatSession,
  ChatAttachment,
  ChatMode,
  AttachmentType,
} from '@/types/chat'
import { generateId } from '@/types/chat'
import type { AIHubStatus, AIHubProvider } from '@/types/ipc'

interface ChatState {
  // 会话管理
  sessions: ChatSession[]
  activeSessionId: string | null
  setActiveSession: (id: string) => void
  createSession: (mode?: ChatMode) => string
  deleteSession: (id: string) => void
  clearCurrentSession: () => void

  // 消息管理
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
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

  // AI Hub 状态
  aiHubStatus: AIHubStatus
  setAIHubStatus: (status: AIHubStatus) => void
  aiHubProviders: AIHubProvider[]
  setAIHubProviders: (providers: AIHubProvider[]) => void
  selectedProvider: string | undefined
  setSelectedProvider: (provider: string | undefined) => void

  // 获取当前会话
  getActiveSession: () => ChatSession | null
}

// Phase 1-C 占位响应（模拟 Agent 回复，仅在 AI Hub 不可用时使用）
const MOCK_RESPONSES: Record<ChatMode, string> = {
  template: `您好！我是模板助手，可以帮助您：

1. **创建新模板** - 从现有项目中提取配置模板
2. **修改模板** - 调整 Jinja2 模板变量和结构
3. **校验模板** - 检查模板语法和变量完整性
4. **模板推荐** - 根据需求推荐合适的模板

请上传您的项目文件或描述您的需求，我会帮您分析处理。`,
  config: `您好！我是配置问答助手，可以帮助您：

1. **项目创建** - 根据模板创建新项目
2. **配置渲染** - 生成设备配置文件
3. **参数校验** - 检查 Excel 参数表完整性
4. **配置对比** - 对比新旧配置差异

请描述您的需求，或上传相关文件（Excel 参数表、YAML 配置等）。`,
  general: `您好！我是 MagicCommander AI 助手，可以帮您解决以下问题：

- 网络设备配置管理
- 项目模板创建与优化
- 批量渲染与输出
- 标签打印与管理
- 配置校验与对比

请随时向我提问，我会尽力协助您。`,
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      currentMode: 'general',
      pendingAttachments: [],
      inputValue: '',
      isSending: false,
      aiHubStatus: { running: false, port: 0 },
      aiHubProviders: [],
      selectedProvider: undefined,

      setActiveSession: (id) => set({ activeSessionId: id }),

      createSession: (mode?: ChatMode) => {
        const m = mode || get().currentMode
        const id = `session_${Date.now()}`
        const session: ChatSession = {
          id,
          title: `新对话 ${new Date().toLocaleString()}`,
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

      deleteSession: (id) => {
        set((s) => {
          const filtered = s.sessions.filter((ses) => ses.id !== id)
          const newActiveId = s.activeSessionId === id ? (filtered[0]?.id || null) : s.activeSessionId
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
          // 自动创建会话
          get().createSession(message.mode)
        }
        const sessionId = get().activeSessionId
        if (!sessionId) return

        const newMsg: ChatMessage = {
          ...message,
          id: generateId(),
          timestamp: Date.now(),
        }

        set((s) => ({
          sessions: s.sessions.map((ses) =>
            ses.id === sessionId
              ? {
                  ...ses,
                  messages: [...ses.messages, newMsg],
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
            ses.id === activeId
              ? { ...ses, messages: ses.messages.filter((m) => m.id !== messageId) }
              : ses,
          ),
        }))
      },

      setMode: (mode) => set({ currentMode: mode }),

      addAttachment: async (file: File) => {
        const path = (file as any).path || file.name
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
    }),
    {
      name: 'mc-chat-state',
      partialize: (state) => ({
        sessions: state.sessions.slice(-20), // 最多保留 20 个会话
        activeSessionId: state.activeSessionId,
        currentMode: state.currentMode,
        selectedProvider: state.selectedProvider,
        aiHubProviders: state.aiHubProviders,
      }),
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

// 导出占位响应函数（仅在 AI Hub 不可用时使用）
export function getMockResponse(mode: ChatMode): string {
  return MOCK_RESPONSES[mode] || MOCK_RESPONSES.general
}

/**
 * 发送消息（真实 AI Hub 流式响应）
 * 如果 AI Hub 不可用，回退到模拟响应
 */
export async function sendMessage(
  store: ReturnType<typeof useChatStore.getState>,
  content: string,
  mode: ChatMode,
  attachments: ChatAttachment[],
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
    role: 'assistant',
    content: '',
    mode,
  })

  // 尝试使用 AI Hub
  try {
    const aiHub = window.electron.aihub
    if (!aiHub) throw new Error('AI Hub API not available')

    // 检查 AI Hub 状态，如果未运行则尝试启动
    const status = await aiHub.status()
    if (!status.running) {
      console.log('[chat.store] AI Hub 未运行，尝试启动...')
      await aiHub.start()
      // 等待启动（最多 10 秒）
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        const s = await aiHub.status()
        if (s.running) break
      }
      const finalStatus = await aiHub.status()
      if (!finalStatus.running) {
        throw new Error('AI Hub 启动失败，请检查 Python 环境是否就绪。可前往设置页面测试连接。')
      }
    }

    // 使用选中的 Provider（优先 chat.store，回退到 Settings 默认）
    const provider = store.selectedProvider
    if (!provider) {
      throw new Error('未选择 AI 模型。请前往设置页面配置 Provider。')
    }

    // 监听流式响应
    let fullContent = ''
    const unsub = aiHub.onStream(({ sessionId: sid, chunk }) => {
      if (sid !== sessionId) return
      fullContent += chunk
      // 更新消息内容
      useChatStore.setState((s) => ({
        sessions: s.sessions.map((ses) =>
          ses.id === sessionId
            ? {
                ...ses,
                messages: ses.messages.map((m) =>
                  m.id === aiMsgId ? { ...m, content: fullContent } : m,
                ),
              }
            : ses,
        ),
      }))
    })

    // 发送请求（带超时）
    const timeoutMs = 60000
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
    )

    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeoutMs),
    )

    await Promise.race([chatPromise, timeoutPromise])
    unsub()
    store.setIsSending(false)
  } catch (err: any) {
    const errorMsg = err?.message || '未知错误'

    // 如果已有流式内容，追加错误提示
    const currentMsg = useChatStore.getState().sessions
      .find((s) => s.id === sessionId)
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
                messages: ses.messages.map((m) =>
                  m.id === aiMsgId
                    ? { ...m, content: `> 错误: ${errorMsg}` }
                    : m,
                ),
              }
            : ses,
        ),
      }))
    }

    store.setIsSending(false)
    throw err  // 抛出给 ChatPanel 显示错误提示
  }
}

// 模拟发送消息（Phase 1-C 占位，Phase 2 替换为真实流式响应）
export async function simulateSendMessage(
  store: ReturnType<typeof useChatStore.getState>,
  content: string,
  mode: ChatMode,
  attachments: ChatAttachment[],
) {
  // 添加用户消息
  store.addMessage({
    role: 'user',
    content,
    mode,
    attachments: attachments.length > 0 ? [...attachments] : undefined,
  })

  store.setIsSending(true)

  // 模拟延迟
  await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 1200))

  // 添加 AI 占位回复
  let response = getMockResponse(mode)
  if (attachments.length > 0) {
    const fileList = attachments.map((a) => `- ${a.name} (${a.type})`).join('\n')
    response = `已收到您的消息和以下附件：\n\n${fileList}\n\n---\n\n${response}`
  }

  store.addMessage({
    role: 'assistant',
    content: response,
    mode,
  })

  store.setIsSending(false)
  store.setInputValue('')
  store.clearAttachments()
}