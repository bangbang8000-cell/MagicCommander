/**
 * 4.4 F4-2 批量操作增强：批量渲染 / 批量导出 / 批量参数应用
 *
 * - 多项目并行（受控并发池）+ 进度 + 失败汇总（按项目粒度）
 * - 纯函数 runBatchJobs / computeBatchStats 可独立单测；store 默认适配器走既有 IPC
 * - 批量编辑（参数批量应用）：把源项目 Excel 参数批量写入目标项目（复用既有 readExcel/writeExcel）
 */
import { create } from 'zustand'

export type BatchItemStatus = 'pending' | 'running' | 'done' | 'failed'
export type BatchMode = 'render' | 'export' | 'edit'

export interface BatchItem {
  id: string
  name: string
  status: BatchItemStatus
  message?: string
}

export interface BatchProject {
  id: string | number
  name: string
}

export interface BatchJob<T = unknown> {
  id: string
  name?: string
  run: (signal?: AbortSignal) => Promise<T>
}

export interface BatchRunOptions {
  concurrency?: number
  signal?: AbortSignal
  onItemStart?: (id: string) => void
  onItemDone?: (id: string, result: unknown) => void
  onItemError?: (id: string, error: unknown) => void
}

export interface BatchRunResult {
  total: number
  done: number
  failed: number
  errors: Array<{ id: string; message: string }>
  results: Record<string, unknown>
}

export const BATCH_CONCURRENCY = 2

/** 受控并发池执行批量任务；中断信号下跳过未启动任务，已进行中的任务完成后不再计入结果 */
export async function runBatchJobs<T>(jobs: BatchJob<T>[], options: BatchRunOptions = {}): Promise<BatchRunResult> {
  const { concurrency = BATCH_CONCURRENCY, signal, onItemStart, onItemDone, onItemError } = options
  const results: Record<string, unknown> = {}
  const errors: Array<{ id: string; message: string }> = []
  let cursor = 0

  const worker = async (): Promise<void> => {
    for (;;) {
      if (signal?.aborted) return
      const index = cursor++
      if (index >= jobs.length) return
      const job = jobs[index]
      onItemStart?.(job.id)
      try {
        const result = await job.run(signal)
        if (!signal?.aborted) {
          results[job.id] = result
          onItemDone?.(job.id, result)
        }
      } catch (err) {
        if (!signal?.aborted) {
          const message = err instanceof Error ? err.message : String(err)
          errors.push({ id: job.id, message })
          onItemError?.(job.id, err)
        }
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, jobs.length)) }, () => worker())
  await Promise.all(workers)
  return { total: jobs.length, done: Object.keys(results).length, failed: errors.length, errors, results }
}

/** 按项目粒度统计进度 / 成功 / 失败 / 运行中 / 待执行 */
export function computeBatchStats(items: BatchItem[]): {
  progress: number
  done: number
  failed: number
  running: number
  pending: number
} {
  let done = 0
  let failed = 0
  let running = 0
  let pending = 0
  for (const item of items) {
    if (item.status === 'done') done++
    else if (item.status === 'failed') failed++
    else if (item.status === 'running') running++
    else pending++
  }
  const progress = items.length ? Math.round(((done + failed) / items.length) * 100) : 0
  return { progress, done, failed, running, pending }
}

/** 批量编辑（参数批量应用）IO 抽象（测试注入 mock；运行时用 window.electron.project） */
export interface BatchEditIo {
  listExcel: (id: string | number) => Promise<Array<{ path: string }>>
  readExcel: (
    id: string | number,
    path: string,
    projectName?: string,
  ) => Promise<Array<{ name: string; headers: string[]; rows: Record<string, unknown>[] }>>
  writeExcel: (
    id: string | number,
    path: string,
    sheets: Array<{ name: string; headers: string[]; rows: Record<string, unknown>[] }>,
    projectName?: string,
  ) => Promise<void>
}

/** 运行时默认 IO（window.electron.project） */
export function defaultBatchEditIo(): BatchEditIo {
  const p = typeof window !== 'undefined' ? window.electron?.project : undefined
  const fail = async (): Promise<never> => {
    throw new Error('项目 IPC 不可用')
  }
  if (!p) {
    return { listExcel: fail, readExcel: fail, writeExcel: fail }
  }
  return {
    listExcel: (id) => p.listFiles(String(id), 'excel') as Promise<Array<{ path: string }>>,
    readExcel: (id, path, name) => p.readExcel(Number(id), path, name),
    writeExcel: (id, path, sheets, name) => p.writeExcel(Number(id), path, sheets, name),
  }
}

