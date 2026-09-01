/**
 * 4.4 F4-5（测试计划 E-5）：命令面板命令全集
 *
 * 覆盖：
 * - buildRenderCommands / buildExportCommands：当前 + 批量
 * - buildRecentCommands / buildFavoriteCommands：最近/收藏
 * - buildPipelineCommands：一键管线
 * - buildSettingsCommands：设置全集
 * - buildTerminalCommands：终端命令全集
 * - 全集聚合（buildAllCommands）覆盖主要操作
 */
import { describe, it, expect, vi } from 'vitest'
import {
  createCommand,
  buildRenderCommands,
  buildExportCommands,
  buildRecentCommands,
  buildFavoriteCommands,
  buildPipelineCommands,
  buildSettingsCommands,
  buildTerminalCommands,
  buildProjectCommands,
  buildTemplateCommands,
  buildBatchRenderCommands,
  buildBatchExportCommands,
} from '@/components/ui/CommandPalette'

describe('E-5 渲染 / 导出命令', () => {
  it('buildRenderCommands 覆盖当前项目（project/yaml/sn）+ 所选批量', () => {
    const onRender = vi.fn()
    const items = buildRenderCommands(onRender, 3)
    const labels = items.map((i) => i.label)
    expect(labels).toContain('渲染当前项目')
    expect(labels).toContain('YAML 输出当前项目')
    expect(labels).toContain('SN 模式渲染当前项目')
    expect(labels).toContain('批量渲染所选 3 个项目')
    const batch = items.find((i) => i.id === 'renderBatch')
    batch!.action()
    expect(onRender).toHaveBeenCalledWith('project')
  })

  it('buildExportCommands 覆盖当前 + 批量导出', () => {
    const onExport = vi.fn()
    const items = buildExportCommands(onExport, 2)
    expect(items.map((i) => i.label)).toContain('导出当前项目')
    expect(items.map((i) => i.label)).toContain('批量导出所选 2 个项目')
    const current = items.find((i) => i.id === 'exportCurrent')
    expect(current?.shortcut).toBe('Ctrl+E')
  })
})

describe('E-5 最近使用 / 收藏命令', () => {
  it('buildRecentCommands 生成最近项目命令（动作带项目名）', () => {
    const onOpen = vi.fn()
    const items = buildRecentCommands(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], onOpen)
    expect(items).toHaveLength(5)
    expect(items[0].category).toBe('最近使用')
    items[0].action()
    expect(onOpen).toHaveBeenCalledWith('p1')
  })

  it('buildFavoriteCommands 生成收藏命令', () => {
    const onOpen = vi.fn()
    const items = buildFavoriteCommands(['fav1', 'fav2'], onOpen)
    expect(items.map((i) => i.label)).toEqual(['fav1', 'fav2'])
    items[1].action()
    expect(onOpen).toHaveBeenCalledWith('fav2')
  })
})

describe('E-5 一键管线 / 设置 / 终端命令', () => {
  it('buildPipelineCommands 覆盖规划管线与模板批处理', () => {
    const onPlan = vi.fn()
    const onTemplate = vi.fn()
    const items = buildPipelineCommands(onPlan, onTemplate)
    expect(items.map((i) => i.category)).toEqual(['一键管线', '一键管线'])
    items[0].action()
    items[1].action()
    expect(onPlan).toHaveBeenCalled()
    expect(onTemplate).toHaveBeenCalled()
  })

  it('buildSettingsCommands 覆盖设置全集', () => {
    const onOpen = vi.fn()
    const items = buildSettingsCommands(onOpen)
    expect(items.length).toBeGreaterThanOrEqual(4)
    expect(items[0].shortcut).toBe('Ctrl+,')
  })

  it('buildTerminalCommands 覆盖终端命令全集（terminal 文本可转发执行）', () => {
    const items = buildTerminalCommands()
    const terminals = items.map((i) => i.terminal)
    expect(terminals).toContain('help')
    expect(terminals).toContain('list projects')
    expect(terminals).toContain('export projects <ids>')
    expect(terminals).toContain('batch render <ids>')
    expect(terminals).toContain('clear')
    expect(items.every((i) => i.terminal)).toBe(true)
  })
})

describe('E-5 命令全集聚合（主要操作全覆盖）', () => {
  it('聚合全部构建器应覆盖项目/模板/渲染/导出/批量/管线/最近收藏/设置/终端', () => {
    const all: Array<{ id: string; category: string }> = [
      ...buildProjectCommands(),
      ...buildTemplateCommands(),
      ...buildRenderCommands(vi.fn(), 2),
      ...buildExportCommands(vi.fn(), 2),
      ...buildBatchRenderCommands(['1']),
      ...buildBatchExportCommands(['1']),
      ...buildRecentCommands(['r1'], vi.fn()),
      ...buildFavoriteCommands(['f1'], vi.fn()),
      ...buildPipelineCommands(vi.fn(), vi.fn()),
      ...buildSettingsCommands(vi.fn()),
      ...buildTerminalCommands(),
    ]
    const categories = new Set(all.map((i) => i.category))
    for (const expected of [
      '项目操作',
      '模板操作',
      '渲染',
      '导出',
      '批量操作',
      '最近使用',
      '收藏',
      '一键管线',
      '设置',
      '终端',
    ]) {
      expect(categories.has(expected), `缺少命令类别: ${expected}`).toBe(true)
    }
    expect(all.length).toBeGreaterThan(25)
  })

  it('createCommand 生成带 action 的命令项', () => {
    const action = vi.fn()
    const item = createCommand('x', '标签', '测试', undefined, action)
    expect(item.action).toBe(action)
    expect(item.terminal).toBeUndefined()
  })
})
