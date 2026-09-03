/**
 * 5.0.2-F502-2：AI 引擎 —— 前端 ENGINE_NA 标记解析纯函数单元测试（退化轻量，不做组件渲染）
 * - parseEngineNaMarker：解析后端 /send 返回的 ---ENGINE_NA:<engine>--- 独立标记行并剥离，
 *   返回引擎标识与安装指引正文；无标记返回 null（渲染提示卡片时标记行不进显示区）
 */
import { describe, it, expect } from 'vitest'
import { parseEngineNaMarker } from '@/stores/chat.store'

describe('parseEngineNaMarker（AI 引擎不可用标记解析）', () => {
  it('解析 hermes 未安装标记并剥离标记行', () => {
    const content = '---ENGINE_NA:hermes---\n\n> 安装指引正文'
    const parsed = parseEngineNaMarker(content)
    expect(parsed).not.toBeNull()
    expect(parsed!.engine).toBe('hermes')
    expect(parsed!.displayContent).toContain('安装指引正文')
    expect(parsed!.displayContent).not.toContain('---ENGINE_NA')
  })

  it('普通回复 / 空串返回 null（不渲染卡片）', () => {
    expect(parseEngineNaMarker('普通回复')).toBeNull()
    expect(parseEngineNaMarker('')).toBeNull()
  })

  it('marker 位于行首或换行后均识别，剥离后保留正文', () => {
    const a = parseEngineNaMarker('---ENGINE_NA:auto---\n提示')
    expect(a).not.toBeNull()
    expect(a!.engine).toBe('auto')
    expect(a!.displayContent).toContain('提示')

    const b = parseEngineNaMarker('前缀内容\n---ENGINE_NA:hermes---\n正文')
    expect(b).not.toBeNull()
    expect(b!.engine).toBe('hermes')
    expect(b!.displayContent).not.toContain('ENGINE_NA')
    expect(b!.displayContent).toContain('正文')
  })

  it('大小写引擎标识兼容', () => {
    const parsed = parseEngineNaMarker('---ENGINE_NA:HERMES---\n正文')
    expect(parsed).not.toBeNull()
    expect(parsed!.engine).toBe('HERMES')
  })
})
