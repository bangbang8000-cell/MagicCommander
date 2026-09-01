/**
 * 4.4 F4-1（测试计划 E-1）：双端统一快捷键
 *
 * 覆盖：
 * - SHARED_HOTKEY_SPEC（共享规范 10 组键）全部注册于 HOTKEY_REGISTRY
 * - 注册表无重复 combo
 * - 标准键标签非空、分类存在
 * - useHotkey：聚焦输入框（INPUT/TEXTAREA/contentEditable）时系统键跳过；非输入区正常触发
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'
import { HOTKEY_REGISTRY, SHARED_HOTKEY_SPEC, getHotkeysByCategory } from '@/hooks/hotkeyRegistry'
import { useHotkey } from '@/hooks/useHotkey'

describe('E-1 共享快捷键规范（SHARED_HOTKEY_SPEC）', () => {
  it('共享规范应包含 10 组标准键（11 个 combo）', () => {
    const combos = SHARED_HOTKEY_SPEC.map((s) => s.combo)
    expect(combos).toHaveLength(11)
    expect(combos).toContain('ctrl+z')
    expect(combos).toContain('ctrl+shift+z')
    expect(combos).toContain('ctrl+k')
    expect(combos).toContain('ctrl+b')
    expect(combos).toContain('ctrl+`')
    expect(combos).toContain('ctrl+n')
    expect(combos).toContain('ctrl+enter')
    expect(combos).toContain('ctrl+e')
    expect(combos).toContain('ctrl+shift+p')
    expect(combos).toContain('ctrl+,')
    expect(combos).toContain('f1')
  })

  it('共享规范的全部 combo 均应注册于 HOTKEY_REGISTRY（双端一致可查）', () => {
    const registered = HOTKEY_REGISTRY.map((h) => h.combo)
    for (const item of SHARED_HOTKEY_SPEC) {
      expect(registered, `共享标准键 ${item.combo} 未注册`).toContain(item.combo)
    }
  })

  it('注册表 combo 不应重复', () => {
    const combos = HOTKEY_REGISTRY.map((h) => h.combo)
    const unique = new Set(combos)
    expect(unique.size).toBe(combos.length)
  })

  it('标准键 label 非空且分类存在（Cheatsheet 可查）', () => {
    const byCategory = getHotkeysByCategory()
    for (const item of SHARED_HOTKEY_SPEC) {
      const def = HOTKEY_REGISTRY.find((h) => h.combo === item.combo)
      expect(def).toBeDefined()
      expect(def!.label.trim().length).toBeGreaterThan(0)
      expect(byCategory[def!.category]).toBeDefined()
    }
  })

  it('Cheatsheet 分类按 CATEGORY_ORDER 全部渲染不丢项', () => {
    const byCategory = getHotkeysByCategory()
    const total = Object.values(byCategory).reduce((sum, list) => sum + list.length, 0)
    expect(total).toBe(HOTKEY_REGISTRY.length)
  })
})

describe('E-1 useHotkey 聚焦输入框跳过', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    cleanup()
    if (container.parentNode) container.parentNode.removeChild(container)
  })

  it('聚焦 INPUT 时按下系统键不触发', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useHotkey('ctrl+s', handler, [handler]))

    const input = document.createElement('input')
    container.appendChild(input)
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
    expect(handler).not.toHaveBeenCalled()

    unmount()
  })

  it('聚焦 TEXTAREA 时按下系统键不触发', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useHotkey('ctrl+s', handler, [handler]))

    const textarea = document.createElement('textarea')
    container.appendChild(textarea)
    textarea.focus()
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
    expect(handler).not.toHaveBeenCalled()

    unmount()
  })

  it('聚焦 contentEditable 时按下系统键不触发', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useHotkey('ctrl+s', handler, [handler]))

    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    container.appendChild(editable)
    editable.focus()
    editable.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
    expect(handler).not.toHaveBeenCalled()

    unmount()
  })

  it('非输入区按下系统键正常触发', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useHotkey('ctrl+s', handler, [handler]))

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))
    expect(handler).toHaveBeenCalledTimes(1)

    unmount()
  })
})
