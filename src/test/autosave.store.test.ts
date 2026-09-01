/**
 * S-2 自动保存：编辑自动保存（防抖 800ms）、重启恢复（落盘后内容可再读）、开关/间隔设置
 * V4.2.0-42-b（F2-2a）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import {
  AUTOSAVE_DEBOUNCE_MS,
  dirtyTabIds,
  flushAutosave,
  initAutosave,
  scheduleAutosave,
} from '@/stores/autosave.store'

function makeTab(filePath: string) {
  useEditorStore.getState().openFile({
    id: '',
    title: filePath.split('/').pop() || filePath,
    filePath,
    fileType: 'text',
    projectId: 1,
    projectName: 'test1',
    isDirty: false,
  })
  const tab = [...useEditorStore.getState().openTabs].find((t) => t.filePath === filePath)!
  return tab
}

beforeEach(() => {
  useEditorStore.setState({ openTabs: [], splitTabs: [], activeTabId: null, activeSplitTabId: null })
  useUIStore.setState({ generalSettings: { ...useUIStore.getState().generalSettings, autoSave: true } })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('flushAutosave（编辑自动保存落盘）', () => {
  it('保存所有脏标签并清除脏标记（重启后可恢复该内容）', async () => {
    const saved: Record<string, string> = {}
    const tab = makeTab('excel/parameter.xlsx')
    useEditorStore.getState().registerSaveFn(tab.id, async () => {
      saved[tab.filePath] = '最新内容'
      useEditorStore.getState().markDirty(tab.id, false)
    })
    useEditorStore.getState().markDirty(tab.id, true)

    const count = await flushAutosave()

    expect(count).toBe(1)
    expect(saved['excel/parameter.xlsx']).toBe('最新内容')
    // 落盘后脏标记清除 → 重启重开标签读取的就是已保存内容
    expect(dirtyTabIds()).toHaveLength(0)
  })

  it('无脏标签时返回 0 且不抛错', async () => {
    expect(await flushAutosave()).toBe(0)
  })

  it('自动保存开关关闭时不落盘', async () => {
    useUIStore.setState({ generalSettings: { ...useUIStore.getState().generalSettings, autoSave: false } })
    const tab = makeTab('a.j2')
    const fn = vi.fn(async () => {
      useEditorStore.getState().markDirty(tab.id, false)
    })
    useEditorStore.getState().registerSaveFn(tab.id, fn)
    useEditorStore.getState().markDirty(tab.id, true)

    expect(await flushAutosave()).toBe(0)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('scheduleAutosave（防抖 800ms）', () => {
  it('编辑后按防抖间隔自动保存（多次编辑只落盘一次）', async () => {
    const calls: string[] = []
    const tab = makeTab('templates/ASW.j2')
    useEditorStore.getState().registerSaveFn(tab.id, async () => {
      calls.push('save')
      useEditorStore.getState().markDirty(tab.id, false)
    })
    useEditorStore.getState().markDirty(tab.id, true)

    scheduleAutosave()
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS / 2)
    // 间隔内再次编辑（保持脏）
    useEditorStore.getState().markDirty(tab.id, true)
    scheduleAutosave()
    expect(calls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS)
    expect(calls).toHaveLength(1)
  })

  it('自动保存关闭时 scheduleAutosave 不调度', () => {
    useUIStore.setState({ generalSettings: { ...useUIStore.getState().generalSettings, autoSave: false } })
    const tab = makeTab('x.txt')
    const fn = vi.fn()
    useEditorStore.getState().registerSaveFn(tab.id, fn)
    useEditorStore.getState().markDirty(tab.id, true)

    scheduleAutosave()
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('initAutosave（订阅脏变化自动调度 + 卸载尽力落盘）', () => {
  it('脏标签变化自动触发防抖保存', async () => {
    initAutosave()
    const calls: string[] = []
    const tab = makeTab('plan.json')
    useEditorStore.getState().registerSaveFn(tab.id, async () => {
      calls.push('save')
      useEditorStore.getState().markDirty(tab.id, false)
    })
    useEditorStore.getState().markDirty(tab.id, true)

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 50)
    expect(calls).toHaveLength(1)
  })
})
