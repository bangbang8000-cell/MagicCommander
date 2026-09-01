/**
 * 4.4 F4-3 一键管线：导入 AutoLink 规划 → 渲染 → 导出 按序编排
 *
 * - 按序执行 + 步骤状态（idle/running/done/failed/cancelled）
 * - 可中断（AbortController）/ 重试失败步骤 / 重置
 * - 模板批处理：对多模板一键渲染导出（源项目解析 → 渲染 → 导出）
 * - 纯函数 runPipelineSteps / runTemplateBatch 可独立单测；store 默认适配器走既有 IPC
 */
import { create } from 'zustand'
import { useProjectStore } from '@/stores/project.store'
import type { TemplateInfo } from '@/types/project'

export type StepStatus = 'idle' | 'running' | 'done' | 'failed' | 'cancelled'

export interface PipelineStepState {
  id: string
  status: StepStatus
  message?: string
  detail?: unknown
}

export interface PipelineStep<T = unknown> {
  id: string
  run: (signal?: AbortSignal) => Promise<T>
}

export interface PipelineRunOptions {
  signal?: AbortSignal
  onStepStart?: (index: number, id: string) => void
  onStepDone?: (index: number, id: string, result: unknown) => void
  onStepError?: (index: number, id: string, error: unknown) => void
}

export interface PipelineRunResult {
  steps: Array<{ id: string; status: StepStatus }>
  results: Record<string, unknown>
  failedIndex: number | null
  cancelled: boolean
}

/** 按序执行管线步骤；任一步失败即停止；中断则剩余步骤标记 cancelled */
export async function runPipelineSteps<T>(
  steps: PipelineStep<T>[],
  options: PipelineRunOptions = {},
): Promise<PipelineRunResult> {
  const results: Record<string, unknown> = {}
  const states = steps.map((step) => ({ id: step.id, status: 'idle' as StepStatus }))
  let failedIndex: number | null = null
  let cancelled = false

  const cancelRemaining = (from: number) => {
    for (let j = from; j < steps.length; j++) states[j].status = 'cancelled'
  }

  for (let i = 0; i < steps.length; i++) {
    if (options.signal?.aborted) {
      cancelled = true
      states[i].status = 'cancelled'
      cancelRemaining(i + 1)
      break
    }
    states[i].status = 'running'
    options.onStepStart?.(i, steps[i].id)
    try {
      const result = await steps[i].run(options.signal)
      if (options.signal?.aborted) {
        cancelled = true
        states[i].status = 'cancelled'
        cancelRemaining(i + 1)
        break
      }
      states[i].status = 'done'
      results[steps[i].id] = result
      options.onStepDone?.(i, steps[i].id, result)
    } catch (err) {
      if (options.signal?.aborted) {
        cancelled = true
        states[i].status = 'cancelled'
        cancelRemaining(i + 1)
        break
      }
      states[i].status = 'failed'
      failedIndex = i
      options.onStepError?.(i, steps[i].id, err)
      break
    }
  }
  return { steps: states, results, failedIndex, cancelled }
}

export interface TemplateBatchOptions {
  signal?: AbortSignal
  resolveProjectId: (sourceProject: string) => Promise<number | null>
  render: (id: number | string) => Promise<void>
  exportProject: (name: string) => Promise<string>
  onStepStart?: (index: number, id: string) => void
  onStepDone?: (index: number, id: string, path: string) => void
  onStepError?: (index: number, id: string, error: unknown) => void
  onStepCancelled?: (index: number, id: string) => void
}

export interface TemplateBatchResult {
  done: number
  failed: number
  cancelled: number
  paths: Record<string, string>
  errors: Array<{ id: string; message: string }>
}

