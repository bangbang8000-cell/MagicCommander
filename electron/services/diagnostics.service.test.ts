/**
 * 47-b：诊断中心聚合 + 一键导出支持包
 * - collect 聚合系统/版本/磁盘/主日志/崩溃/审计/遥测/性能快照
 * - reportPerf 存储渲染层性能快照，collect 一并返回
 * - exportSupportPackage 用 adm-zip 打包 → 保存对话框
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { dialog, app } from 'electron'
import { diagnosticsService } from './diagnostics.service'
import { auditLog } from '../utils/audit'
import { telemetryService } from './telemetry.service'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-diag-'))
  ;(app as unknown as { getPath: (n: string) => string }).getPath = (name: string) =>
    name === 'downloads' ? tmpDir : `/mock/${name}`
  // vitest 运行于纯 Node：补齐 Electron 主进程才有的版本字段
  ;(process.versions as Record<string, string>).electron = '28.0.0'
  ;(process as unknown as { resourcesPath: string }).resourcesPath = '/mock/resources'
  vi.spyOn(dialog, 'showSaveDialog').mockResolvedValue({
    canceled: false,
    filePath: path.join(tmpDir, 'support.zip'),
  } as never)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('DiagnosticsService.collect', () => {
  it('返回完整聚合报告（系统/版本/磁盘/审计/遥测/性能快照）', () => {
    auditLog.log('project.create', 'demo-project')
    telemetryService.setEnabled(true)
    telemetryService.record('app.start', { version: '4.7.0' })

    diagnosticsService.reportPerf({
      ops: [{ id: 'p1', category: 'render', label: '渲染', durationMs: 120, startedAt: 0 }],
      renderLongTasks: [],
      memory: {
        available: true,
        usedJsHeapMB: 10,
        totalJsHeapMB: 100,
        jsHeapLimitMB: 500,
        jsHeapUsedPct: 2,
        deviceMemoryGB: 8,
      },
    })

    const report = diagnosticsService.collect()
    expect(report.app.name).toBe('MagicCommander')
    expect(report.app.platform).toBeTruthy()
    expect(report.versions.electron).toBeTruthy()
    expect(report.audit.some((e) => e.action === 'project.create')).toBe(true)
    expect(report.telemetry.enabled).toBe(true)
    expect(report.telemetry.events.length).toBeGreaterThan(0)
    expect(report.perf?.ops).toHaveLength(1)
    expect(report.perf?.memory?.available).toBe(true)
    expect(typeof report.mainLog).toBe('string')
    expect(typeof report.disk.freeGB).toBe('string')
  })
})

describe('DiagnosticsService.exportSupportPackage', () => {
  it('打包 zip 并写入保存路径（含 diagnostics.json/app.log/audit/telemetry）', async () => {
    auditLog.log('project.render', 'p1')
    telemetryService.setEnabled(true)
    telemetryService.record('app.quit', { uptimeMs: 5 })

    const res = await diagnosticsService.exportSupportPackage({} as never)
    expect(res.ok).toBe(true)
    expect(res.path).toBeTruthy()
    expect(fs.existsSync(res.path!)).toBe(true)

    const buf = fs.readFileSync(res.path!)
    expect(buf.subarray(0, 2).toString()).toBe('PK')
    expect(buf.toString('utf-8')).toContain('diagnostics.json')
  })
})
