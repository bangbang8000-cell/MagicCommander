/**
 * 4.2.0-42-d（F2-4）：Excel 大参数表数据准备 Web Worker
 *
 * 将 normalizeSheetData / computeSheetStats 移入 Worker，避免万行参数表
 * （总行数 > EXCEL_PREP_THRESHOLD）的标准化与派生统计阻塞主线程。
 * 通信协议（对齐 excelPrepClient.ts）：
 *   主线程 → Worker: { type: 'prepare', payload: { sheets: RawExcelSheet[], token } }
 *   Worker → 主线程: { type: 'prepared', payload: { sheets: PreparedSheet[], stats: SheetStats, token } }
 *                    { type: 'error',   payload: { message: string, token } }   // token 透传
 */
import { normalizeSheetData, computeSheetStats, type ExcelPrepRequest, type ExcelPrepResponse } from './excelPrepClient'

interface ExcelPrepWorkerScope {
  onmessage: ((e: MessageEvent<ExcelPrepRequest>) => void) | null
  postMessage: (msg: ExcelPrepResponse) => void
}

const ctx = self as unknown as ExcelPrepWorkerScope

ctx.onmessage = (e: MessageEvent<ExcelPrepRequest>) => {
  const { sheets, token } = e.data.payload
  try {
    const normalized = normalizeSheetData(sheets)
    const stats = computeSheetStats(normalized)
    ctx.postMessage({ type: 'prepared', payload: { sheets: normalized, stats, token } })
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      payload: { message: err instanceof Error ? err.message : String(err), token },
    })
  }
}
