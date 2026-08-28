/**
 * chat.store sendMessage 流式收尾健壮性测试
 * - 短单 chunk 完成时最终 flush 生效（rAF 未执行也不丢帧）
 * - 空流（仅 done）完成时给 assistant 消息补友好提示，消息非空
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendMessage, useChatStore } from '@/stores/chat.store'

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

/** mock window.electron.aihub，暴露受控的 emitChunk / finish 以便精确控制流收尾时序 */
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

describe('chat.store sendMessage 流式收尾', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    useChatStore.setState({
      sessions: [],
      activeSessionId: null,
      currentMode: 'general',
      pendingAttachments: [],
      inputValue: '',
      isSending: false,
      aiHubStatus: { running: false, port: 0 },
      aiHubProviders: [],
      selectedProvider: undefined,
    })
  })

  it('短单 chunk 在 rAF 窗口内完成时最终 flush 生效，不丢帧', async () => {
    // rAF 被 stub 为不调度回调：唯一能落库的途径是完成时的最终 flush
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => {})

    const mock = mockAIHub()
    useChatStore.getState().createSession()
    const sid = useChatStore.getState().activeSessionId!
    const p = sendMessage(useChatStore.getState(), '你好', 'general', [])
    await mock.waitStreamReady()
    mock.emitChunk({ sessionId: sid, chunk: '你好' })
    mock.finish()
    await p

    const ai = useChatStore.getState().getActiveSession()?.messages.find((m) => m.role === 'assistant')
    expect(ai?.content).toBe('你好')
  })

  it('空流（仅 done）完成时 assistant 消息被补友好提示，内容非空', async () => {
    const mock = mockAIHub()
    useChatStore.getState().createSession()
    const p = sendMessage(useChatStore.getState(), '你好', 'general', [])
    await mock.waitChatCalled()
    mock.finish()
    await p

    const ai = useChatStore.getState().getActiveSession()?.messages.find((m) => m.role === 'assistant')
    expect(ai?.content).toBeTruthy()
    expect(ai?.content!.length).toBeGreaterThan(0)
  })
})
