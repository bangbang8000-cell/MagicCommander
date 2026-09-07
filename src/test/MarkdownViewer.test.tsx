/**
 * MC-G6: MarkdownViewer 内容直渲门禁
 * - 修复"帮助→使用指南无法打开"：有 tab.content 时直接渲染内容，不再调 project.readFile
 * - 普通文件标签（无 content）仍走磁盘读取，防止回归
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MarkdownViewer } from '@/components/common/MarkdownViewer'

const readFileMock = vi.fn()

beforeEach(() => {
  readFileMock.mockReset()
  ;(window.electron as unknown as { project: { readFile: typeof readFileMock } }).project.readFile = readFileMock
})

function makeTab(content?: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-guide',
    title: 'MagicCommander User Guide',
    filePath: 'docs/user-guide.md',
    fileType: 'markdown' as const,
    projectId: 0,
    projectName: '',
    isDirty: false,
    content,
    ...overrides,
  }
}

describe('MarkdownViewer', () => {
  it('有 tab.content 时直接渲染内容，不调用 project.readFile（修复使用指南无法打开）', async () => {
    const content = '# 使用指南\n\n这是指南正文。'
    render(<MarkdownViewer tab={makeTab(content)} inline />)

    await waitFor(() => {
      expect(screen.getByText('这是指南正文。')).toBeInTheDocument()
    })
    expect(readFileMock).not.toHaveBeenCalled()
  })

  it('无 tab.content 的普通文件标签走 project.readFile', async () => {
    readFileMock.mockResolvedValue('# 文件内容')
    render(
      <MarkdownViewer
        tab={makeTab(undefined, { id: 'tab1', filePath: 'docs/file.md', projectId: 1, projectName: 'p1' })}
        inline
      />,
    )

    await waitFor(() => {
      expect(readFileMock).toHaveBeenCalledWith(1, 'docs/file.md', 'p1')
    })
  })

  it('无 tab 时使用传入 content 直渲（非标签场景）', async () => {
    render(<MarkdownViewer content="第一段正文。" inline />)
    await waitFor(() => {
      expect(screen.getByText('第一段正文。')).toBeInTheDocument()
    })
    expect(readFileMock).not.toHaveBeenCalled()
  })
})

describe('MarkdownViewer 交互分支（5.1-516-a 新增）', () => {
  it('project.readFile 失败时显示错误信息', async () => {
    readFileMock.mockRejectedValue(new Error('读取失败'))
    render(
      <MarkdownViewer
        tab={makeTab(undefined, { id: 'tab1', filePath: 'docs/file.md', projectId: 1, projectName: 'p1' })}
        inline
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('读取失败')).toBeInTheDocument()
    })
  })

  it('MCP 指南标签显示"复制接入配置"按钮，点击复制 MCP 配置 JSON', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<MarkdownViewer tab={makeTab('# MCP 接入指南', { id: 'mcp-guide' })} inline />)
    await waitFor(() => {
      expect(screen.getByText('复制接入配置')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('复制接入配置'))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"mcpServers"'))
    })
  })

  it('普通标签不显示复制接入配置按钮', async () => {
    render(<MarkdownViewer tab={makeTab('# 使用指南')} inline />)
    await waitFor(() => {
      expect(screen.queryByText('复制接入配置')).not.toBeInTheDocument()
    })
  })

  it('内容含标题时渲染目录侧栏', async () => {
    const content = '# 一级标题\n\n## 二级标题\n\n正文内容。'
    render(<MarkdownViewer content={content} inline />)
    await waitFor(() => {
      expect(screen.getByText('正文内容。')).toBeInTheDocument()
    })
    expect(screen.getByText('目录')).toBeInTheDocument()
    expect(screen.getAllByText('一级标题').length).toBeGreaterThan(0)
  })

  it('非 inline 模式渲染关闭按钮并触发 onClose', async () => {
    const onClose = vi.fn()
    render(<MarkdownViewer content="正文内容。" onClose={onClose} />)
    await waitFor(() => {
      expect(screen.getByText('正文内容。')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('MarkdownViewer 复制/目录交互补充', () => {
  it('点击复制后按钮切换为"已复制"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<MarkdownViewer tab={makeTab('# MCP 接入指南', { id: 'mcp-guide' })} inline />)
    await waitFor(() => {
      expect(screen.getByText('复制接入配置')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('复制接入配置'))
    await waitFor(() => {
      expect(screen.getByText('已复制')).toBeInTheDocument()
    })
  })

  it('目录栏可点击折叠/展开', async () => {
    const content = '# 一级标题\n\n## 二级标题\n\n正文内容。'
    render(<MarkdownViewer content={content} inline />)
    await waitFor(() => {
      expect(screen.getAllByText('一级标题').length).toBeGreaterThan(0)
    })
    fireEvent.click(screen.getByText('目录'))
    expect(screen.queryByRole('button', { name: '二级标题' })).not.toBeInTheDocument()
  })
})

describe('MarkdownViewer 剩余分支（滚动定位/复制失败）', () => {
  it('点击目录项调用 scrollIntoView 定位标题', async () => {
    const content = '# 一级标题\n\n## 二级标题\n\n正文内容。'
    render(<MarkdownViewer content={content} inline />)
    await waitFor(() => {
      expect(screen.getAllByText('一级标题').length).toBeGreaterThan(0)
    })
    const el = { scrollIntoView: vi.fn() }
    const spy = vi.spyOn(document, 'getElementById').mockReturnValue(el as unknown as HTMLElement)
    fireEvent.click(screen.getAllByText('一级标题')[0])
    expect(el.scrollIntoView).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('复制失败时静默忽略（不抛异常）', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<MarkdownViewer tab={makeTab('# MCP 接入指南', { id: 'mcp-guide' })} inline />)
    await waitFor(() => {
      expect(screen.getByText('复制接入配置')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('复制接入配置'))
    expect(screen.getByText('复制接入配置')).toBeInTheDocument()
  })
})
