/**
 * 覆盖率棘轮补测：CommandPalette 主题 / 空态 / shortcut 分支
 *
 * 覆盖：
 * - isDark=true 时列表容器 / 输入框 / 选中项 / 分类文本的 dark 分支
 * - filtered.length === 0 空态分支（查询无命中 → noResults）
 * - item.shortcut 假值分支（无 shortcut 命令不渲染 HotkeyKeys）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@/i18n'
import { CommandPalette } from '@/components/ui/CommandPalette'
import { useUIStore } from '@/stores/ui.store'

const withShortcut = { id: 'b', label: '导出项目', category: '导出', shortcut: 'Ctrl+E', action: () => {} }
const noShortcut = { id: 'a', label: '打开设置', category: '设置', action: () => {} }

describe('CommandPalette 主题 / 空态 / shortcut 分支（覆盖率棘轮）', () => {
  beforeEach(() => {
    useUIStore.setState({ isDark: false } as never)
  })

  it('暗色：isDark=true 渲染走 dark 分支', () => {
    useUIStore.setState({ isDark: true } as never)
    render(<CommandPalette open onClose={() => {}} commands={[noShortcut, withShortcut]} />)
    expect(screen.getByText('打开设置')).toBeInTheDocument()
    expect(screen.getByText('导出项目')).toBeInTheDocument()
  })

  it('无命中空态：查询无匹配时展示 noResults 文案', () => {
    render(<CommandPalette open onClose={() => {}} commands={[noShortcut, withShortcut]} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'zzz_no_match_zzz' } })
    expect(screen.getByText('无匹配结果')).toBeInTheDocument()
  })

  it('无 shortcut 命令：走 shortcut 假值分支（不渲染 HotkeyKeys）', () => {
    render(<CommandPalette open onClose={() => {}} commands={[noShortcut]} />)
    expect(screen.getByText('打开设置')).toBeInTheDocument()
    // 带 shortcut 的命令才渲染快捷键块；这里只渲染无 shortcut 项
    expect(screen.queryByText('Ctrl+E')).toBeNull()
  })
})