export interface BatchStoreState {
  items: BatchItem[]
  running: boolean
  mode: BatchMode | null
  progress: number
  summary: { total: number; done: number; failed: number } | null
  resultPaths: Record<string, string>
  abortController: AbortController | null
  reset: () => void
  stop: () => void
  runBatchRender: (
    projects: BatchProject[],
    options?: { renderOne?: (project: BatchProject, signal?: AbortSignal) => Promise<unknown>; concurrency?: number },
  ) => Promise<void>
  runBatchExport: (
    projects: BatchProject[],
    options?: { exportOne?: (project: BatchProject, signal?: AbortSignal) => Promise<string>; concurrency?: number },
  ) => Promise<void>
  runBatchEdit: (source: BatchProject, targets: BatchProject[], io?: BatchEditIo) => Promise<void>
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err))

export const useBatchStore = create<BatchStoreState>()((set, get) => {
  const execute = async (mode: BatchMode, jobs: BatchJob[]): Promise<void> => {
    if (jobs.length === 0) return
    const controller = new AbortController()
    const items: BatchItem[] = jobs.map((job) => ({ id: job.id, name: job.name ?? job.id, status: 'pending' }))
    set({
      items,
      running: true,
      mode,
      progress: 0,
      summary: { total: jobs.length, done: 0, failed: 0 },
      resultPaths: {},
      abortController: controller,
    })

    const result = await runBatchJobs(jobs, {
      signal: controller.signal,
      onItemStart: (id) =>
        set((s) => ({
          items: s.items.map((i): BatchItem => (i.id === id ? { ...i, status: 'running' } : i)),
        })),
      onItemDone: (id, r) =>
        set((s) => {
          const items = s.items.map((i): BatchItem =>
            i.id === id ? { ...i, status: 'done' as BatchItemStatus, message: undefined } : i,
          )
          const stats = computeBatchStats(items)
          const path = typeof r === 'string' ? r : undefined
          return {
            items,
            progress: stats.progress,
            summary: { total: stats.done + stats.failed, done: stats.done, failed: stats.failed },
            resultPaths: path ? { ...s.resultPaths, [id]: path } : s.resultPaths,
          }
        }),
      onItemError: (id, e) =>
        set((s) => {
          const items = s.items.map((i): BatchItem =>
            i.id === id ? { ...i, status: 'failed' as BatchItemStatus, message: errMsg(e) } : i,
          )
          const stats = computeBatchStats(items)
          return {
            items,
            progress: stats.progress,
            summary: { total: stats.done + stats.failed, done: stats.done, failed: stats.failed },
          }
        }),
    })

    set({
      running: false,
      progress: result.total ? Math.round(((result.done + result.failed) / result.total) * 100) : 0,
      summary: { total: result.total, done: result.done, failed: result.failed },
      abortController: null,
    })
  }

  return {
    items: [],
    running: false,
    mode: null,
    progress: 0,
    summary: null,
    resultPaths: {},
    abortController: null,

    reset: () =>
      set({
        items: [],
        running: false,
        mode: null,
        progress: 0,
        summary: null,
        resultPaths: {},
        abortController: null,
      }),

    stop: () => {
      get().abortController?.abort()
    },

    runBatchRender: async (projects, options) => {
      const renderOne = options?.renderOne ?? (async (project) => window.electron.render.project([String(project.id)]))
      const jobs: BatchJob[] = projects.map((project) => ({
        id: String(project.id),
        name: project.name,
        run: (signal?: AbortSignal) => renderOne(project, signal),
      }))
      await execute('render', jobs)
    },

    runBatchExport: async (projects, options) => {
      const exportOne = options?.exportOne ?? (async (project) => window.electron.output.export(project.name, 'zip'))
      const jobs: BatchJob[] = projects.map((project) => ({
        id: String(project.id),
        name: project.name,
        run: (signal?: AbortSignal) => exportOne(project, signal),
      }))
      await execute('export', jobs)
    },

    runBatchEdit: async (source, targets, io) => {
      const editIo = io ?? defaultBatchEditIo()
      const files = await editIo.listExcel(source.id)
      const sourceData: Array<{
        path: string
        sheets: Array<{ name: string; headers: string[]; rows: Record<string, unknown>[] }>
      }> = []
      for (const file of files) {
        try {
          sourceData.push({ path: file.path, sheets: await editIo.readExcel(source.id, file.path, source.name) })
        } catch {
          // 单个文件读取失败则跳过该文件（不阻塞整体批量）
        }
      }
      const jobs = targets.map((target) => ({
        id: String(target.id),
        name: target.name,
        run: async () => {
          for (const item of sourceData) {
            await editIo.writeExcel(target.id, item.path, item.sheets, target.name)
          }
        },
      }))
      await execute('edit', jobs)
    },
  }
})
