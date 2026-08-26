/**
 * MC-G6: MarkdownViewer 内容直渲门禁
 * - 修复"帮助→使用指南无法打开"：有 tab.content 时直接渲染内容，不再调 project.readFile
 * - 普通文件标签（无 content）仍走磁盘读取，防止回归
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
