import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRenderStore } from './render.store'

function mockElectron(
  overrides: { render?: object; feature?: object; delete?: object } = {},
) {
  const handlers: Record<string, (raw: unknown) => void> = {}
  const electron = {
    render: {
      project: vi.fn(async () => {}),
      yaml: vi.fn(async () => {}),
      projectSn: vi.fn(async () => {}),
      yamlSn: vi.fn(async () => {}),
      undo: vi.fn(async () => {}),
      dryRun: vi.fn(async () => ({ results: [{ sn: 'S1' }] })),
      validateTemplate: vi.fn(async () => ({ results: [{ ok: true }] })),
      validateExcel: vi.fn(async () => ({ results: [{ ok: true }] })),
      onProgress: vi.fn((h: (raw: unknown) => void) => {
        handlers.onProgress = h
        return () => {}
      }),
      ...(overrides.render || {}),
    },
    feature: {
      labelPrint: vi.fn(async () => {}),
      labelMarkdown: vi.fn(async () => {}),
      labelPdf: vi.fn(async () => {}),
      labelDelete: vi.fn(async () => {}),
      ...(overrides.feature || {}),
    },
    delete: {
      output: vi.fn(async () => {}),
      outputSn: vi.fn(async () => {}),
      yaml: vi.fn(async () => {}),
      yamlSn: vi.fn(async () => {}),
      ...(overrides.delete || {}),
    },
  }
  ;(window as unknown as { electron?: object }).electron = electron
  return { electron, handlers }
}

beforeEach(() => {
  useRenderStore.setState({
    isRendering: false,
    isProjectRendering: false,
    isYamlRendering: false,
    isLabelPrinting: false,
    isValidationRunning: false,
    progress: 0,
    currentMessage: '',
    errors: [],
    selectedProjectIds: [],
    dryRunResults: [],
    validationResults: null,
  })
})

describe('useRenderStore（508-a 覆盖率）', () => {
  it('空 ids 时任务不执行', async () => {
    const { electron } = mockElectron()
    await useRenderStore.getState().renderProject([])
    expect(electron.render.project).not.toHaveBeenCalled()
  })

  it('renderProject 成功路径', async () => {
    const { electron } = mockElectron()
    await useRenderStore.getState().renderProject(['1'])
    expect(electron.render.project).toHaveBeenCalledWith(['1'])
    const s = useRenderStore.getState()
    expect(s.isRendering).toBe(false)
    expect(s.progress).toBe(100)
    expect(s.currentMessage).toBe('渲染完成')
  })

  it('renderProject 失败路径写入 errors', async () => {
    mockElectron({ render: { project: vi.fn(async () => { throw new Error('x') }) } })
    await useRenderStore.getState().renderProject(['1'])
    const s = useRenderStore.getState()
    expect(s.progress).toBe(0)
    expect(s.currentMessage).toBe('渲染失败: x')
    expect(s.errors).toEqual(['x'])
  })

  it('setProgress 到 100 时清空 errors', () => {
    useRenderStore.getState().addError('e1')
    useRenderStore.getState().setProgress(100, 'done')
    expect(useRenderStore.getState().errors).toEqual([])
  })

  it('resetProgress 重置所有任务标记', () => {
    useRenderStore.getState().setRendering(true, 'project')
    useRenderStore.getState().addError('e1')
    useRenderStore.getState().resetProgress()
    const s = useRenderStore.getState()
    expect(s.isProjectRendering).toBe(false)
    expect(s.isValidationRunning).toBe(false)
    expect(s.progress).toBe(0)
    expect(s.errors).toEqual([])
  })

  it('labelPrint 使用默认配置并置 label 标记', async () => {
    const { electron } = mockElectron()
    await useRenderStore.getState().labelPrint(['1'])
    expect(electron.feature.labelPrint).toHaveBeenCalledWith(['1'], undefined)
    expect(useRenderStore.getState().isLabelPrinting).toBe(false)
  })

  it('dryRun 成功填充 dryRunResults', async () => {
    const { electron } = mockElectron()
    await useRenderStore.getState().dryRun(['1'], 'device_name')
    expect(electron.render.dryRun).toHaveBeenCalledWith(['1'], 'device_name')
    const s = useRenderStore.getState()
    expect(s.dryRunResults).toEqual([{ sn: 'S1' }])
    expect(s.progress).toBe(100)
    expect(s.currentMessage).toBe('预览完成，共 1 个设备')
  })

  it('dryRun 失败路径', async () => {
    mockElectron({ render: { dryRun: vi.fn(async () => { throw new Error('f') }) } })
    await useRenderStore.getState().dryRun(['1'])
    const s = useRenderStore.getState()
    expect(s.errors).toEqual(['f'])
    expect(s.currentMessage).toBe('预览失败: f')
  })

  it('validateTemplate 成功与 clearValidationResults', async () => {
    const { electron } = mockElectron()
    await useRenderStore.getState().validateTemplate(['1'])
    expect(electron.render.validateTemplate).toHaveBeenCalledWith(['1'])
    expect(useRenderStore.getState().validationResults).toEqual([{ ok: true }])
    useRenderStore.getState().clearValidationResults()
    expect(useRenderStore.getState().validationResults).toBeNull()
  })

  it('validateExcel 成功', async () => {
    const { electron } = mockElectron()
    await useRenderStore.getState().validateExcel(['1'])
    expect(electron.render.validateExcel).toHaveBeenCalledWith(['1'])
    expect(useRenderStore.getState().currentMessage).toBe('Excel 数据校验完成')
  })

  it('deleteOutput 与 undoRender 走 general 任务', async () => {
    const { electron } = mockElectron()
    await useRenderStore.getState().deleteOutput(['2'])
    expect(electron.delete.output).toHaveBeenCalledWith(['2'])
    await useRenderStore.getState().undoRender(['3'])
    expect(electron.render.undo).toHaveBeenCalledWith(['3'])
  })

  it('subscribeProgress: 无 electron 时返回 noop 且不报错', () => {
    ;(window as unknown as { electron?: unknown }).electron = undefined
    const un = useRenderStore.getState().subscribeProgress()
    expect(typeof un).toBe('function')
    un()
  })

  it('subscribeProgress: 事件回调映射各状态', () => {
    const { handlers } = mockElectron()
    const un = useRenderStore.getState().subscribeProgress()
    expect(typeof handlers.onProgress).toBe('function')
    handlers.onProgress({ status: 'progress', message: '50%', data: { progress: 50 } })
    expect(useRenderStore.getState().progress).toBe(50)
    handlers.onProgress({ status: 'complete', message: '完成' })
    expect(useRenderStore.getState().progress).toBe(100)
    handlers.onProgress({ status: 'info', data: {} })
    handlers.onProgress({ status: 'error', message: 'boom' })
    expect(useRenderStore.getState().errors).toContain('boom')
    handlers.onProgress({ status: 'start', message: 'start' })
    handlers.onProgress({ status: 'log', message: 'log' })
    handlers.onProgress({ status: 'success', message: 'ok' })
    expect(useRenderStore.getState().currentMessage).toBe('ok')
    un()
  })
})