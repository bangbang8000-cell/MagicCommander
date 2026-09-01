/**
 * 4.2.0-42-d（F2-4 / S-5）：Web Worker 大参数表数据准备 单测（TDD）
 * - W-1 normalizeSheetData：原始 sheet（name/headers/columns/rows）→ 显示就绪 SheetData（缺省补全）
 * - W-2 computeSheetStats：行数/列数统计
 * - W-3 小数据（≤ 阈值）走同步路径（usedWorker=false），零通信开销
 * - W-4 大数据 + Worker 可用 → 走 Worker 路径（usedWorker=true），token 透传丢弃过时结果
 * - W-5 Worker 报错/不可用 → 回退同步（usedWorker=false），结果仍正确
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  normalizeSheetData,
  computeSheetStats,
  prepareExcelSheets,
  resetExcelPrepWorker,
  EXCEL_PREP_THRESHOLD,
  type RawExcelSheet,
} from '@/workers/excelPrepClient'

const rawSheets: RawExcelSheet[] = [
  { name: '参数表', headers: ['参数名', '参数值'], rows: [{ 参数名: 'a', 参数值: '1' }] },
  { name: '设备表', columns: ['设备名'], rows: [{ 设备名: 'SW-1' }] },
]

beforeEach(() => {
  vi.unstubAllGlobals()
  resetExcelPrepWorker()
})

describe('normalizeSheetData（W-1 数据标准化）', () => {
  it('缺省 name/headers（兼容 columns）与 rows 补全', () => {
    const out = normalizeSheetData(rawSheets)
    expect(out).toHaveLength(2)
    expect(out[0].name).toBe('参数表')
    expect(out[0].headers).toEqual(['参数名', '参数值'])
    expect(out[1].name).toBe('设备表')
    expect(out[1].headers).toEqual(['设备名'])
    expect(out[1].rows[0].设备名).toBe('SW-1')
  })

  it('空输入/空 rows 时兜底为默认 Sheet1 / 空表', () => {
    const out = normalizeSheetData([{ rows: [] }])
    expect(out[0].name).toBe('Sheet1')
    expect(out[0].headers).toEqual([])
    expect(out[0].rows).toEqual([])
    expect(normalizeSheetData([])).toEqual([])
  })
})

describe('computeSheetStats（W-2 统计）', () => {
  it('汇总总行数与最大列数', () => {
    const stats = computeSheetStats(normalizeSheetData(rawSheets))
    expect(stats.rowCount).toBe(2)
    expect(stats.columnCount).toBe(2)
  })

  it('空数据统计为零', () => {
    const stats = computeSheetStats([])
    expect(stats.rowCount).toBe(0)
    expect(stats.columnCount).toBe(0)
  })
})

describe('prepareExcelSheets（W-3 小数据同步路径）', () => {
  it('总行数 ≤ 阈值且无 Worker 时同步完成（usedWorker=false）', async () => {
    const res = await prepareExcelSheets(rawSheets)
    expect(res.usedWorker).toBe(false)
    expect(res.sheets).toHaveLength(2)
    expect(res.stats.rowCount).toBe(2)
  })

  it('总行数 ≤ 阈值时即使 Worker 可用也走同步', async () => {
    class MockWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null
      postMessage(): void {
        throw new Error('不应调用 Worker')
      }
      terminate(): void {}
    }
    vi.stubGlobal('Worker', MockWorker)
    const res = await prepareExcelSheets(rawSheets)
    expect(res.usedWorker).toBe(false)
    vi.unstubAllGlobals()
  })
})

describe('prepareExcelSheets（W-4 大数据 Worker 路径）', () => {
  function bigSheets(rows: number): RawExcelSheet[] {
    const data: RawExcelSheet[] = [{ name: '大参数表', headers: ['k', 'v'], rows: [] }]
    for (let i = 0; i < rows; i++) data[0].rows.push({ k: `key_${i}`, v: i })
    return data
  }

  it('超过阈值且 Worker 可用 → usedWorker=true，token 透传', async () => {
    let posted: { type: string; payload: { token: number } } | null = null
    let workerMessageHandler: ((e: { data: unknown }) => void) | null = null
    class MockWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null
      constructor() {
        workerMessageHandler = (e: { data: unknown }) => {
          this.onmessage?.(e)
        }
      }
      postMessage(msg: { type: string; payload: { token: number } }): void {
        posted = msg
      }
      terminate(): void {}
    }
    vi.stubGlobal('Worker', MockWorker)

    const p = prepareExcelSheets(bigSheets(EXCEL_PREP_THRESHOLD + 100))
    // 模拟 worker 回传（token 透传）
    await new Promise((r) => setTimeout(r, 0))
    expect(posted).not.toBeNull()
    expect(posted!.type).toBe('prepare')
    const token = posted!.payload.token
    workerMessageHandler!({
      data: {
        type: 'prepared',
        payload: {
          sheets: normalizeSheetData(bigSheets(EXCEL_PREP_THRESHOLD + 100)),
          stats: { rowCount: EXCEL_PREP_THRESHOLD + 100, columnCount: 2 },
          token,
        },
      },
    })
    const res = await p
    expect(res.usedWorker).toBe(true)
    expect(res.stats.rowCount).toBe(EXCEL_PREP_THRESHOLD + 100)
    vi.unstubAllGlobals()
  })
})

describe('prepareExcelSheets（W-5 错误/不可用回退）', () => {
  function bigSheets(rows: number): RawExcelSheet[] {
    const data: RawExcelSheet[] = [{ name: '大参数表', headers: ['k', 'v'], rows: [] }]
    for (let i = 0; i < rows; i++) data[0].rows.push({ k: `key_${i}`, v: i })
    return data
  }

  it('Worker 报错 → 回退同步且结果正确', async () => {
    let workerMessageHandler: ((e: { data: unknown }) => void) | null = null
    class MockWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null
      constructor() {
        workerMessageHandler = (e: { data: unknown }) => {
          this.onmessage?.(e)
        }
      }
      postMessage(msg: { type: string; payload: { token: number } }): void {
        // 立即回传错误
        workerMessageHandler!({
          data: { type: 'error', payload: { message: 'worker boom', token: msg.payload.token } },
        })
      }
      terminate(): void {}
    }
    vi.stubGlobal('Worker', MockWorker)
    const res = await prepareExcelSheets(bigSheets(EXCEL_PREP_THRESHOLD + 50))
    expect(res.usedWorker).toBe(false)
    expect(res.sheets[0].rows).toHaveLength(EXCEL_PREP_THRESHOLD + 50)
    vi.unstubAllGlobals()
  })

  it('非 worker 环境（Worker 未定义）→ 同步回退', async () => {
    vi.stubGlobal('Worker', undefined)
    const res = await prepareExcelSheets(bigSheets(EXCEL_PREP_THRESHOLD + 10))
    expect(res.usedWorker).toBe(false)
    expect(res.stats.rowCount).toBe(EXCEL_PREP_THRESHOLD + 10)
    vi.unstubAllGlobals()
  })
})
