import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LabelPrintConfig, RenderConfig } from '@/types/render'

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
  labelDelete: (ids: string[]) => Promise<void>
  deleteOutput: (ids: string[]) => Promise<void>
  deleteOutputSn: (ids: string[]) => Promise<void>
  deleteYaml: (ids: string[]) => Promise<void>
  deleteYamlSn: (ids: string[]) => Promise<void>
  subscribeProgress: () => () => void
}

export const useRenderStore = create<RenderState>((set, get) => ({
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

  setConfig: (newConfig) => set((state) => ({
    config: { ...state.config, ...newConfig },
  })),

  setSelectedIds: (ids) => set({ selectedProjectIds: ids }),

  setRendering: (rendering, type = 'project') => set((state) => ({
    isRendering: rendering,
    ...(type === 'project' && { isProjectRendering: rendering }),
    ...(type === 'yaml' && { isYamlRendering: rendering }),
    ...(type === 'label' && { isLabelPrinting: rendering }),
  })),

  setProgress: (progress, message) => set({ 
    progress, 
    currentMessage: message,
    errors: progress === 100 ? [] : get().errors,
  }),

  addError: (error) => set((state) => ({
    errors: [...state.errors, error],
  })),

  resetProgress: () => set({
    isRendering: false,
    isProjectRendering: false,
    isYamlRendering: false,
    isLabelPrinting: false,
    progress: 0,
    currentMessage: '',
    errors: [],
  }),

  renderProject: async (ids) => {
    if (ids.length === 0) return
    set({ isRendering: true, isProjectRendering: true, progress: 0, currentMessage: '准备中...', errors: [] })
    try {
      await window.electron.render.project(ids)
      set({ isRendering: false, isProjectRendering: false, progress: 100, currentMessage: '渲染完成' })
    } catch (err) {
      set({ isRendering: false, isProjectRendering: false, progress: 0,
        currentMessage: `渲染失败: ${(err as Error).message}`, errors: [(err as Error).message] })
    }
  },

  renderYaml: async (ids) => {
    if (ids.length === 0) return
    set({ isRendering: true, isYamlRendering: true, progress: 0, currentMessage: '准备中...', errors: [] })
    try {
      await window.electron.render.yaml(ids)
      set({ isRendering: false, isYamlRendering: false, progress: 100, currentMessage: 'YAML输出完成' })
    } catch (err) {
      set({ isRendering: false, isYamlRendering: false, progress: 0,
        currentMessage: `YAML输出失败: ${(err as Error).message}`, errors: [(err as Error).message] })
    }
  },

  renderProjectSn: async (ids) => {
    if (ids.length === 0) return
    set({ isRendering: true, isProjectRendering: true, progress: 0, currentMessage: '准备中...', errors: [] })
    try {
      await window.electron.render.projectSn(ids)
      set({ isRendering: false, isProjectRendering: false, progress: 100, currentMessage: 'SN模式渲染完成' })
    } catch (err) {
      set({ isRendering: false, isProjectRendering: false, progress: 0,
        currentMessage: `SN模式渲染失败: ${(err as Error).message}`, errors: [(err as Error).message] })
    }
  },

  renderYamlSn: async (ids) => {
    if (ids.length === 0) return
    set({ isRendering: true, isYamlRendering: true, progress: 0, currentMessage: '准备中...', errors: [] })
    try {
      await window.electron.render.yamlSn(ids)
      set({ isRendering: false, isYamlRendering: false, progress: 100, currentMessage: 'SN模式YAML输出完成' })
    } catch (err) {
      set({ isRendering: false, isYamlRendering: false, progress: 0,
        currentMessage: `SN模式YAML输出失败: ${(err as Error).message}`, errors: [(err as Error).message] })
    }
  },

  labelPrint: async (ids, config) => {
    if (ids.length === 0) return
    set({ isRendering: true, isLabelPrinting: true, progress: 0, currentMessage: '准备中...', errors: [] })
    try {
      await window.electron.feature.labelPrint(ids, config)
      set({ isRendering: false, isLabelPrinting: false, progress: 100, currentMessage: '标签打印完成' })
    } catch (err) {
      set({ isRendering: false, isLabelPrinting: false, progress: 0,
        currentMessage: `标签打印失败: ${(err as Error).message}`, errors: [(err as Error).message] })
    }
  },

  labelDelete: async (ids) => {
    if (ids.length === 0) return
    set({ isRendering: true, isLabelPrinting: true, progress: 0, currentMessage: '准备中...', errors: [] })
    try {
      await window.electron.feature.labelDelete(ids)
      set({ isRendering: false, isLabelPrinting: false, progress: 100, currentMessage: '标签删除完成' })
    } catch (err) {
      set({ isRendering: false, isLabelPrinting: false, progress: 0,
        currentMessage: `标签删除失败: ${(err as Error).message}`, errors: [(err as Error).message] })
    }
  },

  deleteOutput: async (ids) => {
    if (ids.length === 0) return
    set({ isRendering: true, progress: 0, currentMessage: '准备中...', errors: [] })
    try {
      await window.electron.delete.output(ids)
      set({ isRendering: false, progress: 100, currentMessage: '删除完成' })
    } catch (err) {
      set({ isRendering: false, progress: 0,
        currentMessage: `删除输出失败: ${(err as Error).message}`, errors: [(err as Error).message] })
    }
  },

  deleteOutputSn: async (ids) => {
    if (ids.length === 0) return
    set({ isRendering: true, progress: 0, currentMessage: '准备中...', errors: [] })
    try {
      await window.electron.delete.outputSn(ids)
      set({ isRendering: false, progress: 100, currentMessage: '删除完成' })
    } catch (err) {
      set({ isRendering: false, progress: 0,
        currentMessage: `删除SN输出失败: ${(err as Error).message}`, errors: [(err as Error).message] })
    }
  },

  deleteYaml: async (ids) => {
    if (ids.length === 0) return
    set({ isRendering: true, progress: 0, currentMessage: '准备中...', errors: [] })
    try {
      await window.electron.delete.yaml(ids)
      set({ isRendering: false, progress: 100, currentMessage: '删除完成' })
    } catch (err) {
      set({ isRendering: false, progress: 0,
        currentMessage: `删除YAML失败: ${(err as Error).message}`, errors: [(err as Error).message] })
    }
  },

  deleteYamlSn: async (ids) => {
    if (ids.length === 0) return
    set({ isRendering: true, progress: 0, currentMessage: '准备中...', errors: [] })
    try {
      await window.electron.delete.yamlSn(ids)
      set({ isRendering: false, progress: 100, currentMessage: '删除完成' })
    } catch (err) {
      set({ isRendering: false, progress: 0,
        currentMessage: `删除SN YAML失败: ${(err as Error).message}`, errors: [(err as Error).message] })
    }
  },

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
          isRendering: false,
          isProjectRendering: false,
          isYamlRendering: false,
          isLabelPrinting: false,
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
          isRendering: false,
          isProjectRendering: false,
          isYamlRendering: false,
          isLabelPrinting: false,
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
}))
