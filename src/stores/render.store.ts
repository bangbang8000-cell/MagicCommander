import { create } from 'zustand'
import i18n from '@/i18n'
import type {
  LabelPrintConfig,
  RenderConfig,
  DryRunDeviceResult,
  DryRunResponse,
  ValidationResult,
} from '@/types/render'

// i18n（5.4.17）：本 store 内置的进度/完成/失败提示默认值统一走 i18n.t('common:render.*') 翻译
// （参照 chat.store.ts 先例）。调用方如传真实消息（runTask 的 startMessage/successMessage/failurePrefix），
// 则以调用方传入的已翻译消息为准；后端 IPC 下发的 message（subscribeProgress）同样以 IPC 消息为准。

type RenderTaskType = 'project' | 'yaml' | 'label' | 'general' | 'validate'

interface RenderState {
  isRendering: boolean
  isProjectRendering: boolean
  isYamlRendering: boolean
  isLabelPrinting: boolean
  isValidationRunning: boolean
  progress: number
  currentMessage: string
  errors: string[]
  selectedProjectIds: string[]
  config: RenderConfig
  dryRunResults: DryRunDeviceResult[]
  validationResults: ValidationResult[] | null

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
  dryRun: (ids: string[], format?: 'device_name' | 'device_sn') => Promise<void>
  clearDryRunResults: () => void
  validateTemplate: (ids: string[]) => Promise<void>
  validateExcel: (ids: string[]) => Promise<void>
  clearValidationResults: () => void
  subscribeProgress: () => () => void
}

const taskFlags = (type: RenderTaskType, rendering: boolean) => ({
  isRendering: rendering,
  ...(type === 'project' && { isProjectRendering: rendering }),
  ...(type === 'yaml' && { isYamlRendering: rendering }),
  ...(type === 'label' && { isLabelPrinting: rendering }),
  ...(type === 'validate' && { isValidationRunning: rendering }),
})

