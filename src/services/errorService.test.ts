import { describe, it, expect, beforeEach, vi } from 'vitest'
import { errorService } from './errorService'
import { useLogStore } from '@/stores/log.store'

beforeEach(() => {
  useLogStore.setState({ logs: [] })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('errorService（508-a 覆盖率）', () => {
  it('handleError 提取 Error 消息并写入日志', () => {
    errorService.handleError(new Error('boom'), 'ctx')
    const logs = useLogStore.getState().logs
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ level: 'error', message: '[ctx] boom', source: 'app' })
  })

  it('handleError 对非 Error 值做字符串化', () => {
    errorService.handleError(42, 'ctx')
    const logs = useLogStore.getState().logs
    expect(logs[0].message).toBe('[ctx] 42')
  })

  it('handleWarning 写 warn 级别日志', () => {
    errorService.handleWarning('注意', 'wctx')
    const logs = useLogStore.getState().logs
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ level: 'warn', message: '[wctx] 注意' })
  })

  it('handleInfo 写 info 级别日志', () => {
    errorService.handleInfo('信息', 'ictx')
    const logs = useLogStore.getState().logs
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ level: 'info', message: '[ictx] 信息' })
  })
})