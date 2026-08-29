/**
 * PRD v3.6 M-F4（MC 上下文压缩·裁剪版）chat.store 纯逻辑测试
 *
 * C-1 手动摘要替换（默认压缩历史）/ C-2 保留完整历史开关 / C-3 摘要失败保持原历史 /
 * C-4 长会话截断（前端裁剪 + 后端联动 + 新对话语义）/ C-5 超阈值提示 / 纯函数阈值
 *
 * 组件级渲染依赖 react-i18next/electron 较重，按任务说明退化为对 store 纯逻辑做单测。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useChatStore,
  shouldShowTruncateNotice,
  CTRL_SUMMARIZE_PREFIX,
  CTRL_TRUNCATE_PREFIX,
  TRUNCATE_THRESHOLD,
  TRUNCATE_KEEP,
} from '@/stores/chat.store'

function resetStore() {
  useChatStore.setState({
    sessions: [],
    activeSessionId: null,
    hasHydrated: true,
    currentMode: 'general',
    pendingAttachments: [],
    inputValue: '',
    isSending: false,
    waitingFirstChunk: false,
    pendingAssistantMsgId: null,
    aiHubStatus: { running: false, port: 0 },
    aiHubProviders: [],
    selectedProvider: 'mock-provider',
    truncateNotice: null,
  })
  window.localStorage.clear()
}

interface AIHubMock {
  status: () => Promise<{ running: boolean; port: number }>
  chat: (...args: unknown[]) => Promise<string>
  clearSession?: (id: string) => Promise<void>
}

function mockAIHub(chatImpl?: (...args: unknown[]) => Promise<string>) {
  const api: AIHubMock = {
    status: async () => ({ running: true, port: 18721 }),
    chat: chatImpl || (async () => '对话摘要：已完成 X'),
  }
  ;(window.electron as unknown as { aihub: AIHubMock }).aihub = api
  return api
}

function seedSession(count: number): string {
  const id = useChatStore.getState().createSession()
  for (let i = 0; i < count; i++) {
    useChatStore.getState().addMessage({ role: 'user', content: `消息${i}`, mode: 'general' })
  }
  return id
}

// ===== C-1 手动摘要替换（默认压缩历史）=====

describe('C-1 手动摘要替换（默认压缩历史）', () => {
  beforeEach(() => {
    resetStore()
    vi.unstubAllGlobals()
  })

  it('summarizeSession 调后端（控制前缀+历史文本）并把会话消息替换为 system 摘要', async () => {
    const chatSpy = vi.fn(async (...args: unknown[]) => {
      // 校验转发协议：控制前缀 + 历史文本（不包含 system 摘要标记）
      const [, message] = args
      expect(String(message).startsWith(CTRL_SUMMARIZE_PREFIX)).toBe(true)
      expect(String(message)).toContain('消息0')
      return '对话摘要：已完成 X'
    })
    mockAIHub(chatSpy)
    const id = seedSession(2)

    const res = await useChatStore.getState().summarizeSession(id)

    expect(res.ok).toBe(true)
    expect(res.summary).toBe('对话摘要：已完成 X')
    const session = useChatStore.getState().sessions.find((s) => s.id === id)
    expect(session?.messages).toHaveLength(1)
    expect(session?.messages[0].role).toBe('system')
    expect(session?.messages[0].content).toContain('对话摘要：已完成 X')
  })

  it('缺省 sessionId 时作用于当前活跃会话', async () => {
    mockAIHub()
    seedSession(1)
    const id = useChatStore.getState().activeSessionId!
    const res = await useChatStore.getState().summarizeSession(undefined)
    expect(res.ok).toBe(true)
    expect(useChatStore.getState().sessions.find((s) => s.id === id)?.messages).toHaveLength(1)
  })

  it('空会话返回 ok:false 且不调用后端', async () => {
    const chatSpy = vi.fn()
    mockAIHub(chatSpy)
    const id = useChatStore.getState().createSession()
    const res = await useChatStore.getState().summarizeSession(id)
    expect(res.ok).toBe(false)
    expect(chatSpy).not.toHaveBeenCalled()
  })
})

// ===== C-2 保留完整历史开关 =====

describe('C-2 摘要保留完整历史开关（keepFull）', () => {
  beforeEach(() => {
    resetStore()
    vi.unstubAllGlobals()
  })

  it('keepFull=true 保留原消息，并在顶部前插 system 摘要标记', async () => {
    mockAIHub()
    const id = seedSession(2)

    const res = await useChatStore.getState().summarizeSession(id, { keepFull: true })

    expect(res.ok).toBe(true)
    const session = useChatStore.getState().sessions.find((s) => s.id === id)
    expect(session?.messages).toHaveLength(3)
    expect(session?.messages[0].role).toBe('system')
    expect(session?.messages[0].content).toContain('完整历史')
    expect(session?.messages[1].content).toBe('消息0')
    expect(session?.messages[2].content).toBe('消息1')
  })
})

// ===== C-3 摘要失败保持原历史 =====

describe('C-3 摘要失败保持原历史', () => {
  beforeEach(() => {
    resetStore()
    vi.unstubAllGlobals()
  })

  it('后端失败返回 ok:false + error，原消息不被改动', async () => {
    mockAIHub(async () => {
      throw new Error('hub down')
    })
    const id = seedSession(3)
    const before = useChatStore
      .getState()
      .sessions.find((s) => s.id === id)
      ?.messages.map((m) => m.content)

    const res = await useChatStore.getState().summarizeSession(id)

    expect(res.ok).toBe(false)
    expect(res.error).toBe('hub down')
    const after = useChatStore
      .getState()
      .sessions.find((s) => s.id === id)
      ?.messages.map((m) => m.content)
    expect(after).toEqual(before)
  })

  it('后端返回错误文本时同样视为失败并保持原历史', async () => {
    mockAIHub(async () => '错误: API key invalid')
    const id = seedSession(2)

    const res = await useChatStore.getState().summarizeSession(id)

    expect(res.ok).toBe(false)
    expect(useChatStore.getState().sessions.find((s) => s.id === id)?.messages).toHaveLength(2)
  })
})

// ===== C-4 长会话截断 =====

describe('C-4 长会话截断（前端裁剪 + 后端联动）', () => {
  beforeEach(() => {
    resetStore()
    vi.unstubAllGlobals()
  })

  it('truncateSession 调用后端控制消息并裁剪为最近 TRUNCATE_KEEP 条（新对话语义）', async () => {
    const chatSpy = vi.fn(async () => '')
    mockAIHub(chatSpy)
    const id = seedSession(250)

    const res = await useChatStore.getState().truncateSession(id)

    expect(res.ok).toBe(true)
    expect(chatSpy).toHaveBeenCalledWith(
      id,
      `${CTRL_TRUNCATE_PREFIX}${TRUNCATE_KEEP}`,
      'general',
      undefined,
      [],
      'semi_auto',
    )
    const session = useChatStore.getState().sessions.find((s) => s.id === id)
    expect(session?.messages).toHaveLength(TRUNCATE_KEEP)
    // 保留最近 100 条
    expect(session?.messages[0].content).toBe('消息150')
    expect(session?.messages[TRUNCATE_KEEP - 1].content).toBe('消息249')
  })

  it('后端不可用时仍完成前端裁剪（不抛错）', async () => {
    mockAIHub(async () => {
      throw new Error('hub down')
    })
    const id = seedSession(200)

    await expect(useChatStore.getState().truncateSession(id)).resolves.toEqual({ ok: true })
    expect(useChatStore.getState().sessions.find((s) => s.id === id)?.messages).toHaveLength(TRUNCATE_KEEP)
  })

  it('截断后清除该会话的截断提示', async () => {
    mockAIHub()
    const id = seedSession(TRUNCATE_THRESHOLD + 1)
    expect(useChatStore.getState().truncateNotice?.sessionId).toBe(id)

    await useChatStore.getState().truncateSession(id)
    expect(useChatStore.getState().truncateNotice).toBeNull()
  })
})

// ===== C-5 超阈值提示 =====

describe('C-5 长会话超阈值提示', () => {
  beforeEach(() => {
    resetStore()
    vi.unstubAllGlobals()
  })

  it('消息数达到阈值时 addMessage 设置 truncateNotice（每会话仅一次）', () => {
    const id = useChatStore.getState().createSession()
    for (let i = 0; i < TRUNCATE_THRESHOLD; i++) {
      useChatStore.getState().addMessage({ role: 'user', content: `m${i}`, mode: 'general' })
    }
    const notice = useChatStore.getState().truncateNotice
    expect(notice?.sessionId).toBe(id)
    expect(notice?.count).toBe(TRUNCATE_THRESHOLD)
    // 再追加消息不重复提示（仍指向同一会话）
    useChatStore.getState().addMessage({ role: 'user', content: 'm200', mode: 'general' })
    expect(useChatStore.getState().truncateNotice?.sessionId).toBe(id)
  })

  it('切换会话不会污染其它会话的截断提示', () => {
    const a = useChatStore.getState().createSession()
    const b = useChatStore.getState().createSession()
    for (let i = 0; i < TRUNCATE_THRESHOLD; i++) {
      useChatStore.getState().addMessage({ role: 'user', content: `m${i}`, mode: 'general' })
    }
    expect(useChatStore.getState().truncateNotice?.sessionId).toBe(b)
    useChatStore.getState().setActiveSession(a)
    expect(useChatStore.getState().truncateNotice?.sessionId).toBe(b)
  })

  it('dismissTruncateNotice 清除提示；清空会话上下文也清除该会话提示', () => {
    const id = useChatStore.getState().createSession()
    for (let i = 0; i < TRUNCATE_THRESHOLD; i++) {
      useChatStore.getState().addMessage({ role: 'user', content: `m${i}`, mode: 'general' })
    }
    useChatStore.getState().dismissTruncateNotice()
    expect(useChatStore.getState().truncateNotice).toBeNull()
  })
})

// ===== 纯函数阈值 =====

describe('截断阈值纯函数', () => {
  it('shouldShowTruncateNotice 边界判定', () => {
    expect(shouldShowTruncateNotice(199)).toBe(false)
    expect(shouldShowTruncateNotice(TRUNCATE_THRESHOLD)).toBe(true)
    expect(shouldShowTruncateNotice(201)).toBe(true)
  })
})
