/**
 * 4.2.0-42-d（F2-4 / S-5）：Excel 大参数表虚拟化 单测（TDD）
 * - V-1 大数据量（万行）仅渲染可见区域：DOM 行数远小于数据行数（证明虚拟化生效）
 * - V-2 点击单元格回调（onCellClick(row, col, value)）
 * - V-3 编辑态单元格渲染输入框
 *
 * jsdom 无布局：@tanstack/react-virtual 通过 scrollElement.offsetHeight/offsetWidth
 * 计算视口尺寸，故在测试中对 HTMLElement.prototype 提供固定 600px 视口。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { VirtualizedExcelTable, EXCEL_ROW_HEIGHT } from '@/components/editor/VirtualizedExcelTable'

/** jsdom 无布局：为虚拟化滚动容器提供视口尺寸（高 600px ≈ 25 行 + overscan） */
function stubScrollViewport() {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 600 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 600 })
}

/** 恢复默认 offsetHeight/offsetWidth（0） */
function restoreScrollViewport() {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 0 })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 0 })
}

beforeEach(() => {
  stubScrollViewport()
})

afterEach(() => {
  cleanup()
  restoreScrollViewport()
  vi.restoreAllMocks()
})

const baseProps = {
  editCell: null,
  editValue: '',
  isDark: false,
  onCellSave: () => {},
  onCellKeyDown: () => {},
  onEditValueChange: () => {},
}

describe('VirtualizedExcelTable（V-1 虚拟化）', () => {
  it('万行数据仅渲染可见区域（DOM 行数远小于数据行数）', () => {
    const sheet = {
      name: 'S',
      headers: ['a', 'b'],
      rows: Array.from({ length: 10000 }, (_, i) => ({ a: `a${i}`, b: i })),
    }
    const { container } = render(<VirtualizedExcelTable {...baseProps} sheet={sheet} onCellClick={() => {}} />)
    const rows = container.querySelectorAll('[data-index]')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThan(200) // 远小于 10000，证明只渲染窗口内行
    expect(container.querySelectorAll('span').length).toBeGreaterThan(0)
  })

  it('表头渲染列名', () => {
    const sheet = { name: 'S', headers: ['参数名', '参数值'], rows: [{ 参数名: 'a', 参数值: '1' }] }
    render(<VirtualizedExcelTable {...baseProps} sheet={sheet} onCellClick={() => {}} />)
    expect(screen.getByText('参数名')).toBeTruthy()
    expect(screen.getByText('参数值')).toBeTruthy()
  })
})

describe('VirtualizedExcelTable（V-2/V-3 交互）', () => {
  it('点击单元格回调 onCellClick(row, col, value)', () => {
    const onCellClick = vi.fn()
    const sheet = { name: 'S', headers: ['a'], rows: [{ a: 'x' }] }
    render(<VirtualizedExcelTable {...baseProps} sheet={sheet} onCellClick={onCellClick} />)
    fireEvent.click(screen.getByText('x'))
    expect(onCellClick).toHaveBeenCalledWith(0, 0, 'x')
  })

  it('编辑态单元格渲染输入框且受控', () => {
    const onEditValueChange = vi.fn()
    const sheet = { name: 'S', headers: ['a'], rows: [{ a: 'x' }] }
    render(
      <VirtualizedExcelTable
        {...baseProps}
        sheet={sheet}
        editCell={{ row: 0, col: 0 }}
        editValue="new"
        onCellClick={() => {}}
        onEditValueChange={onEditValueChange}
      />,
    )
    const input = screen.getByDisplayValue('new') as HTMLInputElement
    expect(input).toBeTruthy()
    fireEvent.change(input, { target: { value: 'new2' } })
    expect(onEditValueChange).toHaveBeenCalledWith('new2')
  })

  it('行高常量导出供虚拟列表使用', () => {
    expect(EXCEL_ROW_HEIGHT).toBeGreaterThan(0)
  })
})