/** 模板批处理：逐模板 解析源项目 → 渲染 → 导出；失败继续（批处理语义），中断后剩余标记 cancelled */
export async function runTemplateBatch(
  templates: Array<{ id: string; sourceProject: string }>,
  options: TemplateBatchOptions,
): Promise<TemplateBatchResult> {
  const paths: Record<string, string> = {}
  const errors: Array<{ id: string; message: string }> = []
  let done = 0
  let failed = 0
  let cancelled = 0

  for (let i = 0; i < templates.length; i++) {
    const tpl = templates[i]
    if (options.signal?.aborted) {
      cancelled++
      options.onStepCancelled?.(i, tpl.id)
      continue
    }
    options.onStepStart?.(i, tpl.id)
    try {
      const pid = await options.resolveProjectId(tpl.sourceProject)
      if (pid == null) throw new Error(`源项目不存在: ${tpl.sourceProject}`)
      await options.render(pid)
      const path = await options.exportProject(tpl.sourceProject)
      paths[tpl.id] = path
      done++
      options.onStepDone?.(i, tpl.id, path)
    } catch (err) {
      if (options.signal?.aborted) {
        cancelled++
        options.onStepCancelled?.(i, tpl.id)
      } else {
        failed++
        const message = err instanceof Error ? err.message : String(err)
        errors.push({ id: tpl.id, message })
        options.onStepError?.(i, tpl.id, err)
      }
    }
  }
  return { done, failed, cancelled, paths, errors }
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err))

export type PipelineMode = 'plan' | 'template' | null

export interface PlanImportLike {
  name: string
  mcpara_id?: number | string | null
}

export interface PlanPipelineAdapters {
  importPlan: (planJson: string) => Promise<PlanImportLike>
  render: (id: number | string) => Promise<void>
  exportProject: (name: string) => Promise<string>
}

export interface TemplatePipelineAdapters {
  resolveProjectId: (name: string) => Promise<number | null>
  render: (id: number | string) => Promise<void>
  exportProject: (name: string) => Promise<string>
}

export function defaultPlanAdapters(): PlanPipelineAdapters {
  return {
    importPlan: (planJson) => window.electron.plan.import(planJson) as Promise<PlanImportLike>,
    render: (id) => window.electron.render.project([String(id)]),
    exportProject: (name) => window.electron.output.export(name, 'zip'),
  }
}

export function defaultTemplateAdapters(): TemplatePipelineAdapters {
  return {
    resolveProjectId: async (name) => {
      const stored = useProjectStore.getState().projects.find((p) => p.name === name)
      if (stored) return stored.id
      const raw = await window.electron.project.list()
      const found = (Array.isArray(raw) ? raw : []).find((p: { name?: string }) => String(p.name) === name)
      return found && found.id != null ? (found.id as number) : null
    },
    render: (id) => window.electron.render.project([String(id)]),
    exportProject: (name) => window.electron.output.export(name, 'zip'),
  }
}

export interface PipelineStoreState {
  mode: PipelineMode
  running: boolean
  steps: PipelineStepState[]
  planJson: string
  exportPath?: string
  templateIds: string[]
  templateExportPaths: Record<string, string>
  error: string | null
  abortController: AbortController | null
  lastPlanJson: string | null
  lastTemplateIds: string[]
  lastPlanAdapters: PlanPipelineAdapters | null
  lastTemplateAdapters: TemplatePipelineAdapters | null

  setPlanJson: (v: string) => void
  setTemplateIds: (ids: string[]) => void
  stop: () => void
  reset: () => void
  retry: () => Promise<void>
  runPlanPipeline: (planJson: string, adapters?: PlanPipelineAdapters) => Promise<void>
  runTemplatePipeline: (templates: TemplateInfo[], adapters?: TemplatePipelineAdapters) => Promise<void>
}

