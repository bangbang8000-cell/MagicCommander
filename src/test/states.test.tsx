import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import '@/i18n'
import { EmptyState as UiEmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { EmptyState, ErrorState, NoPermissionState } from '@/components/common/EmptyState'

/**
 * 4.1 V-5 空态 / 加载 / 错误态统一（契约 token 驱动）
 */

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('V-5 空态 EmptyState', () => {
  it('ui EmptyState 渲染 图标 + 主文案 + 次文案 + 操作', () => {
    render(
      <UiEmptyState
        icon={<span data-testid="icon">📭</span>}
        title="暂无项目"
        description="创建第一个项目开始使用"
        action={<button>新建</button>}
      />,
    )
    expect(screen.getByTestId('icon')).toBeInTheDocument()
    expect(screen.getByText('暂无项目')).toBeInTheDocument()
    expect(screen.getByText('创建第一个项目开始使用')).toBeInTheDocument()
    expect(screen.getByText('新建')).toBeInTheDocument()
  })

  it('common EmptyState 使用 token 类', () => {
    render(<EmptyState type="general" />)
    const title = screen.getByRole('heading')
    expect(title).toHaveClass('text-text-primary')
  })
})

describe('V-5 加载 LoadingState', () => {
  it('spinner 变体显示加载文案与 primary 指示', () => {
    render(<LoadingState variant="spinner" text="加载中..." />)
    expect(screen.getByText('加载中...')).toBeInTheDocument()
    const spinner = screen.getByText('加载中...').previousElementSibling
    expect(spinner).toHaveClass('text-primary')
    expect(spinner).toHaveClass('animate-spin')
  })

  it('skeleton 变体渲染占位行', () => {
    render(<LoadingState variant="skeleton" lines={3} />)
    const blocks = document.querySelectorAll('.animate-pulse')
    expect(blocks.length).toBe(3)
  })

  it('inline 变体渲染行内加载', () => {
    render(<LoadingState variant="inline" text="同步中" />)
    expect(screen.getByText('同步中')).toBeInTheDocument()
  })
})

describe('V-5 错误态 ErrorState', () => {
  it('渲染 标题 + 错误消息 + 重试按钮', () => {
    render(<ErrorState title="加载失败" message="网络异常" onRetry={() => {}} />)
    expect(screen.getByText('加载失败')).toBeInTheDocument()
    expect(screen.getByText('网络异常')).toBeInTheDocument()
    expect(screen.getByText('重新加载')).toBeInTheDocument()
  })

  it('点击重试触发 onRetry', () => {
    const onRetry = vi.fn()
    render(<ErrorState title="加载失败" message="网络异常" onRetry={onRetry} />)
    fireEvent.click(screen.getByText('重新加载'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('错误图标使用 danger token', () => {
    render(<ErrorState title="加载失败" message="网络异常" />)
    const icon = document.querySelector('.text-danger')
    expect(icon).not.toBeNull()
  })
})

describe('V-5 无权限 NoPermissionState', () => {
  it('渲染标题与消息', () => {
    render(<NoPermissionState />)
    expect(screen.getByRole('heading')).toBeInTheDocument()
  })
})
