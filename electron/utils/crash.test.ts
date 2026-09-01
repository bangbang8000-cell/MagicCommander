/**
 * S-1 崩溃模拟：转储（crashReporter 本地）+ 脱敏 errors.log + 渲染崩溃自动 reload
 * V4.2.0-42-a（仅 electron 配置运行：vitest.electron.config.ts 提供 electron mock 别名）
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { app, crashReporter, BrowserWindow } from 'electron'
import {
  initCrashReporting,
  registerProcessGuards,
  watchRendererCrashes,
  redactSensitive,
  redactForLog,
  readErrorsLog,
  getCrashInfo,
  getErrorsLogPath,
} from './crash'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-crash-'))
  ;(app as unknown as { getPath: (n: string) => string }).getPath = () => tmpDir
})

describe('initCrashReporting（本地转储，不上传）', () => {
  it('以 uploadToServer=false 启动 crashReporter，附带版本与平台', () => {
    const start = vi.spyOn(crashReporter, 'start')
    initCrashReporting()
    const args = start.mock.calls[0]?.[0] as {
      uploadToServer: boolean
      compress: boolean
      extra: Record<string, unknown>
    }
    expect(args.uploadToServer).toBe(false)
    expect(args.compress).toBe(true)
    expect(args.extra.appVersion).toBeTruthy()
    expect(args.extra.platform).toBeTruthy()
  })
})

describe('脱敏（凭据/token/密钥不落盘）', () => {
  it('脱敏 apiKey/token/password 等 KV 凭据', () => {
    expect(redactSensitive('apiKey=sk-1234567890abcdef')).toBe('apiKey=***')
    expect(redactSensitive('token: abcdef123456')).toBe('token: ***')
    expect(redactSensitive('password="hunter2secret"')).toBe('password="***"')
  })

  it('脱敏 Bearer/Basic 认证头（令牌整体不泄漏）', () => {
    const out = redactSensitive('Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ')
    expect(out).not.toContain('eyJhb')
    expect(out).toContain('***')
  })

  it('脱敏 OpenAI 风格 sk- 密钥', () => {
    expect(redactSensitive('key=sk-proj-abcdefghijklmnopqrstuvwxyz')).toBe('key=sk-***')
  })

  it('redactForLog 对 Error/对象/字符串统一脱敏', () => {
    expect(redactForLog(new Error('apiKey=secret123'))).toBe('apiKey=***')
    expect(redactForLog({ token: 'abc123' })).toBe('{"token":"***"}')
    expect(redactForLog('普通信息')).toBe('普通信息')
  })
})

describe('watchRendererCrashes（渲染崩溃自动 reload）', () => {
  function makeWindow(): {
    win: BrowserWindow
    reloaded: () => boolean
    emitCrash: (details: { reason: string; exitCode: number }) => void
  } {
    let handler: ((_e: unknown, d: { reason: string; exitCode: number }) => void) | null = null
    let reloaded = false
    let destroyed = false
    const win = {
      isDestroyed: () => destroyed,
      reload: () => {
        reloaded = true
      },
      webContents: {
        on: (event: string, cb: (_e: unknown, d: { reason: string; exitCode: number }) => void) => {
          if (event === 'render-process-gone') handler = cb
        },
      },
    } as unknown as BrowserWindow
    return {
      win,
      reloaded: () => reloaded,
      emitCrash: (details) => handler?.({}, details),
    }
  }

  it('非 clean-exit 崩溃 → 记录 + 自动 reload', () => {
    const { win, reloaded, emitCrash } = makeWindow()
    watchRendererCrashes(win)
    emitCrash({ reason: 'crashed', exitCode: -6 })
    expect(reloaded()).toBe(true)
    expect(readErrorsLog()).toContain('render-process-gone')
    expect(readErrorsLog()).toContain('reason=crashed')
  })

  it('clean-exit 不触发 reload（正常关闭不恢复）', () => {
    const { win, reloaded, emitCrash } = makeWindow()
    watchRendererCrashes(win)
    emitCrash({ reason: 'clean-exit', exitCode: 0 })
    expect(reloaded()).toBe(false)
  })
})

describe('主进程兜底与诊断入口', () => {
  it('registerProcessGuards 注册 uncaughtException/unhandledRejection（不抛错）', () => {
    expect(() => registerProcessGuards()).not.toThrow()
  })

  it('getErrorsLogPath/readErrorsLog/getCrashInfo 可用（无文件时为空且不抛错）', () => {
    expect(getErrorsLogPath()).toContain('errors.log')
    expect(readErrorsLog()).toBe('')
    const info = getCrashInfo()
    expect(info.errorCount).toBe(0)
    expect(Array.isArray(info.lastLines)).toBe(true)
    expect(info.crashDumpsDir).toContain('Crashpad')
  })
})