const clearTaskFlags = () => ({
  isRendering: false,
  isProjectRendering: false,
  isYamlRendering: false,
  isLabelPrinting: false,
  isValidationRunning: false,
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
      currentMessage: options.startMessage ?? i18n.t('common:render.preparing'),
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
    dryRunResults: [],
    validationResults: null,
    isValidationRunning: false,

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
        successMessage: i18n.t('common:render.done'),
        failurePrefix: i18n.t('common:render.failed'),
        action: () => window.electron.render.project(ids),
      }),

    renderYaml: (ids) =>
      runTask(ids, {
        type: 'yaml',
        successMessage: i18n.t('common:render.yamlDone'),
        failurePrefix: i18n.t('common:render.yamlFailed'),
        action: () => window.electron.render.yaml(ids),
      }),

    renderProjectSn: (ids) =>
      runTask(ids, {
        type: 'project',
        successMessage: i18n.t('common:render.snDone'),
        failurePrefix: i18n.t('common:render.snFailed'),
        action: () => window.electron.render.projectSn(ids),
      }),

    renderYamlSn: (ids) =>
      runTask(ids, {
        type: 'yaml',
        successMessage: i18n.t('common:render.snYamlDone'),
        failurePrefix: i18n.t('common:render.snYamlFailed'),
        action: () => window.electron.render.yamlSn(ids),
      }),

    labelPrint: (ids, config) =>
      runTask(ids, {
        type: 'label',
        successMessage: i18n.t('common:render.labelPrintDone'),
        failurePrefix: i18n.t('common:render.labelPrintFailed'),
        action: () => window.electron.feature.labelPrint(ids, config),
      }),

    labelMarkdown: (ids, config) =>
      runTask(ids, {
        type: 'label',
        successMessage: i18n.t('common:render.labelMarkdownDone'),
        failurePrefix: i18n.t('common:render.labelMarkdownFailed'),
        action: () => window.electron.feature.labelMarkdown(ids, config),
      }),

    labelPdf: (ids, config) =>
      runTask(ids, {
        type: 'label',
        successMessage: i18n.t('common:render.labelPdfDone'),
        failurePrefix: i18n.t('common:render.labelPdfFailed'),
        action: async () => {
          await window.electron.feature.labelPdf(ids, config)
        },
      }),

    labelDelete: (ids) =>
      runTask(ids, {
        type: 'label',
        successMessage: i18n.t('common:render.labelDeleteDone'),
        failurePrefix: i18n.t('common:render.labelDeleteFailed'),
        action: () => window.electron.feature.labelDelete(ids),
      }),

    deleteOutput: (ids) =>
      runTask(ids, {
        type: 'general',
        successMessage: i18n.t('common:render.deleteDone'),
        failurePrefix: i18n.t('common:render.deleteOutputFailed'),
        action: () => window.electron.delete.output(ids),
      }),

    deleteOutputSn: (ids) =>
      runTask(ids, {
        type: 'general',
        successMessage: i18n.t('common:render.deleteDone'),
        failurePrefix: i18n.t('common:render.deleteSnOutputFailed'),
        action: () => window.electron.delete.outputSn(ids),
      }),

    deleteYaml: (ids) =>
      runTask(ids, {
        type: 'general',
        successMessage: i18n.t('common:render.deleteDone'),
        failurePrefix: i18n.t('common:render.deleteYamlFailed'),
        action: () => window.electron.delete.yaml(ids),
      }),

    deleteYamlSn: (ids) =>
      runTask(ids, {
        type: 'general',
        successMessage: i18n.t('common:render.deleteDone'),
        failurePrefix: i18n.t('common:render.deleteSnYamlFailed'),
        action: () => window.electron.delete.yamlSn(ids),
      }),

    undoRender: (ids) =>
      runTask(ids, {
        type: 'general',
        successMessage: i18n.t('common:render.undoDone'),
        failurePrefix: i18n.t('common:render.undoFailed'),
        action: () => window.electron.render.undo(ids),
      }),

    dryRun: async (ids, format = 'device_name') => {
      if (ids.length === 0) return
      set({
        ...taskFlags('general', true),
        progress: 0,
        currentMessage: i18n.t('common:render.previewing'),
        errors: [],
        dryRunResults: [],
      })
      try {
        const data = (await window.electron.render.dryRun(ids, format)) as DryRunResponse | null
        const results = (data?.results ?? []) as DryRunDeviceResult[]
        set({
          ...clearTaskFlags(),
          progress: 100,
          currentMessage: i18n.t('common:render.previewDone', { count: results.length }),
          dryRunResults: results,
        })
      } catch (err) {
        set({
          ...clearTaskFlags(),
          progress: 0,
          currentMessage: `${i18n.t('common:render.previewFailed')}: ${errorMessage(err)}`,
          errors: [errorMessage(err)],
        })
      }
    },

    clearDryRunResults: () => set({ dryRunResults: [] }),

    validateTemplate: async (ids) => {
      if (ids.length === 0) return
      set({
        ...taskFlags('validate', true),
        progress: 0,
        currentMessage: i18n.t('common:render.validatingTemplate'),
        errors: [],
        validationResults: null,
      })
      try {
        const data = (await window.electron.render.validateTemplate(ids)) as { results: ValidationResult[] } | null
        const results = (data?.results ?? []) as ValidationResult[]
        set({
          ...clearTaskFlags(),
          progress: 100,
          currentMessage: i18n.t('common:render.templateValidated'),
          validationResults: results,
        })
      } catch (err) {
        set({
          ...clearTaskFlags(),
          errors: [errorMessage(err)],
        })
      }
    },

    validateExcel: async (ids) => {
      if (ids.length === 0) return
      set({
        ...taskFlags('validate', true),
        progress: 0,
        currentMessage: i18n.t('common:render.validatingExcel'),
        errors: [],
        validationResults: null,
      })
      try {
        const data = (await window.electron.render.validateExcel(ids)) as { results: ValidationResult[] } | null
        const results = (data?.results ?? []) as ValidationResult[]
        set({
          ...clearTaskFlags(),
          progress: 100,
          currentMessage: i18n.t('common:render.excelValidated'),
          validationResults: results,
        })
      } catch (err) {
        set({
          ...clearTaskFlags(),
          errors: [errorMessage(err)],
        })
      }
    },

    clearValidationResults: () => set({ validationResults: null }),

    subscribeProgress: () => {
      if (!window.electron || !window.electron.render) {
        console.warn('Electron API not available')
        return () => {}
      }

      const handler = (raw: unknown) => {
        if (!raw || typeof raw !== 'object') return
        const data = raw as { status?: string; message?: string; data?: { progress?: number } }
        if (data.status === 'progress') {
          set({
            progress: data.data?.progress || 0,
            currentMessage: data.message,
          })
        } else if (data.status === 'complete') {
          set({
            ...clearTaskFlags(),
            progress: 100,
            currentMessage: data.message || i18n.t('common:render.completed'),
          })
        } else if (data.status === 'info') {
          set({
            currentMessage: data.message,
            progress: data.data?.progress ?? Math.min(get().progress + 5, 90),
          })
        } else if (data.status === 'error') {
          set((state) => ({
            ...clearTaskFlags(),
            errors: [...state.errors, data.message ?? ''],
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
            currentMessage: data.message || i18n.t('common:render.success'),
          })
        }
      }

      return window.electron.render.onProgress(handler)
    },
  }
})
