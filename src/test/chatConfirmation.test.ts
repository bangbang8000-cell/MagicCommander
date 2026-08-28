/**
 * PRD v3.3 M1（AI-1 确认卡片 / AI-2 思考指示器）可测逻辑测试
 *
 * 组件级渲染（ChatMessageBubble 按钮）依赖 react-i18next/electron 环境较重，
 * 按任务说明退化为对可测纯函数与 store 行为做单测：
 * - parseConfirmationMarker：确认标记解析 / 剥离 / 无标记兼容（AI-1）
 * - isWaitingFirstChunk：思考指示状态判定（AI-2）
 * - sendConfirmationReply：确认/取消回灌入口（isSending 防并发 + 用户消息 append）
 * - sendMessage 过程中 waitingFirstChunk 置位 / 收到首 chunk 清除 / 流结束清除（AI-2）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  sendMessage,
  sendConfirmationReply,
  parseConfirmationMarker,
  isWaitingFirstChunk,
  useChatStore,
} from '@/stores/chat.store'
import type { ChatMessage } from '@/types/chat'

interface StreamPayload {
  sessionId: string
  chunk: string
}

interface AIHubMock {
  status: () => Promise<{ running: boolean; port: number }>
  syncProviders: () => Promise<void>
  onStream: (cb: (p: StreamPayload) => void) => () => void
  chat: () => Promise<string>
}

function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      if (cond()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timeout'))
      setTimeout(tick, 10)
    }
    tick()
  })
}

/** mock window.electron.aihub，暴露受控 emitChunk / finish */
function mockAIHub() {
  let streamCb: ((p: StreamPayload) => void) | null = null
  let resolveChat: (() => void) | null = null
  const api: AIHubMock = {
    status: async () => ({ running: true, port: 18721 }),
    syncProviders: async () => {},
    onStream: (cb) => {
      streamCb = cb
      return () => {}
    },
    chat: () => new Promise<string>((res) => (resolveChat = () => res(''))),
  }
  ;(window.electron as unknown as { aihub: AIHubMock }).aihub = api
  return {
    waitStreamReady: () => waitFor(() => !!streamCb),
    waitChatCalled: () => waitFor(() => !!resolveChat),
    emitChunk: (p: StreamPayload) => streamCb?.(p),
    finish: () => resolveChat?.(),
  }
}

// ===== AI-1：确认标记解析（parseConfirmationMarker）=====

describe('parseConfirmationMarker（确认标记解析）', () => {
  it('识别独立标记行并提取工具名', () => {
    const content = '\n---CONFIRM:delete_project---\n\n> ⚠️ 操作 `delete_project` 需要确认。请回复 确认 继续，或 取消 中止。\n\n'
    const r = parseConfirmationMarker(content)
    expect(r).not.toBeNull()
    expect(r!.tool).toBe('delete_project')
  })

  it('剥离标记行后保留原确认文本（标记不进显示区）', () => {
    const content = '\n---CONFIRM:delete_project---\n\n> ⚠️ 操作 `delete_project` 需要确认。\n\n'
    const r = parseConfirmationMarker(content)!
    expect(r.displayContent).not.toContain('---CONFIRM:')
    expect(r.displayContent).toContain('需要确认')
    expect(r.displayContent).toContain('delete_project')
  })

  it('无标记时返回 null（向后兼容：仍可手输"确认"）', () => {
    expect(parseConfirmationMarker('普通回复内容')).toBeNull()
    expect(parseConfirmationMarker('')).toBeNull()
  })

  it('标记非独立行时不误判', () => {
    // 标记被夹在其它文本中（非整行）应忽略
    expect(parseConfirmationMarker('xx---CONFIRM:tool---yy')).toBeNull()
  })

  it('支持工具名含下划线', () => {
    const r = parseConfirmationMarker('---CONFIRM:create_template---\n提示')
    expect(r!.tool).toBe('create_template')
    expect(r!.displayContent).toBe('提示')
  })
})

// ===== AI-2：思考指示状态判定（isWaitingFirstChunk）=====

