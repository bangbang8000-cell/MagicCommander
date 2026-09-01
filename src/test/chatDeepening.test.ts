/**
 * 4.3 F3-2（测试计划 A-3）：对话深化
 *
 * 覆盖：
 * - 上下文摘要增强：「摘要后继续」衔接（buildSummarizedMarker / summarizeSession 摘要 marker 含衔接文本）
 * - 会话管理增强：归档/取消归档（archiveSession/unarchiveSession/getActiveSessions/getArchivedSessions）
 * - 确认流完善：确认标记解析可携带参数（预览工具参数）；确认/取消回灌支持可编辑确认参数（控制消息）
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useChatStore,
  parseConfirmationMarker,
  buildSummarizedMarker,
  SUMMARY_CONTINUE_HINT,
  CONFIRM_REPLY_PREFIX,
  encodeConfirmArgs,
  decodeConfirmArgs,
  sendConfirmationReply,
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
    selectedProvider: undefined,
  })
  window.localStorage.clear()
  vi.unstubAllGlobals()
}

beforeEach(resetStore)

// ===== 摘要增强：「摘要后继续」衔接 =====

describe('上下文摘要增强（摘要后继续衔接）', () => {
  it('buildSummarizedMarker 在摘要后追加衔接提示', () => {
    const marker = buildSummarizedMarker('（摘要标记）', '核心内容')
    expect(marker).toContain('核心内容')
    expect(marker).toContain(SUMMARY_CONTINUE_HINT)
  })

  it('summarizeSession 生成的摘要 marker 含衔接文本', async () => {
    const chatMock = vi.fn().mockResolvedValue('这是生成的摘要内容')
    const statusMock = vi.fn().mockResolvedValue({ running: true, port: 18721 })
    ;(window.electron as unknown as { aihub: Record<string, unknown> }).aihub = {
      status: statusMock,
      chat: chatMock,
      onStream: () => () => {},
    }
    const id = useChatStore.getState().createSession()
    useChatStore.getState().addMessage({ role: 'user', content: '问题1', mode: 'general' })
    useChatStore.getState().addMessage({ role: 'assistant', content: '回答1', mode: 'general' })

    const result = await useChatStore.getState().summarizeSession(id)
    expect(result.ok).toBe(true)
    const msgs = useChatStore.getState().sessions.find((s) => s.id === id)?.messages || []
    expect(msgs).toHaveLength(1) // 摘要替换历史（新对话语义）
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toContain('这是生成的摘要内容')
    expect(msgs[0].content).toContain(SUMMARY_CONTINUE_HINT)
  })
})

// ===== 会话管理增强：归档 =====

describe('会话归档', () => {
  function seed() {
    const a = useChatStore.getState().createSession()
    const b = useChatStore.getState().createSession()
    return { a, b }
  }

  it('archiveSession 归档指定会话（不删除消息）', () => {
    const { a } = seed()
    useChatStore.getState().setActiveSession(a)
    useChatStore.getState().addMessage({ role: 'user', content: 'A消息', mode: 'general' })
    useChatStore.getState().archiveSession(a)
    const session = useChatStore.getState().sessions.find((s) => s.id === a)
    expect(session?.archived).toBe(true)
    expect(session?.messages).toHaveLength(1)
  })

  it('getArchivedSessions / getActiveSessions 正确区分归档与会话', () => {
    const { a, b } = seed()
    useChatStore.getState().archiveSession(a)
    const active = useChatStore.getState().getActiveSessions()
    const archived = useChatStore.getState().getArchivedSessions()
    expect(active.map((s) => s.id)).toEqual([b])
    expect(archived.map((s) => s.id)).toEqual([a])
  })

  it('unarchiveSession 取消归档恢复为活跃会话', () => {
    const { a } = seed()
    useChatStore.getState().archiveSession(a)
    expect(useChatStore.getState().getArchivedSessions()).toHaveLength(1)
    useChatStore.getState().unarchiveSession(a)
    expect(useChatStore.getState().getArchivedSessions()).toHaveLength(0)
    expect(useChatStore.getState().getActiveSessions()).toHaveLength(2)
  })

  it('归档状态随 persist 持久化', () => {
    const { a } = seed()
    useChatStore.getState().archiveSession(a)
    const raw = window.localStorage.getItem('mc-chat-state')
    const parsed = JSON.parse(raw || '{}')
    const stored = parsed.state.sessions.find((s: { id: string }) => s.id === a)
    expect(stored?.archived).toBe(true)
  })
})

// ===== 确认流完善：确认参数预览 + 可编辑确认参数 =====

describe('确认流完善（确认卡片参数）', () => {
  it('parseConfirmationMarker 解析带 b64 参数的确认标记（预览工具参数）', () => {
    const argsB64 = encodeConfirmArgs({ projectName: 'projA', fileType: 'output' })
    const content = `\n---CONFIRM:delete_files:${argsB64}---\n\n> ⚠️ 需要确认\n\n`
    const r = parseConfirmationMarker(content)
    expect(r).not.toBeNull()
    expect(r!.tool).toBe('delete_files')
    expect(r!.args).toEqual({ projectName: 'projA', fileType: 'output' })
    expect(r!.displayContent).toContain('需要确认')
  })

  it('parseConfirmationMarker 无参数段时向后兼容（args 为 undefined）', () => {
    const r = parseConfirmationMarker('\n---CONFIRM:delete_project---\n提示')
    expect(r!.tool).toBe('delete_project')
    expect(r!.args).toBeUndefined()
  })

  it('encodeConfirmArgs / decodeConfirmArgs 往返一致（UTF-8 中文安全）', () => {
    const args = { projectName: '测试项目', description: '中文描述' }
    const encoded = encodeConfirmArgs(args)
    expect(decodeConfirmArgs(encoded)).toEqual(args)
  })

  it('decodeConfirmArgs 非法输入返回 null（不抛错）', () => {
    expect(decodeConfirmArgs('not-a-valid-b64%%%')).toBeNull()
  })

  it('sendConfirmationReply 带修改参数 → 发送确认控制消息（可编辑确认参数）', async () => {
    let captured = ''
    const chatMock = vi.fn().mockImplementation(async (_sid: string, msg: string) => {
      captured = msg
      return ''
    })
    ;(window.electron as unknown as { aihub: Record<string, unknown> }).aihub = {
      status: vi.fn().mockResolvedValue({ running: true, port: 18721 }),
      syncProviders: vi.fn().mockResolvedValue(undefined),
      onStream: () => () => {},
      chat: chatMock,
    }
    useChatStore.getState().createSession()
    const sent = sendConfirmationReply('确认', undefined, {
      tool: 'delete_files',
      args: { projectName: 'projA', fileType: 'output' },
    })
    expect(sent).toBe(true)
    await new Promise((r) => setTimeout(r, 50))
    expect(captured.startsWith(CONFIRM_REPLY_PREFIX)).toBe(true)
    const decoded = decodeConfirmArgs(captured.slice(CONFIRM_REPLY_PREFIX.length))
    expect(decoded).toEqual({ tool: 'delete_files', args: { projectName: 'projA', fileType: 'output' } })
  })

  it('sendConfirmationReply 不带 options → 发送普通"确认"（向后兼容）', async () => {
    let captured = ''
    const chatMock = vi.fn().mockImplementation(async (_sid: string, msg: string) => {
      captured = msg
      return ''
    })
    ;(window.electron as unknown as { aihub: Record<string, unknown> }).aihub = {
      status: vi.fn().mockResolvedValue({ running: true, port: 18721 }),
      syncProviders: vi.fn().mockResolvedValue(undefined),
      onStream: () => () => {},
      chat: chatMock,
    }
    useChatStore.getState().createSession()
    sendConfirmationReply('确认')
    await new Promise((r) => setTimeout(r, 50))
    expect(captured).toBe('确认')
  })
})
