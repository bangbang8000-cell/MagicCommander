/**
 * V4.2.0-42-b（F2-2b）：编辑撤销/重做命令栈（轻量，深拷贝快照）
 * - 按 key（编辑器标签 id）维护 undo/redo 栈，栈深上限 UNDO_STACK_LIMIT=50
 * - 深拷贝快照：JSON 往返（Excel 参数 / 文本内容通用）
 * - 重启保留：节流写入 localStorage，容量受控（字节阈值，超限丢弃最旧 undo）
 * - 供 Excel 参数编辑接线；Ctrl+Z/Y 或工具条触发
 */
import { create } from 'zustand'

/** 栈深上限 */
export const UNDO_STACK_LIMIT = 50
/** localStorage 持久化 key */
export const UNDO_PERSIST_KEY = 'mc-undo-stacks'
/** 持久化字节阈值（超限丢弃最旧 undo；单条仍超限则放弃本次） */
export const UNDO_PERSIST_MAX_BYTES = 256 * 1024
/** 持久化节流防抖时长 */
export const UNDO_PERSIST_DEBOUNCE_MS = 500

/** 深拷贝（JSON 往返；字符串/数组/对象通用） */
export function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** 保留最近 limit 条 */
export function capStack<T>(stack: T[], limit: number): T[] {
  return stack.slice(-limit)
}

function utf8Bytes(str: string): number {
  try {
    return new TextEncoder().encode(str).length
  } catch {
    return str.length
  }
}

/**
 * 容量受控截断：栈深上限 + 字节阈值，超限丢弃最旧 undo（redo 保留）。
 * 若所有栈都只剩 1 条仍超限 → 返回 null（放弃本次持久化）。
 */
export function truncateStacksByBytes(
  undoStack: Record<string, unknown[]>,
  redoStack: Record<string, unknown[]>,
  maxBytes: number,
): { undo: Record<string, unknown[]>; redo: Record<string, unknown[]> } | null {
  const undo: Record<string, unknown[]> = {}
  for (const [key, stack] of Object.entries(undoStack)) {
    undo[key] = capStack(stack, UNDO_STACK_LIMIT)
  }
  const redo: Record<string, unknown[]> = {}
  for (const [key, stack] of Object.entries(redoStack)) {
    redo[key] = capStack(stack, UNDO_STACK_LIMIT)
  }
  let json = JSON.stringify({ undoStack: undo, redoStack: redo })
  while (utf8Bytes(json) > maxBytes) {
    // 优先丢弃还有多余 1 条记录的栈的最旧一条；无可丢弃仍超限 → 放弃
    const key = Object.keys(undo).find((k) => undo[k].length > 1)
    if (!key) return null
    undo[key] = undo[key].slice(1)
    json = JSON.stringify({ undoStack: undo, redoStack: redo })
  }
  return { undo, redo }
}

/** 从 localStorage 恢复持久化栈（损坏/缺失返回 null） */
export function loadUndoStacks(): {
  undoStack: Record<string, unknown[]>
  redoStack: Record<string, unknown[]>
} | null {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(UNDO_PERSIST_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as { undoStack?: unknown; redoStack?: unknown }
    if (
      data &&
      typeof data === 'object' &&
      data.undoStack &&
      data.redoStack &&
      typeof data.undoStack === 'object' &&
      typeof data.redoStack === 'object'
    ) {
      return {
        undoStack: data.undoStack as Record<string, unknown[]>,
        redoStack: data.redoStack as Record<string, unknown[]>,
      }
    }
  } catch {
    /* 损坏数据忽略 */
  }
  return null
}

/** 节流写盘（容量受控） */
export function saveUndoStacks(undoStack: Record<string, unknown[]>, redoStack: Record<string, unknown[]>): void {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
    const capped = truncateStacksByBytes(undoStack, redoStack, UNDO_PERSIST_MAX_BYTES)
    if (!capped) return
    localStorage.setItem(UNDO_PERSIST_KEY, JSON.stringify({ undoStack: capped.undo, redoStack: capped.redo }))
  } catch {
    /* quota 超限忽略 */
  }
}

export interface UndoResult {
  ok: boolean
  snapshot: unknown | null
}

interface UndoState {
  undoStack: Record<string, unknown[]>
  redoStack: Record<string, unknown[]>
  /** 编辑前记录快照（深拷贝压栈；新编辑清空 redo） */
  record: (key: string, snapshot: unknown) => void
  /** 撤销：返回栈顶历史快照，并把当前快照压入 redo */
  undo: (key: string, current: unknown) => UndoResult
  /** 重做：返回 redo 栈顶快照，并把当前快照压回 undo */
  redo: (key: string, current: unknown) => UndoResult
  clear: (key: string) => void
  canUndo: (key: string) => boolean
  canRedo: (key: string) => boolean
}

const initial = loadUndoStacks() ?? { undoStack: {}, redoStack: {} }

export const useUndoStore = create<UndoState>()((set, get) => ({
  undoStack: initial.undoStack,
  redoStack: initial.redoStack,

  record: (key, snapshot) => {
    const { undoStack, redoStack } = get()
    const undo = capStack([...(undoStack[key] || []), deepCopy(snapshot)], UNDO_STACK_LIMIT)
    const next = { undoStack: { ...undoStack, [key]: undo }, redoStack: { ...redoStack, [key]: [] } }
    set(next)
    schedulePersist(next)
  },

  undo: (key, current) => {
    const { undoStack, redoStack } = get()
    const u = undoStack[key] || []
    if (u.length === 0) return { ok: false, snapshot: null }
    const snapshot = u[u.length - 1]
    const redo = capStack([...(redoStack[key] || []), deepCopy(current)], UNDO_STACK_LIMIT)
    const next = {
      undoStack: { ...undoStack, [key]: u.slice(0, -1) },
      redoStack: { ...redoStack, [key]: redo },
    }
    set(next)
    schedulePersist(next)
    return { ok: true, snapshot: deepCopy(snapshot) }
  },

  redo: (key, current) => {
    const { undoStack, redoStack } = get()
    const r = redoStack[key] || []
    if (r.length === 0) return { ok: false, snapshot: null }
    const snapshot = r[r.length - 1]
    const undo = capStack([...(undoStack[key] || []), deepCopy(current)], UNDO_STACK_LIMIT)
    const next = {
      undoStack: { ...undoStack, [key]: undo },
      redoStack: { ...redoStack, [key]: r.slice(0, -1) },
    }
    set(next)
    schedulePersist(next)
    return { ok: true, snapshot: deepCopy(snapshot) }
  },

  clear: (key) => {
    const { undoStack, redoStack } = get()
    const undo = { ...undoStack }
    const redo = { ...redoStack }
    delete undo[key]
    delete redo[key]
    const next = { undoStack: undo, redoStack: redo }
    set(next)
    schedulePersist(next)
  },

  canUndo: (key) => (get().undoStack[key] || []).length > 0,
  canRedo: (key) => (get().redoStack[key] || []).length > 0,
}))

let persistTimer: ReturnType<typeof setTimeout> | null = null

function schedulePersist(stacks: { undoStack: Record<string, unknown[]>; redoStack: Record<string, unknown[]> }): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    saveUndoStacks(stacks.undoStack, stacks.redoStack)
  }, UNDO_PERSIST_DEBOUNCE_MS)
}
