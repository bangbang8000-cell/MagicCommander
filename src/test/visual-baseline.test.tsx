import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { SearchInput } from '@/components/ui/SearchInput'
import { Popover } from '@/components/ui/Popover'
import { ToastContainer, showToast } from '@/components/ui/Toast'
import { ContextMenu } from '@/components/ui/ContextMenu'
import { Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell } from '@/components/ui/Table'
import { Tabs } from '@/components/ui/Tabs'

/**
 * 4.1 V-3 组件视觉基线（关键组件 token 化断言）
 * 验证组件收敛到契约 token（无硬编码色值）：
 * - Button/Input/Select/Modal/Popover/Toast/ContextMenu/Table/Tabs
 */

const HARD_CODED_GRAY = [
  'bg-gray-100',
  'bg-gray-200',
  'bg-gray-50',
  'bg-gray-800',
  'border-gray-200',
  'border-gray-300',
  'border-gray-600',
  'border-gray-700',
  'text-gray-600',
  'text-gray-700',
  'text-gray-800',
  'text-gray-900',
]

function expectTokenized(className: string, label: string) {
  for (const hard of HARD_CODED_GRAY) {
    expect(className, `${label} 不应含硬编码 ${hard}`).not.toContain(hard)
  }
}

afterEach(() => {
  cleanup()
})

describe('V-3 Button 视觉基线', () => {
  it('primary 使用契约 token（bg-primary + radius-md + hover:primary-hover + focus ring）', () => {
    render(<Button>确定</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toHaveClass('bg-primary')
    expect(btn).toHaveClass('rounded-[var(--radius-md)]')
    expect(btn).toHaveClass('hover:bg-primary-hover')
    expect(btn).toHaveClass('focus:ring-focus')
    expectTokenized(btn.className, 'Button primary')
  })

  it('secondary 使用 surface/edge token', () => {
    render(<Button variant="secondary">次要</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toHaveClass('bg-app-surface')
    expect(btn).toHaveClass('border-edge-subtle')
    expect(btn).toHaveClass('hover:bg-app-hover')
    expectTokenized(btn.className, 'Button secondary')
  })

  it('danger 使用契约 danger token', () => {
    render(<Button variant="danger">删除</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toHaveClass('bg-danger')
    expect(btn).toHaveClass('hover:bg-danger-700')
    expectTokenized(btn.className, 'Button danger')
  })

  it('支持 sm/md/lg 尺寸', () => {
    const { rerender } = render(<Button size="sm">小</Button>)
    expect(screen.getByRole('button')).toHaveClass('px-2.5')
    rerender(<Button size="md">中</Button>)
    expect(screen.getByRole('button')).toHaveClass('px-3')
    rerender(<Button size="lg">大</Button>)
    expect(screen.getByRole('button')).toHaveClass('px-4')
  })
})

describe('V-3 Select / Input 视觉基线', () => {
  it('Select 使用 edge-subtle 边框 + app 表面 + focus ring', () => {
    render(<Select options={[{ value: 'a', label: 'A' }]} />)
    const select = screen.getByRole('combobox')
    expect(select).toHaveClass('border-edge-subtle')
    expect(select).toHaveClass('bg-app')
    expect(select).toHaveClass('focus:ring-focus')
    expectTokenized(select.className, 'Select')
  })

  it('SearchInput 使用 token 边框/文本', () => {
    render(<SearchInput value="" onChange={() => {}} />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('border-edge-subtle')
    expect(input).toHaveClass('bg-app-surface')
    expect(input).toHaveClass('text-text-primary')
    expect(input).toHaveClass('focus:ring-focus')
    expectTokenized(input.className, 'SearchInput')
  })
})

describe('V-3 Modal 视觉基线', () => {
  it('Modal 使用 radius-lg + shadow-lg + app 表面', () => {
    render(
      <Modal open onClose={() => {}} title="标题">
        内容
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('rounded-[var(--radius-lg)]')
    expect(dialog).toHaveClass('shadow-lg')
    expect(dialog).toHaveClass('bg-app')
    expectTokenized(dialog.className, 'Modal')
  })
})

describe('V-3 Popover / Toast / ContextMenu 视觉基线', () => {
  it('Popover 浮层使用 app 表面 + edge-subtle 边框', () => {
    const { container } = render(
      <Popover open onClose={() => {}}>
        面板
      </Popover>,
    )
    const pop = container.firstChild as HTMLElement
    expect(pop).toHaveClass('bg-app')
    expect(pop).toHaveClass('border-edge-subtle')
  })

  it('Toast 使用 app 表面 + shadow-lg（契约阴影）', () => {
    render(<ToastContainer />)
    act(() => {
      showToast('success', '保存成功')
    })
    const toast = screen.getByText('保存成功').parentElement
    expect(toast).toHaveClass('shadow-lg')
    expect(toast).toHaveClass('bg-app')
    expectTokenized(toast!.className, 'Toast')
  })

  it('ContextMenu 使用 app 表面 + 契约 token', () => {
    render(
      <ContextMenu items={[{ label: '复制', onClick: () => {} }]}>
        <div data-testid="trigger">目标</div>
      </ContextMenu>,
    )
    fireEvent.contextMenu(screen.getByTestId('trigger'))
    const menu = screen.getByText('复制').closest('.fixed') as HTMLElement
    expect(menu).toHaveClass('bg-app')
    expect(menu).toHaveClass('border-edge-subtle')
    expectTokenized(menu!.className, 'ContextMenu')
  })
})

describe('V-3 Table / Tabs 视觉基线', () => {
  it('Table 表头 app-surface、细分隔 edge-subtle、行 hover app-hover', () => {
    render(
      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>列A</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>值</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    expect(screen.getByText('列A').closest('thead')).toHaveClass('bg-app-surface')
    const cell = screen.getByText('值')
    expect(cell).toHaveClass('border-edge-subtle')
    expect(screen.getByText('值').parentElement).toHaveClass('hover:bg-app-hover')
  })

  it('Tabs active 使用 primary + 下划线', () => {
    render(
      <Tabs
        items={[
          { id: 'a', label: '标签A' },
          { id: 'b', label: '标签B' },
        ]}
        activeId="a"
        onChange={() => {}}
      />,
    )
    const active = screen.getByText('标签A')
    expect(active).toHaveClass('text-primary')
    expect(active).toHaveClass('after:bg-primary')
    const inactive = screen.getByText('标签B')
    expect(inactive).toHaveClass('text-text-secondary')
  })
})
