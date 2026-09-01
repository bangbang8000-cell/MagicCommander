/**
 * 4.3 F3-1b（测试计划 A-2）：CommandPalette 批量命令扩展
 *
 * 覆盖：
 * - buildBatchRenderCommands / buildBatchExportCommands：生成批量命令项（terminal 文本）
 * - buildProjectCommands / buildTemplateCommands：项目/模板操作命令项
 * - 执行带 terminal 的命令项 → 调用 onTerminalCommand（交终端执行，命令执行有反馈）
 * - 执行无 terminal 的命令项 → 走原 action
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  CommandPalette,
  buildBatchRenderCommands,
  buildBatchExportCommands,
  buildProjectCommands,
  buildTemplateCommands,
} from '@/components/ui/CommandPalette'

describe('批量命令构建器', () => {
  it('buildBatchRenderCommands 生成批量渲染命令（含 terminal 文本）', () => {
    const items = buildBatchRenderCommands(['1', '2'])
    expect(items).toHaveLength(2)
    expect(items[0].terminal).toBe('render project 1,2')
    expect(items[0].category).toBe('批量操作')
    expect(items[0].label).toContain('2 个项目')
    expect(items[1].terminal).toBe('render yaml 1,2')
  })

  it('buildBatchRenderCommands 空 ids 返回空数组', () => {
    expect(buildBatchRenderCommands([])).toEqual([])
  })

  it('buildBatchExportCommands 生成批量导出命令', () => {
    const items = buildBatchExportCommands(['3', '4'])
    expect(items).toHaveLength(1)
    expect(items[0].terminal).toBe('export projects 3,4')
  })

  it('buildProjectCommands 生成项目操作命令', () => {
    const items = buildProjectCommands()
    const terminals = items.map((i) => i.terminal)
    expect(terminals).toContain('create <项目名> --template <模板名>')
    expect(terminals).toContain('delete project <id>')
    expect(terminals).toContain('list projects')
  })

  it('buildTemplateCommands 生成模板操作命令', () => {
    const items = buildTemplateCommands()
    const terminals = items.map((i) => i.terminal)
    expect(terminals).toContain('template preview <项目ID> <模板路径>')
    expect(terminals).toContain('template create <项目名> --template <模板名>')
    expect(terminals).toContain('template list')
  })
})

describe('CommandPalette 批量命令执行', () => {
  it('执行带 terminal 的命令项 → 调用 onTerminalCommand（交终端批量执行）', () => {
    const onTerminalCommand = vi.fn()
    const commands = buildBatchRenderCommands(['1', '2'])
    render(<CommandPalette open onClose={() => {}} commands={commands} onTerminalCommand={onTerminalCommand} />)
    const item = screen.getByText(/批量渲染 2 个项目/)
    fireEvent.click(item)
    expect(onTerminalCommand).toHaveBeenCalledWith('render project 1,2')
  })

  it('执行无 terminal 的命令项 → 走原 action（不调用 onTerminalCommand）', () => {
    const action = vi.fn()
    const onTerminalCommand = vi.fn()
    const commands = [{ id: 'plain', label: '普通命令', category: '测试', action }]
    render(<CommandPalette open onClose={() => {}} commands={commands} onTerminalCommand={onTerminalCommand} />)
    fireEvent.click(screen.getByText('普通命令'))
    expect(action).toHaveBeenCalled()
    expect(onTerminalCommand).not.toHaveBeenCalled()
  })

  it('批量导出命令可经 onTerminalCommand 转发', () => {
    const onTerminalCommand = vi.fn()
    render(
      <CommandPalette
        open
        onClose={() => {}}
        commands={buildBatchExportCommands(['5'])}
        onTerminalCommand={onTerminalCommand}
      />,
    )
    fireEvent.click(screen.getByText(/批量导出 1 个项目/))
    expect(onTerminalCommand).toHaveBeenCalledWith('export projects 5')
  })
})
