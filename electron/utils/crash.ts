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
import { redactForLog } from './redact'
import { telemetryService } from '../services/telemetry.service'

// 47-b：脱敏工具抽离至 ./redact（crash → audit/telemetry 共用，避免循环依赖），此处 re-export 兼容既有导入
export { redactSensitive, redactForLog } from './redact'

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
    // 47-d：启用遥测时记录崩溃事件（脱敏、本地仅落盘）
    telemetryService.record('crash', { tag, message })
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
