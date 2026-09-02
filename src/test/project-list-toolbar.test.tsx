/**
 * 4.8.0（F8-1 / 48-a）：项目列表工具栏 —— 导出/导入可移植项目包入口单测。
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@/i18n'
import { ProjectListToolbar } from '@/components/sidebar/project/ProjectListToolbar'

function baseProps(overrides: Partial<Parameters<typeof ProjectListToolbar>[0]> = {}) {
  return {
    search: '',
    sortBy: 'name' as const,
    canSaveTemplate: true,
    onSearchChange: vi.fn(),
    onToggleSort: vi.fn(),
    onCreate: vi.fn(),
    onSaveTemplate: vi.fn(),
    onImportAl: vi.fn(),
    onExportPackage: vi.fn(),
    onImportPackage: vi.fn(),
    ...overrides,
  }
}

describe('ProjectListToolbar（4.8.0 F8-1 项目包导出/导入入口）', () => {
  it('渲染导出/导入项目包按钮', () => {
    render(<ProjectListToolbar {...baseProps()} />)
    expect(screen.getByText('导出项目包')).toBeTruthy()
    expect(screen.getByText('导入项目包')).toBeTruthy()
  })

  it('点击导出项目包 → 回调 onExportPackage', () => {
    const props = baseProps()
    render(<ProjectListToolbar {...props} />)
    fireEvent.click(screen.getByText('导出项目包'))
    expect(props.onExportPackage).toHaveBeenCalledTimes(1)
  })

  it('点击导入项目包 → 回调 onImportPackage', () => {
    const props = baseProps()
    render(<ProjectListToolbar {...props} />)
    fireEvent.click(screen.getByText('导入项目包'))
    expect(props.onImportPackage).toHaveBeenCalledTimes(1)
  })

  it('未选项目时导出项目包按钮禁用', () => {
    render(<ProjectListToolbar {...baseProps({ canSaveTemplate: false })} />)
    expect((screen.getByText('导出项目包') as HTMLButtonElement).disabled).toBe(true)
  })
})
