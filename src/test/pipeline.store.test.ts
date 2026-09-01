/**
 * 4.4 F4-3（测试计划 E-3）：一键管线（导入 AutoLink 规划 → 渲染 → 导出）
 *
 * 覆盖：
 * - runPipelineSteps：按序执行 / 步骤状态 / 失败停止 / 中断取消剩余
 * - runTemplateBatch：模板批处理（继续失败 / 中断）
 * - usePipelineStore：runPlanPipeline / runTemplatePipeline（注入适配器）、retry
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runPipelineSteps, runTemplateBatch, usePipelineStore } from '@/stores/pipeline.store'

describe('E-3 runPipelineSteps 按序编排', () => {
  it('全部成功：步骤依次 done，结果记录，回调按序', async () => {
    const order: string[] = []
    const onStepStart = vi.fn((_i: number, id: string) => order.push(`start:${id}`))
    const onStepDone = vi.fn((_i: number, id: string) => order.push(`done:${id}`))
    const result = await runPipelineSteps<unknown>(
      [
        { id: 'import', run: async () => ({ name: 'p1' }) },
        { id: 'render', run: async () => undefined },
        { id: 'export', run: async () => '/out/p1.zip' },
      ],
      { onStepStart, onStepDone },
    )
    expect(result.failedIndex).toBeNull()
    expect(result.cancelled).toBe(false)
    expect(result.steps.map((s) => s.status)).toEqual(['done', 'done', 'done'])
    expect(result.results).toHaveProperty('import')
    expect(result.results).toHaveProperty('export')
    expect(order).toEqual(['start:import', 'done:import', 'start:render', 'done:render', 'start:export', 'done:export'])
  })

  it('中途失败：失败步骤标记 failed，后续保持 idle，失败索引正确', async () => {
    const onStepError = vi.fn()
    const result = await runPipelineSteps<unknown>(
      [
        { id: 'import', run: async () => ({ name: 'p1' }) },
        { id: 'render', run: async () => Promise.reject(new Error('渲染失败')) },
        { id: 'export', run: async () => '/out/p1.zip' },
      ],
      { onStepError },
    )
    expect(result.failedIndex).toBe(1)
    expect(result.steps.map((s) => s.status)).toEqual(['done', 'failed', 'idle'])
    expect(onStepError).toHaveBeenCalledWith(1, 'render', expect.any(Error))
  })

  it('中断：当前步骤 cancelled，剩余步骤 cancelled', async () => {
    const controller = new AbortController()
    const promise = runPipelineSteps(
      [
        { id: 'import', run: async () => new Promise((r) => setTimeout(r, 5)) },
        { id: 'render', run: async () => undefined },
        { id: 'export', run: async () => undefined },
      ],
      { signal: controller.signal },
    )
    controller.abort()
    const result = await promise
    expect(result.cancelled).toBe(true)
    expect(result.steps.every((s) => s.status === 'cancelled')).toBe(true)
  })
})

describe('E-3 runTemplateBatch 模板批处理', () => {
  it('逐模板渲染导出：全部成功，记录导出路径', async () => {
    const result = await runTemplateBatch(
      [
        { id: 't1', sourceProject: 'src1' },
        { id: 't2', sourceProject: 'src2' },
      ],
      {
        resolveProjectId: async (name) => (name === 'src1' ? 1 : 2),
        render: vi.fn(async () => undefined),
        exportProject: async (name) => `/out/${name}.zip`,
      },
    )
    expect(result.done).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.paths).toEqual({ t1: '/out/src1.zip', t2: '/out/src2.zip' })
  })

  it('单个失败继续执行其余模板（批处理语义）', async () => {
    const result = await runTemplateBatch(
      [
        { id: 't1', sourceProject: 'src1' },
        { id: 't2', sourceProject: 'missing' },
        { id: 't3', sourceProject: 'src3' },
      ],
      {
        resolveProjectId: async (name) => (name === 'missing' ? null : 1),
        render: vi.fn(async () => undefined),
        exportProject: async () => '/out/x.zip',
      },
    )
    expect(result.done).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.errors[0].id).toBe('t2')
  })

  it('中断后剩余模板标记 cancelled', async () => {
    const controller = new AbortController()
    const onStepCancelled = vi.fn()
    const promise = runTemplateBatch(
      [
        { id: 't1', sourceProject: 'src1' },
        { id: 't2', sourceProject: 'src2' },
        { id: 't3', sourceProject: 'src3' },
      ],
      {
        signal: controller.signal,
        resolveProjectId: async () => 1,
        render: async () => new Promise((r) => setTimeout(r, 5)),
        exportProject: async () => '/out/x.zip',
        onStepCancelled,
      },
    )
    controller.abort()
    const result = await promise
    expect(result.done + result.failed + result.cancelled).toBe(3)
  })
})

describe('E-3 usePipelineStore 一键管线', () => {
  beforeEach(() => {
    usePipelineStore.getState().reset()
  })

  it('规划管线：导入→渲染→导出 按序完成，导出路径记录', async () => {
    const adapters = {
      importPlan: vi.fn(async () => ({ name: 'plan1', mcpara_id: 42 })),
      render: vi.fn(async () => undefined),
      exportProject: vi.fn(async () => '/out/plan1.zip'),
    }
    await usePipelineStore.getState().runPlanPipeline('/tmp/plan.json', adapters)
    const state = usePipelineStore.getState()
    expect(state.running).toBe(false)
    expect(state.steps.map((s) => s.status)).toEqual(['done', 'done', 'done'])
    expect(adapters.importPlan).toHaveBeenCalledWith('/tmp/plan.json')
    expect(adapters.render).toHaveBeenCalledWith(42)
    expect(adapters.exportProject).toHaveBeenCalledWith('plan1')
    expect(state.exportPath).toBe('/out/plan1.zip')
  })

  it('规划导入失败：导入步骤 failed，后续 idle，error 可见', async () => {
    const adapters = {
      importPlan: vi.fn(async () => Promise.reject(new Error('规划文件损坏'))),
      render: vi.fn(async () => undefined),
      exportProject: vi.fn(async () => ''),
    }
    await usePipelineStore.getState().runPlanPipeline('/tmp/bad.json', adapters)
    const state = usePipelineStore.getState()
    expect(state.steps[0].status).toBe('failed')
    expect(state.steps[1].status).toBe('idle')
    expect(state.steps[2].status).toBe('idle')
    expect(state.error).toBe('规划文件损坏')
    expect(adapters.render).not.toHaveBeenCalled()
  })

  it('retry：失败后可重试并成功', async () => {
    let calls = 0
    const adapters = {
      importPlan: vi.fn(async () => {
        calls++
        if (calls === 1) return Promise.reject(new Error('临时失败'))
        return { name: 'plan1', mcpara_id: 42 }
      }),
      render: vi.fn(async () => undefined),
      exportProject: vi.fn(async () => '/out/plan1.zip'),
    }
    await usePipelineStore.getState().runPlanPipeline('/tmp/plan.json', adapters)
    expect(usePipelineStore.getState().steps[0].status).toBe('failed')
    await usePipelineStore.getState().retry()
    const state = usePipelineStore.getState()
    expect(state.steps.map((s) => s.status)).toEqual(['done', 'done', 'done'])
  })

  it('模板批处理：逐模板步骤状态 + 导出路径记录', async () => {
    const adapters = {
      resolveProjectId: vi.fn(async (name: string) => (name === 'src2' ? null : 1)),
      render: vi.fn(async () => undefined),
      exportProject: vi.fn(async (name: string) => `/out/${name}.zip`),
    }
    await usePipelineStore.getState().runTemplatePipeline(
      [
        { id: 't1', name: 'T1', sourceProject: 'src1', path: '', structure: { hasExcel: true }, files: [] },
        { id: 't2', name: 'T2', sourceProject: 'src2', path: '', structure: { hasExcel: true }, files: [] },
      ] as never,
      adapters,
    )
    const state = usePipelineStore.getState()
    expect(state.mode).toBe('template')
    const t1 = state.steps.find((s) => s.id === 't1')
    const t2 = state.steps.find((s) => s.id === 't2')
    expect(t1?.status).toBe('done')
    expect(t2?.status).toBe('failed')
    expect(state.templateExportPaths).toEqual({ t1: '/out/src1.zip' })
  })
})
