import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from './chat.store'

describe('chat.store 会话与消息管理', () => {
  beforeEach(() => {
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

  it('createSession 创建会话并设为当前', () => {
    const id = useChatStore.getState().createSession('template')
    const state = useChatStore.getState()
    expect(state.activeSessionId).toBe(id)
    expect(state.sessions).toHaveLength(1)
    expect(state.sessions[0].mode).toBe('template')
    expect(state.currentMode).toBe('template')
  })

  it('addMessage 追加到当前会话并保留显式 id', () => {
    useChatStore.getState().createSession()
    useChatStore.getState().addMessage({
      id: 'ai-msg-1',
      role: 'assistant',
      content: '你好',
      mode: 'general',
    })
    const session = useChatStore.getState().getActiveSession()
    expect(session?.messages).toHaveLength(1)
    expect(session?.messages[0].id).toBe('ai-msg-1')
    expect(session?.messages[0].content).toBe('你好')
  })

  it('deleteMessage 移除指定消息', () => {
    useChatStore.getState().createSession()
    useChatStore.getState().addMessage({ role: 'user', content: 'a', mode: 'general', id: 'm1' })
    useChatStore.getState().addMessage({ role: 'assistant', content: 'b', mode: 'general', id: 'm2' })
    useChatStore.getState().deleteMessage('m1')
    const session = useChatStore.getState().getActiveSession()
    expect(session?.messages.map((m) => m.id)).toEqual(['m2'])
  })

  it('setMode 更新当前模式', () => {
    useChatStore.getState().setMode('config')
    expect(useChatStore.getState().currentMode).toBe('config')
  })

  it('clearCurrentSession 清空当前会话消息但保留会话', () => {
    const sessionId = useChatStore.getState().createSession()
    useChatStore.getState().addMessage({ role: 'user', content: 'hi', mode: 'general' })
    useChatStore.getState().clearCurrentSession()
    const session = useChatStore.getState().getActiveSession()
    expect(session?.messages).toHaveLength(0)
    expect(session?.id).toBe(sessionId)
  })

  it('deleteSession 删除指定会话', () => {
    const id = useChatStore.getState().createSession()
    useChatStore.getState().deleteSession(id)
    const state = useChatStore.getState()
    expect(state.sessions).toHaveLength(0)
  })

  it('setInputValue / setAIHubStatus / setSelectedProvider 更新状态', () => {
    useChatStore.getState().setInputValue('hello')
    expect(useChatStore.getState().inputValue).toBe('hello')

    useChatStore.getState().setAIHubStatus({ running: true, port: 18721 })
    expect(useChatStore.getState().aiHubStatus.running).toBe(true)

    useChatStore.getState().setSelectedProvider('deepseek')
    expect(useChatStore.getState().selectedProvider).toBe('deepseek')
  })
})
