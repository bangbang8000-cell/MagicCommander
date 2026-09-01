/**
 * V4.2.0-42-a: 崩溃上报（脱敏）——移植自 AL crash.ts
 *
 * 无自有崩溃收集服务，采用「本地可回收 + 脱敏留痕」策略：
 *  - crashReporter 本地收集崩溃转储（不自动上传，开发者可从 userData/Crashpad 取回）
 *  - 主进程未捕获异常/未处理拒绝：脱敏后追加写入 userData/logs/errors.log
 *  - 渲染进程崩溃：脱敏记录 + 自动 reload 恢复主窗口
 *  - 诊断入口预留：readErrorsLog()/getCrashInfo() 供 4.7 诊断中心使用
 */
import { app, BrowserWindow, crashReporter } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

// ===== 日志脱敏 =====
const KV_PATTERN =
  /(["']?(?:api[_-]?key|apikey|token|access[_-]?token|refresh[_-]?token|password|passwd|secret|authorization|credential)["']?\s*[:=]\s*["']?)[^\s"',}\]]+/gi

const AUTH_SCHEME_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/gi

/** OpenAI 风格密钥（sk- 前缀，至少 6 位） */
const OPENAI_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{6,}/g

/** 对任意字符串执行敏感信息脱敏（用于日志输出前）。
 * 顺序：先脱敏 Bearer/Basic 认证令牌，再脱敏 KV 凭据与 sk- 密钥 ——
 * 若先跑 KV，会把 `Bearer` 词本身替换掉，导致后续 `Bearer <token>` 无法匹配而泄漏 token。 */
export function redactSensitive(input: string): string {
  if (!input) return input
  return input.replace(AUTH_SCHEME_PATTERN, '$1 ***').replace(KV_PATTERN, '$1***').replace(OPENAI_KEY_PATTERN, 'sk-***')
}

/**
 * 对任意未知值（Error / string / 对象）生成脱敏后的日志文本。
 * 对象会 JSON 序列化后整体脱敏；序列化失败时回退 String(value)。
 */
export function redactForLog(value: unknown): string {
  if (value instanceof Error) {
    return redactSensitive(value.message)
  }
  if (typeof value === 'string') {
    return redactSensitive(value)
  }
  try {
    return redactSensitive(JSON.stringify(value))
  } catch {
    return redactSensitive(String(value))
  }
}

// ===== 崩溃留痕 =====

function getLogPath(): string {
  const dir = path.join(app.getPath('userData'), 'logs')
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    /* ignore */
  }
  return path.join(dir, 'errors.log')
}

function appendErrorLog(tag: string, message: string): void {
  try {
    const line = `[${new Date().toISOString()}] [${tag}] ${redactForLog(message)}\n`
    fs.appendFileSync(getLogPath(), line)
  } catch {
    /* 日志写入失败不阻断应用 */
  }
}

/** 初始化崩溃收集：本地转储，不上传 */
export function initCrashReporting(): void {
  crashReporter.start({
    uploadToServer: false,
    compress: true,
    extra: {
      appVersion: app.getVersion(),
      platform: process.platform,
    },
  })
}

/** 主进程异常兜底：脱敏留痕（不吞异常，由 Electron 默认退出策略接管） */
export function registerProcessGuards(): void {
  process.on('uncaughtException', (err) => {
    appendErrorLog('uncaughtException', err instanceof Error ? err.stack || err.message : String(err))
  })
  process.on('unhandledRejection', (reason) => {
    appendErrorLog('unhandledRejection', reason instanceof Error ? reason.stack || reason.message : String(reason))
  })
}

/** 渲染进程崩溃监控：记录 + 自动 reload 恢复主窗口（非 clean-exit 才恢复） */
export function watchRendererCrashes(win: BrowserWindow): void {
  win.webContents.on('render-process-gone', (_event, details) => {
    const summary = `reason=${details.reason} exitCode=${details.exitCode}`
    appendErrorLog('render-process-gone', summary)
    if (details.reason !== 'clean-exit' && !win.isDestroyed()) {
      try {
        win.reload()
      } catch {
        /* ignore */
      }
    }
  })
}

// ===== 诊断入口（4.7 诊断中心预留）=====

/** 崩溃留痕文件路径（errors.log） */
export function getErrorsLogPath(): string {
  return getLogPath()
}

/** 读取崩溃留痕全文（缺失/读取失败返回空字符串） */
export function readErrorsLog(): string {
  try {
    const logPath = getLogPath()
    if (!fs.existsSync(logPath)) return ''
    return fs.readFileSync(logPath, 'utf-8')
  } catch {
    return ''
  }
}

/** 崩溃留痕行数（缺失返回 0） */
export function countErrorLines(): number {
  const content = readErrorsLog()
  if (!content) return 0
  return content.split(/\r?\n/).filter((line) => line.trim().length > 0).length
}

/** 汇总崩溃信息（供主进程启动摘要 / 4.7 诊断中心查询） */
export function getCrashInfo(): {
  errorsLogPath: string
  errorCount: number
  lastLines: string[]
  crashDumpsDir: string
} {
  const content = readErrorsLog()
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)
  return {
    errorsLogPath: getLogPath(),
    errorCount: lines.length,
    lastLines: lines.slice(-5),
    crashDumpsDir: path.join(app.getPath('userData'), 'Crashpad'),
  }
}
