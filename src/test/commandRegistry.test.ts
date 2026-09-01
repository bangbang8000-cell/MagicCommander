/**
 * 4.3 F3-1b（测试计划 A-2）：MC 批量 AI 操作命令化
 *
 * 覆盖：
 * - 批量导出命令 `export`（多项目/当前选中项目回退/目录选项/成功反馈）
 * - 模板操作命令 `template preview`（预览）/ `template create`（基于模板创建）
 * - 批量统一入口 `batch`（render/export/select 转发）
 * - 命令执行有反馈：成功 success 日志、失败 error 日志
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  executeCommand,
  commands,
  type CommandContext,
  type LogLevel,
  type TerminalOutputKind,
} from '@/components/terminal/commandRegistry'
import { useProjectStore } from '@/stores/project.store'

function makeCtx() {
  const logs: Array<{ level: LogLevel; msg: string }> = []
  const ctx: CommandContext = {
    addLog: (level, msg, _kind?: TerminalOutputKind) => {
      logs.push({ level, msg })
    },
    toggleDark: () => {},
    setTheme: () => {},
    clearTerminal: () => {},
    selectProject: () => {},
  }
  return { ctx, logs }
}

function mockElectron(partial: Record<string, unknown>) {
  const base = (window.electron as unknown as Record<string, unknown>) ?? {}
  ;(window.electron as unknown as Record<string, unknown>) = { ...base, ...partial }
}

function resetStore() {
  useProjectStore.setState({ projects: [], selectedProject: null })
  vi.unstubAllGlobals()
}

beforeEach(() => {
  resetStore()
  mockElectron({
    output: {
      export: vi.fn().mockResolvedValue('D:/exports/projA.zip'),
    },
    render: {
      project: vi.fn().mockResolvedValue(undefined),
    },
    project: {
      list: vi.fn().mockResolvedValue([
        { id: 1, name: 'projA', index: 0 },
        { id: 2, name: 'projB', index: 1 },
      ]),
      templatePreview: vi.fn().mockResolvedValue({ results: [{ project: 'projA', device: 'ASW-1', content: '...' }] }),
      create: vi.fn().mockResolvedValue(undefined),
    },
  })
})

// ===== 命令注册 =====

describe('批量命令注册', () => {
  it('批量命令已注册（export / batch / template 子命令）', () => {
    expect(commands.export).toBeDefined()
    expect(commands.batch).toBeDefined()
    expect(commands.template).toBeDefined()
  })
})

// ===== export 批量导出 =====

describe('export 批量导出', () => {
  it('export projects <ids> 批量导出并输出成功反馈（含导出路径）', async () => {
    const { ctx, logs } = makeCtx()
    const exportSpy = vi.fn().mockResolvedValue('D:/exports/projA.zip')
    mockElectron({ output: { export: exportSpy } })
    await executeCommand('export projects 1,2', ctx)
    expect(exportSpy).toHaveBeenCalledTimes(2)
    expect(exportSpy).toHaveBeenCalledWith('projA', 'zip')
    expect(exportSpy).toHaveBeenCalledWith('projB', 'zip')
    expect(logs.some((l) => l.level === 'success' && l.msg.includes('导出'))).toBe(true)
  })

  it('export 不带 ids 时回退到当前选中项目', async () => {
    useProjectStore.setState({
      projects: [{ id: 9, name: 'selProj', index: 0 }],
      selectedProject: { id: 9, name: 'selProj', index: 0 },
    })
    const { ctx, logs } = makeCtx()
    const exportSpy = vi.fn().mockResolvedValue('D:/exports/selProj.zip')
    mockElectron({ output: { export: exportSpy } })
    await executeCommand('export', ctx)
    expect(exportSpy).toHaveBeenCalledWith('selProj', 'zip')
    expect(logs.some((l) => l.level === 'success')).toBe(true)
  })

  it('export 无项目时输出错误反馈', async () => {
    mockElectron({ project: { list: vi.fn().mockResolvedValue([]) } })
    const { ctx, logs } = makeCtx()
    await executeCommand('export', ctx)
    expect(logs.some((l) => l.level === 'error')).toBe(true)
  })

  it('export 失败时输出 error 反馈', async () => {
    const exportSpy = vi.fn().mockRejectedValue(new Error('导出失败原因'))
    mockElectron({ output: { export: exportSpy } })
    const { ctx, logs } = makeCtx()
    await executeCommand('export projects 1', ctx)
    expect(logs.some((l) => l.level === 'error' && l.msg.includes('导出失败原因'))).toBe(true)
  })
})

// ===== template preview / create（基于模板创建）=====

describe('template 批量操作子命令', () => {
  it('template preview <projectId> <templatePath> 预览并输出反馈', async () => {
    const { ctx, logs } = makeCtx()
    const previewSpy = vi.fn().mockResolvedValue({ results: [{ project: 'projA', device: 'ASW-1', content: 'x' }] })
    mockElectron({ project: { templatePreview: previewSpy } })
    await executeCommand('template preview 1 templates/ASW.j2', ctx)
    expect(previewSpy).toHaveBeenCalledWith('1', 'templates/ASW.j2')
    expect(logs.some((l) => l.level === 'success' && l.msg.includes('预览'))).toBe(true)
  })

  it('template create <name> --template <tpl> 基于模板创建并输出反馈', async () => {
    const { ctx, logs } = makeCtx()
    const createSpy = vi.fn().mockResolvedValue(undefined)
    mockElectron({ project: { create: createSpy } })
    await executeCommand('template create newProj --template example1', ctx)
    expect(createSpy).toHaveBeenCalledWith('newProj', { template: 'example1' })
    expect(logs.some((l) => l.level === 'success' && l.msg.includes('newProj'))).toBe(true)
  })
})

// ===== batch 批量统一入口 =====

describe('batch 批量统一入口', () => {
  it('batch render <ids> 转发到 render 命令并输出反馈', async () => {
    const { ctx, logs } = makeCtx()
    const renderSpy = vi.fn().mockResolvedValue(undefined)
    mockElectron({ render: { project: renderSpy } })
    await executeCommand('batch render 1,2', ctx)
    expect(renderSpy).toHaveBeenCalledWith(['1', '2'])
    expect(logs.some((l) => l.level === 'success' && l.msg.includes('渲染'))).toBe(true)
  })

  it('batch export <ids> 转发到 export 命令', async () => {
    const { ctx } = makeCtx()
    const exportSpy = vi.fn().mockResolvedValue('D:/exports/projA.zip')
    mockElectron({ output: { export: exportSpy } })
    await executeCommand('batch export 1', ctx)
    expect(exportSpy).toHaveBeenCalledWith('projA', 'zip')
  })

  it('batch 未知子命令输出 error 反馈', async () => {
    const { ctx, logs } = makeCtx()
    await executeCommand('batch nonsense', ctx)
    expect(logs.some((l) => l.level === 'error')).toBe(true)
  })
})
