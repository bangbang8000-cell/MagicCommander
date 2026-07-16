import { create } from 'zustand'
import type { LabelPrintConfig, RenderConfig } from '@/types/render'

type RenderTaskType = 'project' | 'yaml' | 'label' | 'general'

interface RenderState {
  isRendering: boolean
  isProjectRendering: boolean
  isYamlRendering: boolean
  isLabelPrinting: boolean
  progress: number
  currentMessage: string
  errors: string[]
  selectedProjectIds: string[]
  config: RenderConfig

  setConfig: (config: Partial<RenderConfig>) => void
  setSelectedIds: (ids: string[]) => void
  setRendering: (rendering: boolean, type?: 'project' | 'yaml' | 'label') => void
  setProgress: (progress: number, message: string) => void
  addError: (error: string) => void
  resetProgress: () => void

  renderProject: (ids: string[]) => Promise<void>
  renderYaml: (ids: string[]) => Promise<void>
  renderProjectSn: (ids: string[]) => Promise<void>
  renderYamlSn: (ids: string[]) => Promise<void>
  labelPrint: (ids: string[], config?: LabelPrintConfig) => Promise<void>
  labelMarkdown: (ids: string[], config?: LabelPrintConfig) => Promise<void>
  labelPdf: (ids: string[], config?: LabelPrintConfig) => Promise<void>
  labelDelete: (ids: string[]) => Promise<void>
  deleteOutput: (ids: string[]) => Promise<void>
  deleteOutputSn: (ids: string[]) => Promise<void>
  deleteYaml: (ids: string[]) => Promise<void>
  deleteYamlSn: (ids: string[]) => Promise<void>
  undoRender: (ids: string[]) => Promise<void>
  subscribeProgress: () => () => void
}

const taskFlags = (type: RenderTaskType, rendering: boolean) => ({
  isRendering: rendering,
  ...(type === 'project' && { isProjectRendering: rendering }),
  ...(type === 'yaml' && { isYamlRendering: rendering }),
  ...(type === 'label' && { isLabelPrinting: rendering }),
})

const clearTaskFlags = () => ({
  isRendering: false,
  isProjectRendering: false,
  isYamlRendering: false,
  isLabelPrinting: false,
})

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

