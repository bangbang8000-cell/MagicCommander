import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useLogStore } from './log.store'

function reset() {
  useLogStore.setState({ logs: [], maxLogs: 1000 })
}

beforeEach(() => {
  reset()
})

describe('useLogStore（508-a 覆盖率）', () => {
  it('addLog 追加日志并默认 source=app、id 递增', () => {
    useLogStore.getState().addLog('info', 'hello')
    useLogStore.getState().addLog('error', 'boom')
    const logs = useLogStore.getState().logs
    expect(logs).toHaveLength(2)
    expect(logs[0]).toMatchObject({ level: 'info', message: 'hello', source: 'app' })
    expect(logs[1]).toMatchObject({ level: 'error', message: 'boom', source: 'app' })
    expect(logs[1].id).toBeGreaterThan(logs[0].id)
    expect(logs[0].timestamp).toBeTruthy()
    expect(logs[0].id).toBeGreaterThan(0)
  })

  it('超过 maxLogs 时按先进先出裁剪', () => {
    useLogStore.setState({ maxLogs: 3 })
    for (let i = 0; i < 6; i++) useLogStore.getState().addLog('info', `m${i}`)
    const logs = useLogStore.getState().logs
    expect(logs).toHaveLength(3)
    expect(logs[0].message).toBe('m3')
    expect(logs[2].message).toBe('m5')
  })

  it('clearLogs 清空日志', () => {
    useLogStore.getState().addLog('info', 'x')
    useLogStore.getState().clearLogs()
    expect(useLogStore.getState().logs).toHaveLength(0)
  })

  it('无 electron 环境下 subscribeLog/subscribeRenderProgressLog 返回 noop 且不报错', () => {
    ;(window as unknown as { electron?: unknown }).electron = undefined
    const un1 = useLogStore.getState().subscribeLog()
    const un2 = useLogStore.getState().subscribeRenderProgressLog()
    expect(un1()).toBeUndefined()
    expect(un2()).toBeUndefined()
  })

  it('subscribeLog 收到 output 事件时按级别归一并写入日志', () => {
    let handler: ((d: { level: string; message: string; source?: string }) => void) | null = null
    ;(window as unknown as { electron?: unknown }).electron = {
      log: {
        onOutput: vi.fn(
          (h: (d: { level: string; message: string; source?: string }) => void) => {
            handler = h
            return () => {}
          },
        ),
      },
    }
    const unsub = useLogStore.getState().subscribeLog()
    expect(typeof handler).toBe('function')
    handler!({ level: 'warning', message: ' dep ', source: 'electron' })
    handler!({ level: 'complete', message: 'done' })
    const logs = useLogStore.getState().logs
    expect(logs).toHaveLength(2)
    expect(logs[0]).toMatchObject({ level: 'warn', message: ' dep ', source: 'electron' })
    expect(logs[1]).toMatchObject({ level: 'success', message: 'done' })
    unsub()
  })

  it('subscribeRenderProgressLog 过滤空消息并映射状态级别', () => {
    let handler: ((r: unknown) => void) | null = null
    ;(window as unknown as { electron?: unknown }).electron = {
      render: {
        onProgress: vi.fn((h: (r: unknown) => void) => {
          handler = h
          return () => {}
        }),
      },
    }
    useLogStore.getState().subscribeRenderProgressLog()
    handler!({ status: '  ', message: '   ' }) // 空白消息被过滤
    handler!({ status: 'error', message: ' failed ' })
    handler!({ status: 'complete', message: 'ok' })
    const logs = useLogStore.getState().logs
    expect(logs).toHaveLength(2)
    expect(logs[0]).toMatchObject({ level: 'error', message: 'failed', source: 'backend' })
    expect(logs[1]).toMatchObject({ level: 'success', message: 'ok', source: 'backend' })
  })
})