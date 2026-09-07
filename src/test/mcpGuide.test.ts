/**
 * MC 5.1-516-a：MCP 接入指南打开逻辑（openMcpGuideTab）
 * - 成功：加载指南 → 打开 mcp-guide 工作区标签
 * - 回退：目标语言缺失 → 英文内容 + 警告前缀
 * - 失败：无结果 / 异常 → 返回 false，不打开标签
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { openMcpGuideTab } from '@/utils/mcpGuide'
import { useEditorStore } from '@/stores/editor.store'

function mockGuide(getMcpGuide: unknown) {
  ;(window.electron as unknown as Record<string, unknown>).guide = { getMcpGuide }
}

describe('openMcpGuideTab', () => {
  const openFileSpy = vi.fn()
  const originalOpenFile = useEditorStore.getState().openFile

  beforeEach(() => {
    openFileSpy.mockReset()
    useEditorStore.setState({ openFile: openFileSpy } as never)
    ;(window.electron as unknown as Record<string, unknown>).app = {
      getLanguage: async () => 'zh-CN',
    }
  })

  afterEach(() => {
    useEditorStore.setState({ openFile: originalOpenFile } as never)
    delete (window.electron as unknown as Record<string, unknown>).guide
  })

  it('成功：加载指南并打开 mcp-guide 工作区标签', async () => {
    mockGuide(async () => ({ content: '# MCP 接入指南', usedFallback: false, requestedLang: 'zh-CN' }))
    const ok = await openMcpGuideTab('zh-CN')
    expect(ok).toBe(true)
    expect(openFileSpy).toHaveBeenCalledTimes(1)
    const tab = openFileSpy.mock.calls[0][0]
    expect(tab.id).toBe('mcp-guide')
    expect(tab.filePath).toBe('docs/mcp-guide.md')
    expect(tab.fileType).toBe('markdown')
    expect(tab.content).toBe('# MCP 接入指南')
  })

  it('目标语言缺指南时回退英文内容并加警告前缀', async () => {
    mockGuide(async (lang: string) => ({ content: 'EN guide', usedFallback: true, requestedLang: lang }))
    const ok = await openMcpGuideTab('fr')
    expect(ok).toBe(true)
    const tab = openFileSpy.mock.calls[0][0]
    expect(tab.content).toContain('This language has no guide yet')
    expect(tab.content).toContain('EN guide')
  })

  it('未提供 lang 时走应用语言解析（getLanguage）', async () => {
    mockGuide(async (lang: string) => ({ content: `guide-${lang}`, usedFallback: false, requestedLang: lang }))
    const ok = await openMcpGuideTab()
    expect(ok).toBe(true)
    expect(openFileSpy.mock.calls[0][0].content).toBe('guide-zh-CN')
  })

  it('无指南结果时返回 false 且不打开标签', async () => {
    mockGuide(async () => null)
    const ok = await openMcpGuideTab()
    expect(ok).toBe(false)
    expect(openFileSpy).not.toHaveBeenCalled()
  })

  it('加载异常时返回 false（不抛异常）', async () => {
    mockGuide(async () => {
      throw new Error('boom')
    })
    const ok = await openMcpGuideTab()
    expect(ok).toBe(false)
    expect(openFileSpy).not.toHaveBeenCalled()
  })
})
