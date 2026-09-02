/**
 * 47-b：轻量审计日志（MC 现无审计，新增主进程关键操作审计）
 * 项目新建/打开/保存/渲染/导出/删除等关键操作写 userData/audit/audit.jsonl，
 * 经 redactForLog 脱敏；失败静默，不阻断主流程。
 */
import * as fs from 'fs'
import * as path from 'path'
import { getUserDataDir } from '../config'
import { redactForLog } from './redact'

export interface AuditEntry {
  ts: string
  action: string
  detail?: string
  durationMs?: number
}

export class AuditLog {
  private file: string
  private enabled = true

  constructor(dir: string = path.join(getUserDataDir(), 'audit')) {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch {
      /* ignore */
    }
    this.file = path.join(dir, 'audit.jsonl')
  }

  getPath(): string {
    return this.file
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled === true
  }

  /**
   * 记录一条审计事件。detail 经脱敏后落盘；失败静默忽略。
   */
  log(action: string, detail?: string, durationMs?: number): void {
    if (!this.enabled) return
    const entry: AuditEntry = { ts: new Date().toISOString(), action }
    if (detail) entry.detail = redactForLog(detail)
    if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
      entry.durationMs = Math.round(durationMs)
    }
    try {
      fs.appendFileSync(this.file, JSON.stringify(entry) + '\n', 'utf-8')
    } catch {
      /* ignore */
    }
  }

  /** 读取审计原文（缺失/读取失败返回空字符串） */
  read(): string {
    try {
      if (!fs.existsSync(this.file)) return ''
      return fs.readFileSync(this.file, 'utf-8')
    } catch {
      return ''
    }
  }

  /** 解析为审计条目数组（跳过损坏行） */
  readEntries(): AuditEntry[] {
    const content = this.read()
    if (!content) return []
    const entries: AuditEntry[] = []
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        entries.push(JSON.parse(trimmed) as AuditEntry)
      } catch {
        /* 跳过损坏行 */
      }
    }
    return entries
  }
}

export const auditLog = new AuditLog()

/** 便捷方法：关键操作审计（detail 自动脱敏） */
export function audit(action: string, detail?: string, durationMs?: number): void {
  auditLog.log(action, detail, durationMs)
}
