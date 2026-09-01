/**
 * 4.2.0-42-d（F2-4）：Excel 大参数表数据准备 —— Web Worker 客户端桥接
 *
 * 热点：ExcelViewer 打开万行参数表时，原始 sheet 数据标准化（headers/rows 补全）
 * 与派生统计为 O(行数×列数) 计算，阻塞主线程。
 * - 总行数 ≤ EXCEL_PREP_THRESHOLD：同步计算，零通信开销
 * - 总行数 > 阈值 且 Worker 可用：移入 excelPrep.worker.ts，主线程不阻塞
 * - token 透传丢弃过时结果；Worker 报错/超时/不可用 → 同步回退（结果仍正确）
 *
 * 通信协议：
 *   主线程 → Worker: { type: 'prepare', payload: { sheets: RawExcelSheet[], token } }
 *   Worker → 主线程: { type: 'prepared', payload: { sheets, stats, token } }
 *                    { type: 'error', payload: { message, token } }（token 透传）
 */

export interface RawExcelSheet {
  name?: string
  headers?: string[]
  columns?: string[]
  rows: Record<string, unknown>[]
}

export interface PreparedSheet {
  name: string
  headers: string[]
  rows: Record<string, unknown>[]
}

export interface SheetStats {
  rowCount: number
  columnCount: number
}

export interface ExcelPrepResult {
  sheets: PreparedSheet[]
  stats: SheetStats
  usedWorker: boolean
}

/** 超过此总行数阈值自动走 Worker */
export const EXCEL_PREP_THRESHOLD = 2000
/** Worker 响应超时（毫秒），超时回退同步 */
const WORKER_TIMEOUT_MS = 8000

export interface ExcelPrepRequest {
  type: 'prepare'
  payload: { sheets: RawExcelSheet[]; token: number }
}

export type ExcelPrepResponse =
  | { type: 'prepared'; payload: { sheets: PreparedSheet[]; stats: SheetStats; token: number } }
  | { type: 'error'; payload: { message: string; token: number } }

/** 纯函数：原始 sheet → 显示就绪 SheetData（缺省 name/headers/rows 补全；兼容 columns 别名） */
export function normalizeSheetData(sheets: RawExcelSheet[]): PreparedSheet[] {
  return sheets.map((s) => ({
    name: s.name || 'Sheet1',
    headers: Array.isArray(s.headers) ? s.headers : Array.isArray(s.columns) ? s.columns : [],
    rows: Array.isArray(s.rows) ? s.rows : [],
  }))
}

/** 纯函数：派生统计（总行数 + 最大列数），供虚拟列表行数与列宽参考 */
export function computeSheetStats(sheets: PreparedSheet[]): SheetStats {
  let rowCount = 0
  let columnCount = 0
  for (const s of sheets) {
    rowCount += s.rows.length
    columnCount = Math.max(columnCount, s.headers.length)
  }
  return { rowCount, columnCount }
}

function totalRows(sheets: RawExcelSheet[]): number {
  let n = 0
  for (const s of sheets) n += Array.isArray(s.rows) ? s.rows.length : 0
  return n
}

function resolveSync(sheets: RawExcelSheet[]): ExcelPrepResult {
  const normalized = normalizeSheetData(sheets)
  return { sheets: normalized, stats: computeSheetStats(normalized), usedWorker: false }
}

function workerAvailable(): boolean {
  return typeof Worker !== 'undefined'
}

/** 实例复用：同一次会话内复用同一 Worker，避免反复新建/销毁 */
let sharedWorker: Worker | null = null
let seq = 0

/** 重置共享 Worker 实例（测试隔离/会话清理用） */
export function resetExcelPrepWorker(): void {
  if (sharedWorker) {
    try {
      sharedWorker.terminate()
    } catch {
      // ignore
    }
  }
  sharedWorker = null
}

export async function prepareExcelSheets(sheets: RawExcelSheet[]): Promise<ExcelPrepResult> {
  if (totalRows(sheets) <= EXCEL_PREP_THRESHOLD || !workerAvailable()) {
    return resolveSync(sheets)
  }

  const token = ++seq
  return new Promise<ExcelPrepResult>((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const finish = (r: ExcelPrepResult): void => {
      if (settled) return
      settled = true
      if (timer != null) globalThis.clearTimeout(timer)
      resolve(r)
    }

    const ensureWorker = (onMessage: (e: MessageEvent<ExcelPrepResponse>) => void): Worker | null => {
      if (sharedWorker) {
        sharedWorker.onmessage = onMessage
        return sharedWorker
      }
      let worker: Worker
      try {
        worker = new Worker(new URL('./excelPrep.worker.ts', import.meta.url), { type: 'module' })
      } catch {
        return null
      }
      worker.onmessage = onMessage
      sharedWorker = worker
      return worker
    }

    const worker = ensureWorker((e) => {
      const msg = e.data
      // 仅接受最新请求的结果；token 不匹配则丢弃过时响应
      if (!msg || msg.payload.token !== token) return
      if (msg.type === 'prepared') {
        finish({ sheets: msg.payload.sheets, stats: msg.payload.stats, usedWorker: true })
      } else {
        finish(resolveSync(sheets))
      }
    })

    if (!worker) {
      finish(resolveSync(sheets))
      return
    }

    timer = globalThis.setTimeout(() => finish(resolveSync(sheets)), WORKER_TIMEOUT_MS)
    worker.postMessage({ type: 'prepare', payload: { sheets, token } } satisfies ExcelPrepRequest)
  })
}
