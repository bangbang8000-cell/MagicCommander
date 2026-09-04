/**
 * 5.0.5-505-b：知识库面板（KnowledgePanel）前端单测
 * - 列表渲染（标题/分类/标签/时间）
 * - 关键词检索调用 knowledgeSearch
 * - 分类过滤
 * - 新增 / 编辑 / 删除 CRUD
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { KnowledgePanel } from '@/components/sidebar/KnowledgePanel'
import { ToastContainer } from '@/components/ui/Toast'
import '@/i18n'

const ENTRIES = [
  {
    key: 'roce-规划',
    title: 'RoCE 规划',
    category: '网络',
    tags: ['roce'],
    project: 'proj-a',
    created_at: '2026-09-04T10:00:00',
    updated_at: '2026-09-04T10:00:00',
  },
  {
    key: 'vlan-规划',
    title: 'VLAN 规划',
    category: '网络',
    tags: ['vlan'],
    project: 'proj-b',
    created_at: '2026-09-04T09:00:00',
    updated_at: '2026-09-04T09:00:00',
  },
]

function mockElectron() {
  ;(globalThis as unknown as { window: { electron: Record<string, unknown> } }).window.electron = {
    aihub: {
      knowledgeList: vi.fn(async () => ({ status: 'ok', entries: ENTRIES, total: 2 })),
      knowledgeSearch: vi.fn(async () => ({
        status: 'ok',
        hits: [{ ...ENTRIES[0], content: 'PFC 与 ECN 无损' }],
        total: 1,
      })),
      knowledgeGet: vi.fn(async () => ({
        status: 'ok',
        entry: { ...ENTRIES[0], content: 'PFC 与 ECN 无损' },
      })),
      knowledgeAdd: vi.fn(async () => ({ status: 'ok' })),
      knowledgeUpdate: vi.fn(async () => ({ status: 'ok' })),
      knowledgeDelete: vi.fn(async () => ({ status: 'ok', deleted: true })),
    },
  }
}

function aihubOf() {
  return globalThis.window.electron as unknown as { aihub: Record<string, ReturnType<typeof vi.fn>> }
}

beforeEach(() => {
  mockElectron()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('KnowledgePanel（505-b 列表与检索）', () => {
  it('渲染知识条目列表（标题/分类/标签）', async () => {
    render(
      <>
        <ToastContainer />
        <KnowledgePanel />
      </>,
    )
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText('RoCE 规划')).toBeTruthy()
    expect(screen.getByText('VLAN 规划')).toBeTruthy()
    expect(screen.getAllByText('网络').length).toBeGreaterThan(0)
    expect(aihubOf().aihub.knowledgeList).toHaveBeenCalled()
  })

  it('关键词检索调用 knowledgeSearch 并展示命中', async () => {
    render(
      <>
        <ToastContainer />
        <KnowledgePanel />
      </>,
    )
    await act(async () => {
      await Promise.resolve()
    })
    const input = screen.getByPlaceholderText('检索关键词…')
    fireEvent.change(input, { target: { value: 'RoCE' } })
    await act(async () => {
      fireEvent.click(screen.getByText('检索'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(aihubOf().aihub.knowledgeSearch).toHaveBeenCalledWith('RoCE', undefined, undefined, 20)
    expect(screen.getByText('RoCE 规划')).toBeTruthy()
  })

  it('分类过滤切换调用 knowledgeList 带分类参数', async () => {
    render(
      <>
        <ToastContainer />
        <KnowledgePanel />
      </>,
    )
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const catFilter = screen.getAllByRole('button').find((b) => b.textContent?.trim() === '网络')
    expect(catFilter).toBeTruthy()
    await act(async () => {
      fireEvent.click(catFilter!)
      await Promise.resolve()
      await Promise.resolve()
    })
    const calls = aihubOf().aihub.knowledgeList.mock.calls
    expect(calls[calls.length - 1][0]).toBe('网络')
  })
})

describe('KnowledgePanel（505-b 新增/编辑/删除）', () => {
  it('新增知识 → 打开编辑器 → 保存调用 knowledgeAdd', async () => {
    render(
      <>
        <ToastContainer />
        <KnowledgePanel />
      </>,
    )
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(screen.getByTitle('新增知识'))
    })
    expect(screen.getByText('新增知识')).toBeTruthy()
    const titleInput = screen.getByPlaceholderText('标题 *')
    fireEvent.change(titleInput, { target: { value: '新条目' } })
    fireEvent.change(screen.getByPlaceholderText('知识正文（Markdown）'), { target: { value: '新内容' } })
    await act(async () => {
      fireEvent.click(screen.getByText('保存'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(aihubOf().aihub.knowledgeAdd).toHaveBeenCalled()
    expect(aihubOf().aihub.knowledgeAdd.mock.calls[0][0].title).toBe('新条目')
  })

  it('编辑知识 → 获取详情 → 保存调用 knowledgeUpdate', async () => {
    render(
      <>
        <ToastContainer />
        <KnowledgePanel />
      </>,
    )
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(screen.getAllByText('编辑')[0])
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(aihubOf().aihub.knowledgeGet).toHaveBeenCalledWith('roce-规划')
    await act(async () => {
      fireEvent.click(screen.getByText('保存'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(aihubOf().aihub.knowledgeUpdate).toHaveBeenCalled()
    expect(aihubOf().aihub.knowledgeUpdate.mock.calls[0][0]).toBe('roce-规划')
  })

  it('删除知识 → 调用 knowledgeDelete 并从列表移除', async () => {
    render(
      <>
        <ToastContainer />
        <KnowledgePanel />
      </>,
    )
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(screen.getAllByText('删除')[0])
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(aihubOf().aihub.knowledgeDelete).toHaveBeenCalledWith('roce-规划')
  })

  it('展开条目 → 获取内容预览', async () => {
    render(
      <>
        <ToastContainer />
        <KnowledgePanel />
      </>,
    )
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(screen.getByText('RoCE 规划'))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(aihubOf().aihub.knowledgeGet).toHaveBeenCalledWith('roce-规划')
    expect(screen.getByText('PFC 与 ECN 无损')).toBeTruthy()
  })
})
