/**
 * 5.4.12-F54-12-5：下载弹性层（自动重试 / 停滞熔断 / 校验自愈）
 *
 * 包装"单次断点续传下载尝试"，对齐 AL 5.4.3 W2 的可靠性要求：
 *  - 自动重试：maxAttempts 次，指数退避
 *  - 停滞熔断：progress 在 stallTimeoutMs 内无增长 → abort 本次尝试并重试（保留 .part，从偏移续传）
 *  - 校验自愈：完整性校验失败（sha512 不符）→ 清空偏移全量重下再试
 *
 * 本模块不依赖 Electron，便于纯单测。
 */

/** 完整性校验失败专用错误（触发全量重下而非续传） */
export class IntegrityError extends Error {
  constructor(message = 'integrity check failed') {
    super(message)
    this.name = 'IntegrityError'
  }
}

/** 由停滞熔断触发的 abort（可识别，用于日志/统计） */
export class StallAbortError extends Error {
  constructor(message = 'download stalled') {
    super(message)
    this.name = 'StallAbortError'
  }
}

export interface DownloadAttemptContext {
  /** 从 1 起计 */
  attempt: number
  /** 断点续传偏移（已落盘字节数）；完整性失败后重置为 0（全量重下） */
  offset: number
}

export interface ResilientDownloadOptions {
  maxAttempts?: number
  /** progress 在此毫秒内无增长即判定停滞（0 关闭熔断） */
  stallTimeoutMs?: number
  baseBackoffMs?: number
  onAttempt?: (ctx: DownloadAttemptContext, error?: unknown) => void
}

export const DEFAULT_MAX_ATTEMPTS = 3
export const DEFAULT_STALL_TIMEOUT_MS = 30_000
export const DEFAULT_BASE_BACKOFF_MS = 1_000

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * 弹性下载：
 * @param attempt 单次下载尝试。抛 IntegrityError → 清偏移全量重下；
 *                抛 StallAbortError / 其它错误 → 保留偏移续传重试；
 *                受 AbortSignal 中断时 attempt 应自行向调用方抛错（本层据此重试）。
 * @returns 解析即成功；重试耗尽抛最后一次错误。
 */
export async function downloadWithResilience(
  attempt: (ctx: DownloadAttemptContext, signal: AbortSignal, onProgress: (bytes: number) => void) => Promise<void>,
  options: ResilientDownloadOptions = {},
): Promise<void> {
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    stallTimeoutMs = DEFAULT_STALL_TIMEOUT_MS,
    baseBackoffMs = DEFAULT_BASE_BACKOFF_MS,
    onAttempt,
  } = options

  let offset = 0
  let lastErr: unknown = null

  for (let attemptNo = 1; attemptNo <= maxAttempts; attemptNo++) {
    const controller = new AbortController()
    const signal = controller.signal
    let progressedAt = Date.now()
    let lastBytes = 0

    // 停滞熔断监视：progress 无增长超时 → abort 本次
    let stallTimer: ReturnType<typeof setTimeout> | null = null
    if (stallTimeoutMs > 0) {
      stallTimer = setInterval(
        () => {
          if (Date.now() - progressedAt >= stallTimeoutMs) {
            controller.abort(new StallAbortError())
          }
        },
        Math.max(250, Math.floor(stallTimeoutMs / 4)),
      )
    }

    const onProgress = (bytes: number) => {
      if (bytes > lastBytes) {
        lastBytes = bytes
        progressedAt = Date.now()
      }
    }

    try {
      onAttempt?.({ attempt: attemptNo, offset })
      await attempt({ attempt: attemptNo, offset }, signal, onProgress)
      return
    } catch (err) {
      lastErr = err
      const isIntegrity = err instanceof IntegrityError
      if (isIntegrity) {
        // 校验自愈：文件不可信 → 全量重下
        offset = 0
      }
      if (attemptNo < maxAttempts) {
        onAttempt?.({ attempt: attemptNo, offset }, err)
        await sleep(baseBackoffMs * 2 ** (attemptNo - 1))
      }
    } finally {
      if (stallTimer) clearInterval(stallTimer)
      // 信号确认中断
      if (!signal.aborted && controller.abort) controller.abort()
    }
  }

  throw lastErr
}

/** 指数退避基准（供测试断言） */
export function backoffMs(baseBackoffMs: number, attemptNo: number): number {
  return baseBackoffMs * 2 ** (attemptNo - 1)
}
