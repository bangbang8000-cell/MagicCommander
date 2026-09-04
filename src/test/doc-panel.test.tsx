/**
 * 5.0.5-505-a：文档工作台（DocPanel）前端单测
 * - 三页签渲染（文档/指南/知识库）
 * - 生成产物列表（doc.list → 时间/类型/状态）
 * - 一键生成评审报告（doc.generate review）
 * - 导出评审包 / 评审 PDF（复用 project.exportReviewPackage/Pdf）
 * - 指南页加载 guide.getContent
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { DocPanel } from '@/components/sidebar/DocPanel'
import { ToastContainer } from '@/components/ui/Toast'
import { useProjectStore } from '@/stores/project.store'
import { useUIStore } from '@/stores/ui.store'
import '@/i18n'

function mockElectron() {
  ;(globalThis as unknown as { window: { electron: Record<string, unknown> } }).window.electron = {
    doc: {
      list: vi.fn(async () => ({
        status: 'success',
        docsDir: '/workspace/docs',
        artifacts: [
          {
            name: 'demo-review-2026-09-04-10-00-00.md',
            path: '/workspace/docs/demo-review-2026-09-04-10-00-00.md',
            type: 'review',
            project: 'demo',
            size: 2048,
            mtime: '2026-09-04T10:00:00.000Z',
            status: 'ready',
          },
        ],
      })),
      generate: vi.fn(async () => ({
        status: 'success',
        data: { kind: 'review', path: '/workspace/docs/demo-review.md', project: 'demo' },
      })),
      openDir: vi.fn(async () => ({ status: 'success', path: '/workspace/docs' })),
    },
    project: {
      exportReviewPackage: vi.fn(async () => ({
        status: 'success',
        data: { path: '/tmp/review.zip', project: 'demo' },
      })),
      exportReviewPdf: vi.fn(async () => ({
        status: 'success',
        data: { path: '/tmp/review.pdf', project: 'demo' },
      })),
    },
    guide: {
      getContent: vi.fn(async () => ({
        content: '# 用户指南\n\n欢迎使用 MagicCommander',
        usedFallback: false,
        requestedLang: 'zh-CN',
      })),
    },
    shell: { showItemInFolder: vi.fn(async () => {}) },
    aihub: {
      knowledgeList: vi.fn(async () => ({ status: 'ok', entries: [], total: 0 })),
      knowledgeSearch: vi.fn(async () => ({ status: 'ok', hits: [], total: 0 })),
      knowledgeGet: vi.fn(async () => ({ status: 'ok', entry: undefined })),
      knowledgeAdd: vi.fn(async () => ({ status: 'ok' })),
      knowledgeUpdate: vi.fn(async () => ({ status: 'ok' })),
      knowledgeDelete: vi.fn(async () => ({ status: 'ok', deleted: true })),
    },
  }
}

function electronOf() {
  return globalThis.window.electron as unknown as {
    doc: Record<string, ReturnType<typeof vi.fn>>
    project: Record<string, ReturnType<typeof vi.fn>>
    guide: Record<string, ReturnType<typeof vi.fn>>
  }
}

beforeEach(() => {
  mockElectron()
  useProjectStore.setState({ selectedProject: { id: 1, name: 'demo', index: 0 } })
  useUIStore.getState().setActiveActivity('doc')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DocPanel（505-a 三页签与生成产物列表）', () => {
  it('渲染三个页签', async () => {
    render(<DocPanel />)
    expect(screen.getByText('文档')).toBeTruthy()
    expect(screen.getByText('指南')).toBeTruthy()
    expect(screen.getByText('知识库')).toBeTruthy()
  })

  it('文档页加载并展示生成产物列表（类型/状态）', async () => {
    render(
      <>
        <ToastContainer />
        <DocPanel />
      </>,
    )
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText(/demo-review-2026/)).toBeTruthy()
    expect(screen.getByText('评审报告')).toBeTruthy()
    expect(screen.getByText('已生成')).toBeTruthy()
    expect(electronOf().doc.list).toHaveBeenCalled()
  })

  it('点击生成评审报告 → 调用 doc.generate(review)', async () => {
    render(
      <>
        <ToastContainer />
        <DocPanel />
      </>,
    )
    await act(async () => {
      fireEvent.click(screen.getByText('生成评审报告'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(electronOf().doc.generate).toHaveBeenCalledWith('demo', 'review')
  })

  it('点击导出评审包 / 评审 PDF → 调用对应 IPC', async () => {
    render(
      <>
        <ToastContainer />
        <DocPanel />
      </>,
    )
    await act(async () => {
      fireEvent.click(screen.getByText('导出评审包'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(electronOf().project.exportReviewPackage).toHaveBeenCalledWith('demo')
    await act(async () => {
      fireEvent.click(screen.getByText('导出评审 PDF'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(electronOf().project.exportReviewPdf).toHaveBeenCalledWith('demo')
  })

  it('无选中项目时生成按钮禁用', async () => {
    useProjectStore.setState({ selectedProject: null })
    render(<DocPanel />)
    const btn = screen.getByText('生成评审报告').closest('button')
    expect(btn?.hasAttribute('disabled')).toBe(true)
  })
})

describe('DocPanel（505-a 指南 / 知识库页签）', () => {
  it('指南页加载用户指南内容', async () => {
    render(<DocPanel />)
    await act(async () => {
      fireEvent.click(screen.getByText('指南'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(electronOf().guide.getContent).toHaveBeenCalled()
    expect(screen.getAllByText(/用户指南/).length).toBeGreaterThan(0)
  })

  it('知识库页签渲染空态', async () => {
    render(<DocPanel />)
    await act(async () => {
      fireEvent.click(screen.getByText('知识库'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText(/暂无知识条目/)).toBeTruthy()
  })
})
