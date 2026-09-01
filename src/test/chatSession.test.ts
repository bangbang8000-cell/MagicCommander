/**
 * PRD v3.5 M1（MC-SESS1-4）AI 对话会话管理测试
 *
 * S-1 新建会话 / S-2 切换会话上下文隔离 / S-3 删除会话 / S-4 清空上下文（联动后端）/
 * S-5 会话持久化 / 重命名
 *
 * 组件级渲染依赖 react-i18next/electron 环境较重，按任务说明退化为对 store 纯逻辑做单测。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from '@/stores/chat.store'

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
    selectedProvider: undefined,
  })
  window.localStorage.clear()
}

// ===== S-1 新建会话 =====

describe('S-1 新建会话', () => {
  beforeEach(resetStore)

  it('createSession 创建会话并设为当前活跃', () => {
    const id = useChatStore.getState().createSession('template')
    const s = useChatStore.getState()
    expect(s.sessions).toHaveLength(1)
    expect(s.activeSessionId).toBe(id)
    expect(s.sessions[0].mode).toBe('template')
    expect(s.getActiveSession()?.id).toBe(id)
  })

  it('多次 createSession 累积多个会话', () => {
    useChatStore.getState().createSession()
    useChatStore.getState().createSession()
    expect(useChatStore.getState().sessions).toHaveLength(2)
  })
})

// ===== S-2 切换会话上下文隔离 =====

describe('S-2 切换会话上下文隔离', () => {
  beforeEach(resetStore)

  it('会话 A 与 B 消息列表互不串', () => {
    const a = useChatStore.getState().createSession()
    useChatStore.getState().addMessage({ role: 'user', content: 'A 的消息', mode: 'general' })

    useChatStore.getState().createSession()
    expect(useChatStore.getState().getActiveSession()?.messages).toHaveLength(0)

    useChatStore.getState().setActiveSession(a)
    const msgs = useChatStore.getState().getActiveSession()?.messages || []
    expect(msgs.map((m) => m.content)).toEqual(['A 的消息'])
  })

  it('addMessage 只追加到当前活跃会话（不污染其它会话）', () => {
    const a = useChatStore.getState().createSession()
    useChatStore.getState().addMessage({ role: 'user', content: '会话A问题', mode: 'general' })
    const b = useChatStore.getState().createSession()
    useChatStore.getState().addMessage({ role: 'user', content: '会话B问题', mode: 'general' })

    const getMsgs = (id: string) => useChatStore.getState().sessions.find((s) => s.id === id)?.messages || []

    expect(getMsgs(a).map((m) => m.content)).toEqual(['会话A问题'])
    expect(getMsgs(b).map((m) => m.content)).toEqual(['会话B问题'])
  })
})

// ===== S-3 删除会话 =====

describe('S-3 删除会话', () => {
  beforeEach(resetStore)

  it('删除活跃会话后自动激活剩余会话', () => {
    const a = useChatStore.getState().createSession()
    const b = useChatStore.getState().createSession()
    expect(useChatStore.getState().activeSessionId).toBe(b)
    useChatStore.getState().deleteSession(b)
    expect(useChatStore.getState().activeSessionId).toBe(a)
  })

  it('删除非活跃会话不影响当前活跃会话', () => {
    const a = useChatStore.getState().createSession()
    const b = useChatStore.getState().createSession()
    useChatStore.getState().deleteSession(a)
    expect(useChatStore.getState().activeSessionId).toBe(b)
    expect(useChatStore.getState().sessions).toHaveLength(1)
  })

  it('删除唯一会话后 activeSessionId 为 null', () => {
    const id = useChatStore.getState().createSession()
    useChatStore.getState().deleteSession(id)
    expect(useChatStore.getState().sessions).toHaveLength(0)
    expect(useChatStore.getState().activeSessionId).toBeNull()
  })
})

// ===== S-4 清空上下文（前端 + 后端联动）=====

describe('S-4 清空上下文', () => {
  beforeEach(() => {
    resetStore()
    vi.unstubAllGlobals()
  })

  it('clearSessionContext 清空当前会话消息并调用后端 aiHub.clearSession', async () => {
    const clearSpy = vi.fn().mockResolvedValue(undefined)
    ;(window.electron as unknown as { aihub: { clearSession: typeof clearSpy } }).aihub = {
      clearSession: clearSpy,
    }
    const id = useChatStore.getState().createSession()
    useChatStore.getState().addMessage({ role: 'user', content: '上下文内容', mode: 'general' })

    await useChatStore.getState().clearSessionContext()

    expect(useChatStore.getState().getActiveSession()?.messages).toHaveLength(0)
    expect(useChatStore.getState().getActiveSession()?.id).toBe(id)
    expect(clearSpy).toHaveBeenCalledWith(id)
  })

  it('clearCurrentSession 仅清前端不清后端（向后兼容纯前端语义）', () => {
    const clearSpy = vi.fn()
    ;(window.electron as unknown as { aihub: { clearSession: typeof clearSpy } }).aihub = {
      clearSession: clearSpy,
    }
    useChatStore.getState().createSession()
    useChatStore.getState().addMessage({ role: 'user', content: 'hi', mode: 'general' })
    useChatStore.getState().clearCurrentSession()
    expect(useChatStore.getState().getActiveSession()?.messages).toHaveLength(0)
    expect(clearSpy).not.toHaveBeenCalled()
  })

  it('后端 clear 失败时仍完成前端清空（不抛错）', async () => {
    const clearSpy = vi.fn().mockRejectedValue(new Error('hub down'))
    ;(window.electron as unknown as { aihub: { clearSession: typeof clearSpy } }).aihub = {
      clearSession: clearSpy,
    }
    useChatStore.getState().createSession()
    useChatStore.getState().addMessage({ role: 'user', content: 'hi', mode: 'general' })
    await expect(useChatStore.getState().clearSessionContext()).resolves.toBeUndefined()
    expect(useChatStore.getState().getActiveSession()?.messages).toHaveLength(0)
  })
})

// ===== S-5 会话持久化 =====

describe('S-5 会话持久化（zustand persist → localStorage）', () => {
  beforeEach(resetStore)

  it('persist 保存 sessions 与 activeSessionId，排除瞬态字段', () => {
    useChatStore.getState().createSession()
    useChatStore.getState().addMessage({ role: 'user', content: '持久化内容', mode: 'general' })

    const raw = window.localStorage.getItem('mc-chat-state')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw || '{}')
    expect(parsed.state.sessions).toHaveLength(1)
    expect(parsed.state.sessions[0].messages).toHaveLength(1)
    expect(parsed.state.activeSessionId).toBeTruthy()
    // 瞬态不持久化
    expect(parsed.state.isSending).toBeUndefined()
    expect(parsed.state.waitingFirstChunk).toBeUndefined()
    expect(parsed.state.pendingAssistantMsgId).toBeUndefined()
  })
})

// ===== 重命名会话 =====

describe('renameSession 重命名会话', () => {
  beforeEach(resetStore)

  it('重命名指定会话标题并更新 updatedAt', () => {
    const id = useChatStore.getState().createSession()
    useChatStore.getState().renameSession(id, '  我的新标题  ')
    const session = useChatStore.getState().sessions.find((s) => s.id === id)
    expect(session?.title).toBe('我的新标题')
  })

  it('空白标题被忽略（保持原标题）', () => {
    const id = useChatStore.getState().createSession()
    const before = useChatStore.getState().sessions.find((s) => s.id === id)?.title
    useChatStore.getState().renameSession(id, '   ')
    const after = useChatStore.getState().sessions.find((s) => s.id === id)?.title
    expect(after).toBe(before)
  })
})
