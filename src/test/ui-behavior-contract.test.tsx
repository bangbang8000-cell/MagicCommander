import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { Modal } from '@/components/ui/Modal'
import { Popover } from '@/components/ui/Popover'
import { ToastContainer, showToast } from '@/components/ui/Toast'
import { ContextMenu } from '@/components/ui/ContextMenu'
import { Select } from '@/components/ui/Select'

/**
 * 4.0 组件行为契约（G-8）
 * 行为基准：双端设计契约（打开/关闭/焦点/ESC 关闭/外部点击等核心行为）。
 * MC 端实现断言，防止行为漂移；缺口已最小侵入补齐。
 */

/** 等待组件内部的 setTimeout(0) 事件监听/焦点生效 */
async function flushTimers() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Modal 行为契约', () => {
  it('open=false 不渲染；open=true 渲染对话框', () => {
    const { rerender, container } = render(
      <Modal open={false} onClose={() => {}} title="标题">
        内容
      </Modal>,
    )
    expect(container.firstChild).toBeNull()
    rerender(
      <Modal open onClose={() => {}} title="标题">
        内容
      </Modal>,
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('标题')).toBeInTheDocument()
  })

  it('点击右上角关闭按钮触发 onClose', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="标题">
        内容
      </Modal>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('点击遮罩（外部）触发 onClose', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Modal open onClose={onClose} title="标题">
        内容
      </Modal>,
    )
    const overlay = container.firstChild as HTMLElement
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('点击对话框内部不触发 onClose', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="标题">
        内容
      </Modal>,
    )
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ESC 触发 onClose（默认开启）', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="标题">
        内容
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closeOnEsc=false 时 ESC 不触发 onClose', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="标题" closeOnEsc={false}>
        内容
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('打开后焦点移入对话框（焦点管理）', async () => {
    render(
      <Modal open onClose={() => {}} title="标题">
        <input data-testid="modal-input" />
      </Modal>,
    )
    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body)
    })
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })
})

describe('Popover 行为契约', () => {
  it('open=false 不渲染；open=true 渲染内容', () => {
    const { rerender, container } = render(
      <Popover open={false} onClose={() => {}}>
        面板
      </Popover>,
    )
    expect(container.firstChild).toBeNull()
    rerender(
      <Popover open onClose={() => {}}>
        面板
      </Popover>,
    )
    expect(screen.getByText('面板')).toBeInTheDocument()
  })

  it('点击外部关闭', async () => {
    const onClose = vi.fn()
    render(
      <Popover open onClose={onClose}>
        面板
      </Popover>,
    )
    await flushTimers()
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('点击内部不关闭', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <Popover open onClose={onClose}>
        面板
      </Popover>,
    )
    await flushTimers()
    fireEvent.mouseDown(container.firstChild as HTMLElement)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ESC 关闭', async () => {
    const onClose = vi.fn()
    render(
      <Popover open onClose={onClose}>
        面板
      </Popover>,
    )
    await flushTimers()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('Toast 行为契约', () => {
  it('showToast 显示提示', () => {
    render(<ToastContainer />)
    act(() => {
      showToast('success', '保存成功')
    })
    expect(screen.getByText('保存成功')).toBeInTheDocument()
  })

  it('点击关闭按钮移除提示', () => {
    render(<ToastContainer />)
    act(() => {
      showToast('info', '待关闭')
    })
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('待关闭')).not.toBeInTheDocument()
  })

  it('duration 后自动消失', () => {
    vi.useFakeTimers()
    render(<ToastContainer />)
    act(() => {
      showToast('success', '自动消失', 1000)
    })
    expect(screen.getByText('自动消失')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByText('自动消失')).not.toBeInTheDocument()
  })

  it('多个 toast 堆叠展示', () => {
    render(<ToastContainer />)
    act(() => {
      showToast('success', '提示A')
      showToast('error', '错误B')
    })
    expect(screen.getByText('提示A')).toBeInTheDocument()
    expect(screen.getByText('错误B')).toBeInTheDocument()
  })
})

describe('ContextMenu 行为契约', () => {
  const items = [
    { label: '复制', onClick: () => {} },
    { label: '删除', danger: true, onClick: () => {} },
  ]

  function renderMenu(onClick = () => {}) {
    return render(
      <ContextMenu items={[...items, { label: '点击项', onClick }]}>
        <div data-testid="trigger">目标区域</div>
      </ContextMenu>,
    )
  }

  it('右键打开菜单', () => {
    renderMenu()
    expect(screen.queryByText('复制')).not.toBeInTheDocument()
    fireEvent.contextMenu(screen.getByTestId('trigger'))
    expect(screen.getByText('复制')).toBeInTheDocument()
    expect(screen.getByText('删除')).toBeInTheDocument()
  })

  it('点击菜单项触发 onClick 并关闭菜单', () => {
    const onClick = vi.fn()
    renderMenu(onClick)
    fireEvent.contextMenu(screen.getByTestId('trigger'))
    fireEvent.click(screen.getByText('点击项'))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('点击项')).not.toBeInTheDocument()
  })

  it('点击外部关闭菜单', () => {
    renderMenu()
    fireEvent.contextMenu(screen.getByTestId('trigger'))
    expect(screen.getByText('复制')).toBeInTheDocument()
    fireEvent.click(document.body)
    expect(screen.queryByText('复制')).not.toBeInTheDocument()
  })

  it('ESC 关闭菜单', () => {
    renderMenu()
    fireEvent.contextMenu(screen.getByTestId('trigger'))
    expect(screen.getByText('复制')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('复制')).not.toBeInTheDocument()
  })
})

describe('Select 行为契约', () => {
  const options = [
    { value: 'a', label: '选项A' },
    { value: 'b', label: '选项B' },
  ]

  it('渲染全部选项', () => {
    render(<Select options={options} data-testid="select" />)
    const select = screen.getByTestId('select') as HTMLSelectElement
    expect(select.options).toHaveLength(2)
    expect(select.options[0].textContent).toBe('选项A')
    expect(select.options[0].value).toBe('a')
    expect(select.options[1].value).toBe('b')
  })

  it('受控 value + onChange 生效', () => {
    const onChange = vi.fn()
    const { rerender } = render(<Select options={options} value="a" onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    rerender(<Select options={options} value="b" onChange={onChange} />)
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('b')
  })

  it('disabled 生效', () => {
    render(<Select options={options} disabled />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})
