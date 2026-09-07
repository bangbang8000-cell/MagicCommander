/**
 * MC：终端命令注册表（commandRegistry）命令执行测试
 * 覆盖 parseInput / executeCommand / commands 主要命令分支
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseInput, executeCommand } from '@/components/terminal/commandRegistry'
import type { CommandContext } from '@/components/terminal/commandRegistry'
import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'

function makeCtx() {
  return {
    addLog: vi.fn(),
    toggleDark: vi.fn(),
    setTheme: vi.fn(),
    clearTerminal: vi.fn(),
    selectProject: vi.fn(),
  } as unknown as CommandContext
}

const electronProjectMock = {
  list: vi.fn().mockResolvedValue([]),
  listExamples: vi.fn().mockResolvedValue(['ex1', 'ex2']),
  listTemplates: vi.fn().mockResolvedValue([{ name: 't1', id: 't1' }]),
  create: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('# 文件内容'),
  deleteTemplate: vi.fn().mockResolvedValue(undefined),
}
const electronDeleteMock = {
  output: vi.fn().mockResolvedValue(undefined),
  outputSn: vi.fn().mockResolvedValue(undefined),
  yaml: vi.fn().mockResolvedValue(undefined),
  yamlSn: vi.fn().mockResolvedValue(undefined),
}

beforeEach(() => {
  ;(window.electron as unknown as Record<string, unknown>).project = electronProjectMock
  ;(window.electron as unknown as Record<string, unknown>).delete = electronDeleteMock
  useProjectStore.setState({ projects: [], selectedProject: null } as never)
  useUIStore.setState({ isDark: false } as never)
  for (const m of Object.values(electronProjectMock)) m.mockClear()
  for (const m of Object.values(electronDeleteMock)) m.mockClear()
})

describe('parseInput', () => {
  it('空输入返回空命令', () => {
    expect(parseInput('')).toEqual({ cmd: '', args: [] })
    expect(parseInput('   ')).toEqual({ cmd: '', args: [] })
  })

  it('普通输入拆分命令与参数', () => {
    expect(parseInput('help')).toEqual({ cmd: 'help', args: [] })
    expect(parseInput('render project1 --full')).toEqual({ cmd: 'render', args: ['project1', '--full'] })
  })
})

describe('executeCommand 基础', () => {
  it('空输入为 no-op', async () => {
    const ctx = makeCtx()
    await executeCommand('', ctx)
    expect(ctx.addLog).not.toHaveBeenCalled()
  })

  it('未知命令输出错误提示', async () => {
    const ctx = makeCtx()
    await executeCommand('nosuchcmd', ctx)
    expect(ctx.addLog).toHaveBeenCalledWith('error', expect.stringContaining('未知命令'))
  })

  it('help 输出帮助行（含 cli 子主题）', async () => {
    const ctx = makeCtx()
    await executeCommand('help', ctx)
    expect(ctx.addLog).toHaveBeenCalled()
    await executeCommand('help cli', ctx)
    expect(ctx.addLog).toHaveBeenCalled()
  })

  it('version / ver 输出版本', async () => {
    const ctx = makeCtx()
    await executeCommand('version', ctx)
    expect(ctx.addLog).toHaveBeenCalledWith('success', expect.stringContaining('MagicCommander'))
    await executeCommand('ver', ctx)
    expect(ctx.addLog).toHaveBeenCalledWith('success', expect.stringContaining('MagicCommander'))
  })

  it('clear / cls 清屏', async () => {
    const ctx = makeCtx()
    await executeCommand('clear', ctx)
    expect(ctx.clearTerminal).toHaveBeenCalled()
    await executeCommand('cls', ctx)
    expect(ctx.clearTerminal).toHaveBeenCalled()
  })

  it('echo 拼接输出', async () => {
    const ctx = makeCtx()
    await executeCommand('echo hello world', ctx)
    expect(ctx.addLog).toHaveBeenCalledWith('info', 'hello world')
  })
})

describe('theme 命令', () => {
  it('无参数切换主题', async () => {
    const ctx = makeCtx()
    await executeCommand('theme', ctx)
    expect(ctx.toggleDark).toHaveBeenCalled()
    expect(ctx.addLog).toHaveBeenCalledWith('success', expect.stringContaining('主题'))
  })

  it('light/dark 显式设置', async () => {
    const ctx = makeCtx()
    await executeCommand('theme dark', ctx)
    expect(ctx.setTheme).toHaveBeenCalledWith('dark')
    await executeCommand('theme light', ctx)
    expect(ctx.setTheme).toHaveBeenCalledWith('light')
  })

  it('非法主题报错', async () => {
    const ctx = makeCtx()
    await executeCommand('theme bogus', ctx)
    expect(ctx.addLog).toHaveBeenCalledWith('error', expect.stringContaining('未知主题'))
  })
})

describe('list 命令', () => {
  it('本地有项目时直接列出', async () => {
    useProjectStore.setState({ projects: [{ id: 1, name: 'p1' }] } as never)
    const ctx = makeCtx()
    await executeCommand('list', ctx)
    expect(ctx.addLog).toHaveBeenCalledWith('info', expect.stringContaining('项目列表'))
  })

  it('本地无项目时走 Electron 列表', async () => {
    electronProjectMock.list.mockResolvedValueOnce([{ id: 2, name: 'p2' }])
    const ctx = makeCtx()
    await executeCommand('list', ctx)
    expect(ctx.addLog).toHaveBeenCalledWith('info', expect.stringContaining('项目列表'))
  })

  it('list examples / templates', async () => {
    const ctx = makeCtx()
    await executeCommand('list examples', ctx)
    expect(ctx.addLog).toHaveBeenCalledWith('info', expect.stringContaining('示例模板'))
    await executeCommand('list templates', ctx)
    expect(ctx.addLog).toHaveBeenCalledWith('info', expect.stringContaining('模板'))
  })

  it('未知参数报错', async () => {
    const ctx = makeCtx()
    await executeCommand('list bogus', ctx)
    expect(ctx.addLog).toHaveBeenCalledWith('error', expect.stringContaining('未知参数'))
  })
})

describe('create / select / delete 命令', () => {
  it('create 无参数输出用法', async () => {
    const ctx = makeCtx()
    await executeCommand('create', ctx)
    expect(ctx.addLog).toHaveBeenCalledWith('error', expect.stringContaining('用法'))
  })

  it('create 带选项调用 Electron 创建', async () => {
    const ctx = makeCtx()
    await executeCommand('create demo --empty --template t1', ctx)
    expect(electronProjectMock.create).toHaveBeenCalledWith('demo', { empty: true, template: 't1' })
    expect(ctx.addLog).toHaveBeenCalledWith('success', expect.stringContaining('创建成功'))
  })

  it('create 失败输出错误', async () => {
    electronProjectMock.create.mockRejectedValueOnce(new Error('磁盘满'))
    const ctx = makeCtx()
    await executeCommand('create demo', ctx)
    expect(ctx.addLog).toHaveBeenCalledWith('error', expect.stringContaining('创建失败'))
  })

  it('select 本地项目', async () => {
    useProjectStore.setState({ projects: [{ id: 1, name: 'p1' }] } as never)
    const ctx = makeCtx()
    await executeCommand('select p1', ctx)
    expect(ctx.selectProject).toHaveBeenCalledWith('p1')
  })

  it('select 不存在项目报错', async () => {
    const ctx = makeCtx()
    await executeCommand('select nope', ctx)
    expect(ctx.addLog).toHaveBeenCalledWith('error', expect.stringContaining('不存在'))
  })

  it('delete project 删除项目', async () => {
    const ctx = makeCtx()
    await executeCommand('delete project 5', ctx)
    expect(electronProjectMock.delete).toHaveBeenCalledWith(['5'])
  })

  it('delete output 删除输出', async () => {
    const ctx = makeCtx()
    await executeCommand('delete output 1,2', ctx)
    expect(electronDeleteMock.output).toHaveBeenCalledWith(['1', '2'])
  })

  it('delete 未知类型报错', async () => {
    const ctx = makeCtx()
    await executeCommand('delete bogus', ctx)
    expect(ctx.addLog).toHaveBeenCalledWith('error', expect.stringContaining('未知删除类型'))
  })
})

describe('read / cat 命令', () => {
  it('read 读取项目文件', async () => {
    useProjectStore.setState({ projects: [{ id: 1, name: 'p1' }], selectedProject: { id: 1, name: 'p1' } } as never)
    const ctx = makeCtx()
    await executeCommand('read p1 docs/a.md', ctx)
    expect(electronProjectMock.readFile).toHaveBeenCalledWith(1, 'docs/a.md')
  })

  it('read 项目不存在报错', async () => {
    const ctx = makeCtx()
    await executeCommand('read nope docs/a.md', ctx)
    expect(ctx.addLog).toHaveBeenCalledWith('error', expect.stringContaining('不存在'))
  })
})