export const useRenderStore = create<RenderState>((set, get) => {
  const runTask = async (
    ids: string[],
    options: {
      type: RenderTaskType
      startMessage?: string
      successMessage: string
      failurePrefix: string
      action: () => Promise<void>
    },
  ) => {
    if (ids.length === 0) return

    set({
      ...taskFlags(options.type, true),
      progress: 0,
      currentMessage: options.startMessage ?? '准备中...',
      errors: [],
    })

    try {
      await options.action()
      set({
        ...taskFlags(options.type, false),
        progress: 100,
        currentMessage: options.successMessage,
      })
    } catch (err) {
      const message = errorMessage(err)
      set({
        ...taskFlags(options.type, false),
        progress: 0,
        currentMessage: `${options.failurePrefix}: ${message}`,
        errors: [message],
      })
    }
  }

  return {
    isRendering: false,
    isProjectRendering: false,
    isYamlRendering: false,
    isLabelPrinting: false,
    progress: 0,
    currentMessage: '',
    errors: [],
    selectedProjectIds: [],
    config: {
      outputFormat: 'device_name',
      renderType: 'project',
    },

    setConfig: (newConfig) =>
      set((state) => ({
        config: { ...state.config, ...newConfig },
      })),

    setSelectedIds: (ids) => set({ selectedProjectIds: ids }),

    setRendering: (rendering, type = 'project') => set(taskFlags(type, rendering)),

    setProgress: (progress, message) =>
      set({
        progress,
        currentMessage: message,
        errors: progress === 100 ? [] : get().errors,
      }),

    addError: (error) =>
      set((state) => ({
        errors: [...state.errors, error],
      })),

    resetProgress: () =>
      set({
        ...clearTaskFlags(),
        progress: 0,
        currentMessage: '',
        errors: [],
      }),

    renderProject: (ids) =>
      runTask(ids, {
        type: 'project',
        successMessage: '渲染完成',
        failurePrefix: '渲染失败',
        action: () => window.electron.render.project(ids),
      }),

    renderYaml: (ids) =>
      runTask(ids, {
        type: 'yaml',
        successMessage: 'YAML输出完成',
        failurePrefix: 'YAML输出失败',
        action: () => window.electron.render.yaml(ids),
      }),

    renderProjectSn: (ids) =>
      runTask(ids, {
        type: 'project',
        successMessage: 'SN模式渲染完成',
        failurePrefix: 'SN模式渲染失败',
        action: () => window.electron.render.projectSn(ids),
      }),

    renderYamlSn: (ids) =>
      runTask(ids, {
        type: 'yaml',
        successMessage: 'SN模式YAML输出完成',
        failurePrefix: 'SN模式YAML输出失败',
        action: () => window.electron.render.yamlSn(ids),
      }),

    labelPrint: (ids, config) =>
      runTask(ids, {
        type: 'label',
        successMessage: '标签打印完成',
        failurePrefix: '标签打印失败',
        action: () => window.electron.feature.labelPrint(ids, config),
      }),

    labelMarkdown: (ids, config) =>
      runTask(ids, {
        type: 'label',
        successMessage: '标签Markdown生成完成',
        failurePrefix: '标签Markdown生成失败',
        action: () => window.electron.feature.labelMarkdown(ids, config),
      }),

    labelPdf: (ids, config) =>
      runTask(ids, {
        type: 'label',
        successMessage: '标签PDF导出完成',
        failurePrefix: '标签PDF导出失败',
        action: async () => {
          await window.electron.feature.labelPdf(ids, config)
        },
      }),

    labelDelete: (ids) =>
      runTask(ids, {
        type: 'label',
        successMessage: '标签删除完成',
        failurePrefix: '标签删除失败',
        action: () => window.electron.feature.labelDelete(ids),
      }),

    deleteOutput: (ids) =>
      runTask(ids, {
        type: 'general',
        successMessage: '删除完成',
        failurePrefix: '删除输出失败',
        action: () => window.electron.delete.output(ids),
      }),

    deleteOutputSn: (ids) =>
      runTask(ids, {
        type: 'general',
        successMessage: '删除完成',
        failurePrefix: '删除SN输出失败',
        action: () => window.electron.delete.outputSn(ids),
      }),

    deleteYaml: (ids) =>
      runTask(ids, {
        type: 'general',
        successMessage: '删除完成',
        failurePrefix: '删除YAML失败',
        action: () => window.electron.delete.yaml(ids),
      }),

    deleteYamlSn: (ids) =>
      runTask(ids, {
        type: 'general',
        successMessage: '删除完成',
        failurePrefix: '删除SN YAML失败',
        action: () => window.electron.delete.yamlSn(ids),
      }),

    undoRender: (ids) =>
      runTask(ids, {
        type: 'general',
        successMessage: '渲染已撤销',
        failurePrefix: '撤销渲染失败',
        action: () => window.electron.render.undo(ids),
      }),

    subscribeProgress: () => {
      if (!window.electron || !window.electron.render) {
        console.warn('Electron API not available')
        return () => {}
      }

      const handler = (data: any) => {
        if (data.status === 'progress') {
          set({
            progress: data.data?.progress || 0,
            currentMessage: data.message,
          })
        } else if (data.status === 'complete') {
          set({
            ...clearTaskFlags(),
            progress: 100,
            currentMessage: data.message || '完成',
          })
        } else if (data.status === 'info') {
          set({
            currentMessage: data.message,
            progress: data.data?.progress ?? Math.min(get().progress + 5, 90),
          })
        } else if (data.status === 'error') {
          set((state) => ({
            ...clearTaskFlags(),
            errors: [...state.errors, data.message],
          }))
        } else if (data.status === 'start') {
          set({
            currentMessage: data.message,
          })
        } else if (data.status === 'log') {
          set({
            currentMessage: data.message,
          })
        } else if (data.status === 'success') {
          set({
            currentMessage: data.message || '操作成功',
          })
        }
      }

      return window.electron.render.onProgress(handler)
    },
  }
})
