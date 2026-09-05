import { describe, it, expect } from 'vitest'
import { escapeHtml } from './escapeHtml'

describe('escapeHtml（508-a 覆盖率）', () => {
  it('转义全部特殊字符', () => {
    expect(escapeHtml('&')).toBe('&amp;')
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('>')).toBe('&gt;')
    expect(escapeHtml('"')).toBe('&quot;')
    expect(escapeHtml("'")).toBe('&#039;')
  })

  it('组合文本整体转义且顺序正确（先 & 后其它）', () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#039;&lt;/a&gt;',
    )
  })

  it('普通文本与空串原样返回', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123')
    expect(escapeHtml('')).toBe('')
  })
})