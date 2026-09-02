/**
 * 47-b：轻量审计日志（audit.jsonl，脱敏落盘）
 * - log 写入 JSON 行、detail 脱敏
 * - read/readEntries 解析（跳过损坏行）
 * - 可关闭（setEnabled(false) 后不再写入）
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { AuditLog } from './audit'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-audit-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('AuditLog', () => {
  it('写入 JSON 行并读取', () => {
    const audit = new AuditLog(tmpDir)
    audit.log('project.create', 'demo-project')
    audit.log('project.render', 'p1,p2', 1234)

    const entries = audit.readEntries()
    expect(entries).toHaveLength(2)
    expect(entries[0].action).toBe('project.create')
    expect(entries[0].detail).toBe('demo-project')
    expect(entries[1].durationMs).toBe(1234)
  })

  it('detail 自动脱敏（apiKey/token 不落盘）', () => {
    const audit = new AuditLog(tmpDir)
    audit.log('project.save', 'path=apiKey=sk-abcdef123456 token=secret-token')
    const content = audit.read()
    expect(content).not.toContain('sk-abcdef123456')
    expect(content).not.toContain('secret-token')
    expect(content).toContain('***')
  })

  it('关闭后不再写入', () => {
    const audit = new AuditLog(tmpDir)
    audit.setEnabled(false)
    audit.log('project.create', 'x')
    expect(audit.readEntries()).toHaveLength(0)
  })

  it('readEntries 跳过损坏行', () => {
    const file = path.join(tmpDir, 'audit.jsonl')
    fs.writeFileSync(file, '{"ts":"2026-01-01","action":"a"}\nnot-json\n{"ts":"2026-01-02","action":"b"}\n')
    const audit = new AuditLog(tmpDir)
    const entries = audit.readEntries()
    expect(entries).toHaveLength(2)
  })

  it('缺失文件时 read 为空不抛错', () => {
    const audit = new AuditLog(tmpDir)
    expect(audit.read()).toBe('')
    expect(audit.readEntries()).toEqual([])
  })
})
