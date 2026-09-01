/**
 * S-3 撤销/重做：命令栈正确、深拷贝、栈深上限 50、重启保留（localStorage 容量受控）
 * V4.2.0-42-b（F2-2b）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useUndoStore, UNDO_STACK_LIMIT, deepCopy, capStack, truncateStacksByBytes } from '@/stores/undo.store'

beforeEach(() => {
  useUndoStore.setState({ undoStack: {}, redoStack: {} })
  localStorage.clear()
})

describe('命令栈基础', () => {
  it('record 编辑前快照，undo 撤销回上一步，redo 重做到下一步', () => {
    const s = useUndoStore.getState()
    // 编辑流程：当前 A →（记录 A）编辑为 B →（记录 B）编辑为 C
    s.record('tab1', { rows: ['A'] })
    s.record('tab1', { rows: ['B'] })
    expect(s.canUndo('tab1')).toBe(true)

    const u1 = s.undo('tab1', { rows: ['C'] })
    expect(u1.ok).toBe(true)
    expect(u1.snapshot).toEqual({ rows: ['B'] })
    expect(s.canRedo('tab1')).toBe(true)

    const u2 = s.undo('tab1', { rows: ['B'] })
    expect(u2.snapshot).toEqual({ rows: ['A'] })

    const r1 = s.redo('tab1', { rows: ['A'] })
    expect(r1.ok).toBe(true)
    expect(r1.snapshot).toEqual({ rows: ['B'] })

    const r2 = s.redo('tab1', { rows: ['B'] })
    expect(r2.snapshot).toEqual({ rows: ['C'] })
  })

  it('空栈 undo/redo 返回 ok=false', () => {
    const s = useUndoStore.getState()
    expect(s.undo('none', {}).ok).toBe(false)
    expect(s.redo('none', {}).ok).toBe(false)
  })

  it('新编辑清空 redo 栈', () => {
    const s = useUndoStore.getState()
    s.record('t', 1)
    s.record('t', 2)
    s.undo('t', 2)
    expect(s.canRedo('t')).toBe(true)
    s.record('t', 3) // 新编辑
    expect(s.canRedo('t')).toBe(false)
  })

  it('clear 清除指定 key 的栈', () => {
    const s = useUndoStore.getState()
    s.record('t', 1)
    s.clear('t')
    expect(s.canUndo('t')).toBe(false)
    expect(s.canRedo('t')).toBe(false)
  })
})

describe('深拷贝快照', () => {
  it('record 后修改原快照不影响历史', () => {
    const s = useUndoStore.getState()
    const original = { rows: ['A'] }
    s.record('tab', original)
    original.rows.push('HACK')
    const u = s.undo('tab', { rows: ['A', 'HACK'] })
    expect(u.snapshot).toEqual({ rows: ['A'] })
  })

  it('deepCopy 对字符串/数组/对象通用', () => {
    expect(deepCopy('abc')).toBe('abc')
    expect(deepCopy([{ a: 1 }])).toEqual([{ a: 1 }])
  })
})

describe('栈深上限 50', () => {
  it('capStack 保留最近 50 条', () => {
    const stack = Array.from({ length: 80 }, (_, i) => i)
    const capped = capStack(stack, UNDO_STACK_LIMIT)
    expect(capped).toHaveLength(50)
    expect(capped[0]).toBe(30)
    expect(capped[49]).toBe(79)
  })

  it('record 超过 50 次只保留最近 50 个快照', () => {
    const s = useUndoStore.getState()
    for (let i = 0; i < 60; i++) s.record('big', i)
    // 连续 undo 60 次，仅前 50 次有效
    let okCount = 0
    for (let i = 0; i < 60; i++) {
      const r = s.undo('big', 999)
      if (r.ok) okCount++
    }
    expect(okCount).toBe(50)
  })
})

describe('重启保留（localStorage 容量受控）', () => {
  it('truncateStacksByBytes 超限丢弃最旧 undo', () => {
    const undo: Record<string, unknown[]> = {
      k: [{ pad: 'x'.repeat(1000) }, { pad: 'y'.repeat(1000) }, { pad: 'z'.repeat(1000) }],
    }
    const result = truncateStacksByBytes(undo, {}, 2500)
    expect(result).not.toBeNull()
    expect(result!.undo.k.length).toBeLessThan(undo.k.length)
  })

  it('单条仍超限返回 null（放弃持久化）', () => {
    const undo: Record<string, unknown[]> = { k: [{ pad: 'x'.repeat(100_000) }] }
    expect(truncateStacksByBytes(undo, {}, 1000)).toBeNull()
  })
})