describe('isWaitingFirstChunk（思考指示状态判定）', () => {
  const baseMsg: ChatMessage = {
    id: 'm1',
    role: 'assistant',
    content: '',
    timestamp: 1,
    mode: 'general',
  }

  it('waiting 置位 + 归属当前流 + assistant + 无内容 → 思考中', () => {
    expect(isWaitingFirstChunk(baseMsg, true, 'm1')).toBe(true)
  })

  it('已收到首 chunk（内容非空）→ 非思考中', () => {
    expect(isWaitingFirstChunk({ ...baseMsg, content: 'hello' }, true, 'm1')).toBe(false)
  })

  it('非当前流消息 → 非思考中', () => {
    expect(isWaitingFirstChunk(baseMsg, true, 'other_id')).toBe(false)
  })

  it('全局 waitingFirstChunk 未置位 → 非思考中', () => {
    expect(isWaitingFirstChunk(baseMsg, false, 'm1')).toBe(false)
  })

  it('用户消息不显示思考指示', () => {
    expect(isWaitingFirstChunk({ ...baseMsg, role: 'user' }, true, 'm1')).toBe(false)
  })
})

// ===== AI-1：确认/取消回灌入口（sendConfirmationReply）=====

describe('sendConfirmationReply（确认/取消回灌）', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    useChatStore.setState({
      sessions: [],
      activeSessionId: null,
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
  })

  it('空闲时点击「确认」→ 返回 true 且以用户消息回灌"确认"', async () => {
    const mock = mockAIHub()
    useChatStore.getState().createSession()
    const sent = sendConfirmationReply('确认')
    expect(sent).toBe(true)
    await waitFor(() => {
      const msgs = useChatStore.getState().getActiveSession()?.messages || []
      return msgs.some((m) => m.role === 'user' && m.content === '确认')
    })
    await mock.waitChatCalled()
    mock.finish()
  })

  it('空闲时点击「取消」→ 以用户消息回灌"取消"', async () => {
    const mock = mockAIHub()
    useChatStore.getState().createSession()
    const sent = sendConfirmationReply('取消')
    expect(sent).toBe(true)
    await waitFor(() => {
      const msgs = useChatStore.getState().getActiveSession()?.messages || []
      return msgs.some((m) => m.role === 'user' && m.content === '取消')
    })
    await mock.waitChatCalled()
    mock.finish()
  })

  it('isSending 期间点击 → 返回 false 且不发送（避免并发）', () => {
    useChatStore.getState().createSession()
    useChatStore.setState({ isSending: true })
    const sent = sendConfirmationReply('确认')
    expect(sent).toBe(false)
    const msgs = useChatStore.getState().getActiveSession()?.messages || []
    expect(msgs.some((m) => m.role === 'user' && m.content === '确认')).toBe(false)
  })
})

// ===== AI-2：waitingFirstChunk 状态流转 =====

describe('waitingFirstChunk（思考指示状态流转）', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    useChatStore.setState({
      sessions: [],
      activeSessionId: null,
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
  })

  it('发送后占位已建 → waitingFirstChunk 置位并记录消息 id；收到首 chunk 清除', async () => {
    const mock = mockAIHub()
    useChatStore.getState().createSession()
    const sid = useChatStore.getState().activeSessionId!
    const p = sendMessage(useChatStore.getState(), '你好', 'general', [])
    await mock.waitStreamReady()
    expect(useChatStore.getState().waitingFirstChunk).toBe(true)
    expect(useChatStore.getState().pendingAssistantMsgId).toBeTruthy()

    mock.emitChunk({ sessionId: sid, chunk: '思' })
    expect(useChatStore.getState().waitingFirstChunk).toBe(false)

    mock.finish()
    await p
    expect(useChatStore.getState().pendingAssistantMsgId).toBeNull()
  })

  it('空流结束后 waitingFirstChunk 清除、pendingAssistantMsgId 复位', async () => {
    const mock = mockAIHub()
    useChatStore.getState().createSession()
    const p = sendMessage(useChatStore.getState(), '你好', 'general', [])
    await mock.waitChatCalled()
    expect(useChatStore.getState().waitingFirstChunk).toBe(true)
    mock.finish()
    await p
    expect(useChatStore.getState().waitingFirstChunk).toBe(false)
    expect(useChatStore.getState().pendingAssistantMsgId).toBeNull()
  })
})
