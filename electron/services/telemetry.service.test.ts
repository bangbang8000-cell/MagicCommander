/**
 * 47-d：本地遥测服务（本地化、脱敏、默认关闭、可配置、可导出）
 * - 默认关闭：未启用时 record 不落盘
 * - 启用后记录 JSON 行，且敏感信息脱敏
 * - read / readEvents / clear / exportTo
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { TelemetryService } from './telemetry.service'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-telemetry-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('TelemetryService', () => {
  it('默认关闭：未启用时 record 不落盘', () => {
    const svc = new TelemetryService(tmpDir)
    expect(svc.isEnabled()).toBe(false)
    svc.record('app.start', { version: '4.7.0' })
    expect(svc.read()).toBe('')
  })

  it('启用后记录 JSON 行', () => {
    const svc = new TelemetryService(tmpDir)
    svc.setEnabled(true)
    svc.record('app.start', { version: '4.7.0', platform: 'win32' })
    const events = svc.readEvents()
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('app.start')
    expect(events[0].version).toBe('4.7.0')
  })

  it('敏感信息脱敏（apiKey/token/sk- 不落盘）', () => {
    const svc = new TelemetryService(tmpDir)
    svc.setEnabled(true)
    svc.record('error', { message: 'apiKey=sk-abc1234567890 token=secret123' })
    const content = svc.read()
    expect(content).not.toContain('sk-abc1234567890')
    expect(content).not.toContain('secret123')
    expect(content).toContain('***')
  })

  it('clear 清空，exportTo 导出到目标文件', () => {
    const svc = new TelemetryService(tmpDir)
    svc.setEnabled(true)
    svc.record('app.start', { version: '4.7.0' })
    svc.record('app.quit', { uptimeMs: 100 })

    const dest = path.join(tmpDir, 'out.jsonl')
    svc.exportTo(dest)
    expect(fs.existsSync(dest)).toBe(true)
    expect(fs.readFileSync(dest, 'utf-8')).toContain('app.start')

    svc.clear()
    expect(svc.read()).toBe('')
  })
})
