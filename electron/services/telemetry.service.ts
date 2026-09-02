/**
 * 47-d：本地遥测服务（本地化、脱敏、默认关闭、可配置、可导出）
 * - 启用时本地采集事件（启动/版本/崩溃/关键动作耗时/错误）写 userData/telemetry/telemetry.jsonl
 * - 仅本地落盘、不联网上传；所有字段经 redactForLog 脱敏
 * - 提供读取 / 导出 / 清空接口供 diag:* IPC 与设置面板使用
 */
import * as fs from 'fs'
import * as path from 'path'
import { getUserDataDir } from '../config'
import { redactForLog } from '../utils/redact'

export interface TelemetryEvent {
  ts: string
  type: string
  [key: string]: unknown
}

export class TelemetryService {
  private file: string
  private enabled = false

  constructor(dir: string = path.join(getUserDataDir(), 'telemetry')) {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch {
      /* ignore */
    }
    this.file = path.join(dir, 'telemetry.jsonl')
  }

  /** 遥测开关（默认关闭，需用户在设置中显式开启） */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled === true
  }

  isEnabled(): boolean {
    return this.enabled
  }

  getPath(): string {
    return this.file
  }

  /**
   * 记录一条遥测事件。仅在启用时落盘；data 整体序列化后脱敏。
   * 失败静默忽略，不阻断应用主流程。
   */
  record(type: string, data: Record<string, unknown> = {}): void {
    if (!this.enabled) return
    const event: TelemetryEvent = { ts: new Date().toISOString(), type, ...data }
    const line = redactForLog(event)
    try {
      fs.appendFileSync(this.file, line + '\n', 'utf-8')
    } catch {
      /* ignore */
    }
  }

  /** 读取遥测原文（缺失/读取失败返回空字符串） */
  read(): string {
    try {
      if (!fs.existsSync(this.file)) return ''
      return fs.readFileSync(this.file, 'utf-8')
    } catch {
      return ''
    }
  }

  /** 解析为事件数组（跳过损坏行） */
  readEvents(): TelemetryEvent[] {
    const content = this.read()
    if (!content) return []
    const events: TelemetryEvent[] = []
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        events.push(JSON.parse(trimmed) as TelemetryEvent)
      } catch {
        /* 跳过损坏行 */
      }
    }
    return events
  }

  /** 清空遥测 */
  clear(): void {
    try {
      fs.writeFileSync(this.file, '')
    } catch {
      /* ignore */
    }
  }

  /** 导出遥测到目标文件（复制原文） */
  exportTo(dest: string): void {
    try {
      fs.copyFileSync(this.file, dest)
    } catch {
      /* ignore */
    }
  }
}

export const telemetryService = new TelemetryService()
