/**
 * 5.4.12-F54-12-5：下载弹性层单测（自动重试 / 停滞熔断 / 校验自愈）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  downloadWithResilience,
  IntegrityError,
  StallAbortError,
  backoffMs,
  DEFAULT_MAX_ATTEMPTS,
} from './download-resilience'

describe('downloadWithResilience', () => {
  beforeEach(() => vi.useRealTimers())
  afterEach(() => vi.useRealTimers())

  it('首次尝试成功：仅调用一次 attempt，offset=0', async () => {
    const attempt = vi.fn(async () => {})
    await downloadWithResilience(attempt)
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(attempt.mock.calls[0][0]).toEqual({ attempt: 1, offset: 0 })
  })

  it('瞬时失败自动重试：第三次成功（保留 offset 续传）', async () => {
    let calls = 0
    const offsets: number[] = []
    await downloadWithResilience(async (ctx, _signal, onProgress) => {
      calls += 1
      offsets.push(ctx.offset)
      onProgress(100 * calls) // 有进展，不会触发停滞熔断
      if (calls < 3) throw new Error('network reset')
    })
    expect(calls).toBe(3)
    // 非完整性错误：偏移保留
    expect(offsets).toEqual([0, 0, 0])
  })

  it('校验失败（IntegrityError）→ 偏移重置为 0 全量重下', async () => {
    let calls = 0
    const offsets: number[] = []
    await downloadWithResilience(async (ctx, _signal, onProgress) => {
      calls += 1
      offsets.push(ctx.offset)
      onProgress(50 * calls)
      if (calls === 1) throw new IntegrityError('sha512 mismatch')
    })
    expect(calls).toBe(2)
    // 第二次应全量重下（offset 归零）
    expect(offsets).toEqual([0, 0])
  })

  it('重试耗尽抛最后一次错误', async () => {
    const boom = new Error('final failure')
    await expect(
      downloadWithResilience(
        async (_ctx, _signal, onProgress) => {
          onProgress(10)
          throw boom
        },
        { maxAttempts: 2, baseBackoffMs: 1 },
      ),
    ).rejects.toThrow('final failure')
  })

  it('停滞熔断：progress 停滞超时 → abort 当前尝试并重试成功', async () => {
    vi.useFakeTimers()
    let calls = 0
    const promise = downloadWithResilience(
      async (_ctx, signal, onProgress) => {
        calls += 1
        // 第一次尝试：报一次进度后停滞（不 resolve），等待停滞熔断 abort
        if (calls === 1) {
          onProgress(10)
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true })
          })
        }
        // 第二次尝试直接成功
      },
      { maxAttempts: 2, stallTimeoutMs: 1000, baseBackoffMs: 1 },
    )
    // 推进到停滞熔断触发 + 退避
    await vi.advanceTimersByTimeAsync(2000)
    await promise
    expect(calls).toBe(2)
    vi.useRealTimers()
  })

  it('停滞熔断使用 StallAbortError 作为 abort reason', async () => {
    vi.useFakeTimers()
    let received: unknown = null
    const promise = downloadWithResilience(
      async (_ctx, signal) => {
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true })
        })
      },
      { maxAttempts: 1, stallTimeoutMs: 500, baseBackoffMs: 1 },
    ).catch((err) => {
      received = err
    })
    await vi.advanceTimersByTimeAsync(2000)
    await promise
    expect(received).toBeInstanceOf(StallAbortError)
    vi.useRealTimers()
  })

  it('backoff 指数退避公式', () => {
    expect(backoffMs(1000, 1)).toBe(1000)
    expect(backoffMs(1000, 2)).toBe(2000)
    expect(backoffMs(1000, 3)).toBe(4000)
  })

  it('默认最大尝试次数为 3', () => {
    expect(DEFAULT_MAX_ATTEMPTS).toBe(3)
  })
})
