/**
 * 4.4 F4-2（测试计划 E-2）：批量操作（批量渲染 / 批量导出 / 批量编辑）
 *
 * 覆盖：
 * - runBatchJobs：多项目执行 / 失败汇总 / 受控并发 / 中断跳过
 * - computeBatchStats：进度与统计
 * - useBatchStore.runBatchRender / runBatchExport / runBatchEdit（注入适配器）
 * - 失败汇总可见（summary + items 状态）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runBatchJobs, computeBatchStats, useBatchStore, BATCH_CONCURRENCY, type BatchJob } from '@/stores/batch.store'

describe('E-2 runBatchJobs 批量执行', () => {
  it('全部成功：done = total，results 记录，onItemDone 按项回调', async () => {
    const onItemStart = vi.fn()
    const onItemDone = vi.fn()
    const jobs: BatchJob[] = [
      { id: '1', run: async () => 'ok-1' },
      { id: '2', run: async () => 'ok-2' },
      { id: '3', run: async () => 'ok-3' },
    ]
    const result = await runBatchJobs(jobs, { onItemStart, onItemDone })
    expect(result.total).toBe(3)
    expect(result.done).toBe(3)
    expect(result.failed).toBe(0)
    expect(result.errors).toEqual([])
    expect(result.results).toEqual({ 1: 'ok-1', 2: 'ok-2', 3: 'ok-3' })
    expect(onItemStart).toHaveBeenCalledTimes(3)
    expect(onItemDone).toHaveBeenCalledTimes(3)
  })

  it('部分失败：failed 计数 + 失败汇总错误信息', async () => {
    const onItemError = vi.fn()
    const jobs: BatchJob[] = [
      { id: '1', run: async () => 'ok' },
      { id: '2', run: async () => Promise.reject(new Error('渲染失败')) },
      { id: '3', run: async () => Promise.reject(new Error('数据缺失')) },
    ]
    const result = await runBatchJobs(jobs, { onItemError })
    expect(result.done).toBe(1)
    expect(result.failed).toBe(2)
    expect(result.errors).toEqual([
      { id: '2', message: '渲染失败' },
      { id: '3', message: '数据缺失' },
    ])
    expect(onItemError).toHaveBeenCalledTimes(2)
  })

  it('受控并发：并发数不超过配置值', async () => {
    let active = 0
    let maxActive = 0
    const jobs: BatchJob[] = Array.from({ length: 6 }, (_, i) => ({
      id: String(i + 1),
      run: async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 10))
        active--
      },
    }))
    const result = await runBatchJobs(jobs, { concurrency: BATCH_CONCURRENCY })
    expect(result.done).toBe(6)
    expect(maxActive).toBeLessThanOrEqual(BATCH_CONCURRENCY)
  })

  it('中断：未启动任务不再执行，已完成仍统计', async () => {
    const controller = new AbortController()
    const onItemDone = vi.fn()
    const jobs: BatchJob[] = [
      { id: '1', run: async () => 'ok' },
      { id: '2', run: async () => new Promise((r) => setTimeout(() => r('ok2'), 5)) },
      { id: '3', run: async () => 'ok3' },
    ]
    const promise = runBatchJobs(jobs, { signal: controller.signal, onItemDone, concurrency: 1 })
    controller.abort()
    const result = await promise
    expect(result.done).toBeLessThanOrEqual(2)
    expect(result.failed).toBe(0)
  })
})

describe('E-2 computeBatchStats 进度统计', () => {
  it('按项目状态计算进度 / 成功 / 失败', () => {
    const stats = computeBatchStats([
      { id: '1', name: 'a', status: 'done' },
      { id: '2', name: 'b', status: 'failed' },
      { id: '3', name: 'c', status: 'running' },
      { id: '4', name: 'd', status: 'pending' },
    ])
    expect(stats.done).toBe(1)
    expect(stats.failed).toBe(1)
    expect(stats.running).toBe(1)
    expect(stats.pending).toBe(1)
    expect(stats.progress).toBe(50)
  })

  it('空列表进度为 0', () => {
    expect(computeBatchStats([]).progress).toBe(0)
  })
})

describe('E-2 useBatchStore 批量渲染 / 导出 / 编辑', () => {
  beforeEach(() => {
    useBatchStore.getState().reset()
  })

  it('批量渲染：全部成功 → items done、summary 正确、progress 100', async () => {
    const renderOne = vi.fn(async () => undefined)
    await useBatchStore.getState().runBatchRender(
      [
        { id: 1, name: 'p1' },
        { id: 2, name: 'p2' },
      ],
      { renderOne },
    )
    const state = useBatchStore.getState()
    expect(renderOne).toHaveBeenCalledTimes(2)
    expect(state.running).toBe(false)
    expect(state.items.every((i) => i.status === 'done')).toBe(true)
    expect(state.summary).toEqual({ total: 2, done: 2, failed: 0 })
    expect(state.progress).toBe(100)
  })

  it('批量渲染：部分失败 → 失败汇总可见', async () => {
    const renderOne = vi.fn(async (project: { id: string | number }) => {
      if (String(project.id) === '2') throw new Error('模板错误')
    })
    await useBatchStore.getState().runBatchRender(
      [
        { id: 1, name: 'p1' },
        { id: 2, name: 'p2' },
        { id: 3, name: 'p3' },
      ],
      { renderOne },
    )
    const state = useBatchStore.getState()
    expect(state.summary).toEqual({ total: 3, done: 2, failed: 1 })
    const failed = state.items.find((i) => i.id === '2')
    expect(failed?.status).toBe('failed')
    expect(failed?.message).toBe('模板错误')
  })

  it('批量导出：成功记录导出路径', async () => {
    const exportOne = vi.fn(async (project: { name: string }) => `/out/${project.name}.zip`)
    await useBatchStore.getState().runBatchExport(
      [
        { id: 1, name: 'p1' },
        { id: 2, name: 'p2' },
      ],
      { exportOne },
    )
    const state = useBatchStore.getState()
    expect(state.mode).toBe('export')
    expect(state.resultPaths).toEqual({ '1': '/out/p1.zip', '2': '/out/p2.zip' })
    expect(state.summary).toEqual({ total: 2, done: 2, failed: 0 })
  })

  it('批量编辑（参数批量应用）：源项目 Excel 参数写入全部目标项目', async () => {
    const sheets = [{ name: 'Sheet1', headers: ['h'], rows: [{ h: 'v' }] }]
    const io = {
      listExcel: vi.fn(async () => [{ path: 'para.xlsx' }, { path: 'excel/parameter.xlsx' }]),
      readExcel: vi.fn(async () => sheets),
      writeExcel: vi.fn(async () => undefined),
    }
    await useBatchStore.getState().runBatchEdit(
      { id: 1, name: 'source' },
      [
        { id: 2, name: 't1' },
        { id: 3, name: 't2' },
      ],
      io,
    )
    expect(io.writeExcel).toHaveBeenCalledTimes(4)
    expect(io.writeExcel).toHaveBeenCalledWith(2, 'para.xlsx', sheets, 't1')
    expect(io.writeExcel).toHaveBeenCalledWith(3, 'excel/parameter.xlsx', sheets, 't2')
    const state = useBatchStore.getState()
    expect(state.mode).toBe('edit')
    expect(state.summary).toEqual({ total: 2, done: 2, failed: 0 })
  })

  it('stop() 中断批量任务', async () => {
    const renderOne = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    const p = useBatchStore.getState().runBatchRender(
      [
        { id: 1, name: 'p1' },
        { id: 2, name: 'p2' },
        { id: 3, name: 'p3' },
      ],
      { renderOne, concurrency: 1 },
    )
    useBatchStore.getState().stop()
    await p
    expect(useBatchStore.getState().running).toBe(false)
  })
})
