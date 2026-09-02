/**
 * 47-b：诊断中心聚合服务（主进程）
 * - 主进程日志（app.log 读取）、崩溃信息（crash.ts 预留入口）、审计、遥测摘要
 * - 性能快照（渲染层 perf.ts 数据经 IPC 上报存储）
 * - 系统信息（platform/arch/electron/node/磁盘可用）
 * - 一键导出支持包（adm-zip 打包 → 保存对话框）
 */
import * as fs from 'fs'
import * as path from 'path'
import { app, BrowserWindow, dialog } from 'electron'
import { getLogDir, getUserDataDir, APP_CONFIG } from '../config'
import { getCrashInfo, getErrorsLogPath, readErrorsLog } from '../utils/crash'
import { auditLog, type AuditEntry } from '../utils/audit'
import { telemetryService, type TelemetryEvent } from './telemetry.service'
import { logger } from '../utils/logger'

/** 渲染层 perf.ts 性能快照（结构性类型，主进程不依赖渲染层代码） */
export interface PerfEntryDto {
  id: string
  category: string
  label: string
  durationMs: number
  startedAt: number
}

export interface RenderTaskDto {
  startTime: number
  durationMs: number
  name?: string
}

export interface PerfSnapshot {
  ops: PerfEntryDto[]
  renderLongTasks: RenderTaskDto[]
  memory?: {
    available: boolean
    usedJsHeapMB: number | null
    totalJsHeapMB: number | null
    jsHeapLimitMB: number | null
    jsHeapUsedPct: number | null
    deviceMemoryGB: number | null
  } | null
}

export interface DiagnosticsReport {
  generatedAt: string
  app: { name: string; version: string; build: string; platform: string; arch: string; release: string }
  versions: { electron: string; node: string; chrome: string }
  paths: { userData: string; logs: string; audit: string; telemetry: string; errorsLog: string; crashDumps: string }
  disk: { path: string; freeBytes: number | null; freeGB: string | null }
  mainLog: string
  crash: ReturnType<typeof getCrashInfo> & { errorsLog: string }
  audit: AuditEntry[]
  telemetry: { enabled: boolean; events: TelemetryEvent[] }
  perf: PerfSnapshot | null
}

function getDiskFreeBytes(dir: string): number | null {
  try {
    const s = fs.statfsSync(dir)
    return s.bavail * s.bsize
  } catch {
    return null
  }
}

export class DiagnosticsService {
  private perfSnapshot: PerfSnapshot | null = null

  /** 渲染层经 IPC 上报性能快照 */
  reportPerf(snapshot: PerfSnapshot | null): void {
    this.perfSnapshot = snapshot
  }

  getPerfSnapshot(): PerfSnapshot | null {
    return this.perfSnapshot
  }

  /** 聚合诊断信息（主进程日志 + 崩溃 + 审计 + 遥测 + 性能快照 + 系统信息） */
  collect(): DiagnosticsReport {
    const userDataDir = getUserDataDir()
    const logDir = getLogDir()
    const crashInfo = getCrashInfo()
    const freeBytes = getDiskFreeBytes(userDataDir)

    const report: DiagnosticsReport = {
      generatedAt: new Date().toISOString(),
      app: {
        name: APP_CONFIG.APP_NAME,
        version: APP_CONFIG.VERSION.CURRENT,
        build: APP_CONFIG.VERSION.BUILD,
        platform: process.platform,
        arch: process.arch,
        release: process.getSystemVersion ? process.getSystemVersion() : '',
      },
      versions: {
        electron: process.versions.electron,
        node: process.versions.node,
        chrome: process.versions.chrome,
      },
      paths: {
        userData: userDataDir,
        logs: logDir,
        audit: auditLog.getPath(),
        telemetry: telemetryService.getPath(),
        errorsLog: getErrorsLogPath(),
        crashDumps: crashInfo.crashDumpsDir,
      },
      disk: {
        path: userDataDir,
        freeBytes,
        freeGB: freeBytes != null ? (freeBytes / 1024 / 1024 / 1024).toFixed(2) : null,
      },
      mainLog: readMainLog(logDir),
      crash: { ...crashInfo, errorsLog: readErrorsLog() },
      audit: auditLog.readEntries(),
      telemetry: { enabled: telemetryService.isEnabled(), events: telemetryService.readEvents() },
      perf: this.perfSnapshot,
    }
    return report
  }

  /**
   * 一键导出支持包：聚合信息 + 主日志 + 崩溃 + 审计 + 遥测打包 zip → 保存对话框。
   */
  async exportSupportPackage(win: BrowserWindow | null): Promise<{ ok: boolean; path?: string; error?: string }> {
    try {
      const report = this.collect()
      const AdmZip = (await import('adm-zip')).default
      const zip = new AdmZip()

      zip.addFile('diagnostics.json', Buffer.from(JSON.stringify(report, null, 2), 'utf-8'))
      zip.addFile('logs/app.log', Buffer.from(report.mainLog, 'utf-8'))
      zip.addFile('logs/errors.log', Buffer.from(report.crash.errorsLog, 'utf-8'))
      zip.addFile('audit/audit.jsonl', Buffer.from(auditLog.read(), 'utf-8'))
      zip.addFile('telemetry/telemetry.jsonl', Buffer.from(telemetryService.read(), 'utf-8'))

      const defaultName = `magiccommander-support-${APP_CONFIG.VERSION.CURRENT}-${Date.now()}.zip`
      const result = win
        ? await dialog.showSaveDialog(win, {
            title: '导出支持包',
            defaultPath: path.join(app.getPath('downloads'), defaultName),
            filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
          })
        : { canceled: true, filePath: '' }

      if (result.canceled || !result.filePath) {
        return { ok: false, error: 'canceled' }
      }
      fs.writeFileSync(result.filePath, zip.toBuffer())
      logger.info('[Diagnostics] Support package exported:', result.filePath)
      return { ok: true, path: result.filePath }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('[Diagnostics] Export support package failed:', message)
      return { ok: false, error: message }
    }
  }
}

function readMainLog(logDir: string): string {
  try {
    const file = path.join(logDir, 'app.log')
    if (!fs.existsSync(file)) return ''
    return fs.readFileSync(file, 'utf-8')
  } catch {
    return ''
  }
}

export const diagnosticsService = new DiagnosticsService()