export const usePipelineStore = create<PipelineStoreState>()((set, get) => {
  const initialSteps = (ids: string[]): PipelineStepState[] => ids.map((id) => ({ id, status: 'idle' }))

  return {
    mode: null,
    running: false,
    steps: [],
    planJson: '',
    templateIds: [],
    templateExportPaths: {},
    error: null,
    abortController: null,
    lastPlanJson: null,
    lastTemplateIds: [],
    lastPlanAdapters: null,
    lastTemplateAdapters: null,

    setPlanJson: (v) => set({ planJson: v }),
    setTemplateIds: (ids) => set({ templateIds: ids }),

    stop: () => {
      get().abortController?.abort()
    },

    reset: () =>
      set({
        mode: null,
        running: false,
        steps: [],
        planJson: '',
        exportPath: undefined,
        templateIds: [],
        templateExportPaths: {},
        error: null,
        abortController: null,
        lastPlanJson: null,
        lastTemplateIds: [],
        lastPlanAdapters: null,
        lastTemplateAdapters: null,
      }),

    retry: async () => {
      const { mode, lastPlanJson, lastTemplateIds, lastPlanAdapters, lastTemplateAdapters } = get()
      if (mode === 'plan' && lastPlanJson) {
        await get().runPlanPipeline(lastPlanJson, lastPlanAdapters ?? undefined)
      } else if (mode === 'template' && lastTemplateIds.length > 0) {
        const templates = useProjectStore.getState().templates.filter((tpl) => lastTemplateIds.includes(tpl.id))
        await get().runTemplatePipeline(templates, lastTemplateAdapters ?? undefined)
      }
    },

    runPlanPipeline: async (planJson, adapters) => {
      const a = adapters ?? defaultPlanAdapters()
      const controller = new AbortController()
      let imported: PlanImportLike | null = null

      set({
        mode: 'plan',
        running: true,
        steps: initialSteps(['import', 'render', 'export']),
        planJson,
        exportPath: undefined,
        error: null,
        lastPlanJson: planJson,
        lastPlanAdapters: a,
        abortController: controller,
      })

      const steps: PipelineStep[] = [
        {
          id: 'import',
          run: async () => {
            const result = await a.importPlan(planJson)
            imported = result
            return result
          },
        },
        {
          id: 'render',
          run: async () => {
            if (!imported) throw new Error('尚未完成规划导入')
            const id = imported.mcpara_id ?? imported.name
            if (id == null || id === '') throw new Error('导入结果缺少项目标识')
            await a.render(id)
          },
        },
        {
          id: 'export',
          run: async () => {
            if (!imported) throw new Error('尚未完成规划导入')
            const path = await a.exportProject(imported.name)
            set({ exportPath: path })
            return path
          },
        },
      ]

      const result = await runPipelineSteps(steps, {
        signal: controller.signal,
        onStepStart: (_, id) =>
          set((s) => ({
            steps: s.steps.map((st) => (st.id === id ? { ...st, status: 'running', message: undefined } : st)),
          })),
        onStepDone: (_, id, r) =>
          set((s) => ({ steps: s.steps.map((st) => (st.id === id ? { ...st, status: 'done', detail: r } : st)) })),
        onStepError: (_, id, e) =>
          set((s) => ({
            steps: s.steps.map((st) => (st.id === id ? { ...st, status: 'failed', message: errMsg(e) } : st)),
            error: errMsg(e),
          })),
      })

      const statusById = new Map(result.steps.map((x) => [x.id, x.status]))
      set((s) => ({
        running: false,
        abortController: null,
        steps: s.steps.map((st) => ({ ...st, status: statusById.get(st.id) ?? st.status })),
      }))
    },

    runTemplatePipeline: async (templates, adapters) => {
      const a = adapters ?? defaultTemplateAdapters()
      const controller = new AbortController()

      set({
        mode: 'template',
        running: true,
        steps: templates.map((tpl) => ({ id: tpl.id, status: 'idle' as StepStatus })),
        templateIds: templates.map((tpl) => tpl.id),
        templateExportPaths: {},
        error: null,
        lastTemplateIds: templates.map((tpl) => tpl.id),
        lastTemplateAdapters: a,
        abortController: controller,
      })

      const result = await runTemplateBatch(templates, {
        signal: controller.signal,
        resolveProjectId: a.resolveProjectId,
        render: a.render,
        exportProject: a.exportProject,
        onStepStart: (_, id) =>
          set((s) => ({
            steps: s.steps.map((st) => (st.id === id ? { ...st, status: 'running', message: undefined } : st)),
          })),
        onStepDone: (_, id, path) =>
          set((s) => ({
            steps: s.steps.map((st) => (st.id === id ? { ...st, status: 'done', detail: path } : st)),
            templateExportPaths: { ...s.templateExportPaths, [id]: path },
          })),
        onStepError: (_, id, e) =>
          set((s) => ({
            steps: s.steps.map((st) => (st.id === id ? { ...st, status: 'failed', message: errMsg(e) } : st)),
            error: errMsg(e),
          })),
        onStepCancelled: (_, id) =>
          set((s) => ({ steps: s.steps.map((st) => (st.id === id ? { ...st, status: 'cancelled' } : st)) })),
      })

      set({
        running: false,
        abortController: null,
        error: result.failed > 0 ? `批量处理完成：${result.done} 成功，${result.failed} 失败` : get().error,
      })
    },
  }
})
