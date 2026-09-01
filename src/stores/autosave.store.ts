/**
 * V4.2.0-42-b（F2-2a）：项目/参数编辑自动保存
 * - 订阅 editor.store 脏标签变化 → 防抖 800ms 自动保存（多次编辑合并一次落盘）
 * - 尊重通用设置 generalSettings.autoSave（开关）与 autoSaveInterval（间隔设置项，可选）
 * - 关闭/崩溃前 flushAutosave() 尽力落盘，重启后重开标签读取到最近保存内容
 * - 自动保存项目配置/参数/模板后，联动触发项目版本快照（防抖）与自动备份（节流）
 */
import { useEditorStore } from './editor.store'
import { useUIStore } from './ui.store'
import {
  snapshotScope,
  defaultHistoryIo,
  isProjectConfigPath,
  isConfigTextPath,
  type ProjectRef,
} from './projectHistory.store'

/** 自动保存防抖间隔（毫秒） */
export const AUTOSAVE_DEBOUNCE_MS = 800
/** 项目版本快照防抖间隔（毫秒） */
export const VERSION_SNAPSHOT_DEBOUNCE_MS = 1200
/** 自动备份最小间隔（毫秒），避免频繁编辑频繁写盘 */
export const BACKUP_MIN_INTERVAL_MS = 60_000

let autosaveTimer: ReturnType<typeof setTimeout> | null = null
let initialized = false
const historyTimers = new Map<string, ReturnType<typeof setTimeout>>()
const lastBackupAt = new Map<string, number>()

/** 自动保存开关（来自通用设置 generalSettings.autoSave） */
export function isAutosaveEnabled(): boolean {
  return useUIStore.getState().generalSettings.autoSave
}

/** 当前所有脏标签 id（主区 + 分屏） */
export function dirtyTabIds(): string[] {
  const s = useEditorStore.getState()
  return [...s.openTabs, ...s.splitTabs].filter((t) => t.isDirty).map((t) => t.id)
}

interface DirtyTab {
  id: string
  projectId: number
  projectName: string
  filePath: string
  fileType: string
}

function dirtyTabs(): DirtyTab[] {
  const s = useEditorStore.getState()
  return [...s.openTabs, ...s.splitTabs]
    .filter((t) => t.isDirty)
    .map((t) => ({
      id: t.id,
      projectId: t.projectId,
      projectName: t.projectName,
      filePath: t.filePath,
      fileType: t.fileType,
    }))
}

/** 编辑后防抖调度自动保存（无脏标签或开关关闭时跳过） */
export function scheduleAutosave(): void {
  if (!isAutosaveEnabled()) return
  if (dirtyTabIds().length === 0) return
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null
    void flushAutosave()
  }, AUTOSAVE_DEBOUNCE_MS)
}

/** 项目配置/参数/模板编辑标签（产出快照的编辑范围） */
export function isConfigEditTab(tab: DirtyTab): boolean {
  if (!isProjectConfigPath(tab.filePath)) return false
  return tab.fileType === 'excel' || isConfigTextPath(tab.filePath)
}

/** 项目版本快照（防抖 1200ms，合并连续编辑） */
export function scheduleProjectHistorySnapshot(project: ProjectRef, note?: string): void {
  const key = `${project.id}:history`
  const existing = historyTimers.get(key)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    historyTimers.delete(key)
    snapshotScope(project, 'history', note || '自动保存', defaultHistoryIo())
      .then((r) => {
        if (!r.ok && r.reason === 'too_large') {
          console.warn('[projectHistory] 版本快照过大，跳过本次')
        }
      })
      .catch(() => {
        /* 快照失败不影响编辑 */
      })
  }, VERSION_SNAPSHOT_DEBOUNCE_MS)
  historyTimers.set(key, timer)
}

/** 自动备份（节流 60s，避免频繁写盘） */
export function scheduleProjectBackup(project: ProjectRef): void {
  const key = String(project.id)
  const now = Date.now()
  if (now - (lastBackupAt.get(key) || 0) < BACKUP_MIN_INTERVAL_MS) return
  lastBackupAt.set(key, now)
  const timer = setTimeout(() => {
    snapshotScope(project, 'backup', '自动备份', defaultHistoryIo()).catch(() => {})
  }, VERSION_SNAPSHOT_DEBOUNCE_MS)
  const timerKey = `${project.id}:backup`
  const existing = historyTimers.get(timerKey)
  if (existing) clearTimeout(existing)
  historyTimers.set(timerKey, timer)
}

/** 立即保存所有脏标签，返回成功保存数；同时取消未触发的防抖定时器 */
export async function flushAutosave(): Promise<number> {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer)
    autosaveTimer = null
  }
  if (!isAutosaveEnabled()) return 0
  const tabs = dirtyTabs()
  let saved = 0
  const touchedProjects = new Map<string, ProjectRef>()
  for (const tab of tabs) {
    try {
      await useEditorStore.getState().saveTab(tab.id)
      saved++
      if (isConfigEditTab(tab)) {
        touchedProjects.set(String(tab.projectId), { id: tab.projectId, name: tab.projectName })
      }
    } catch {
      /* 单标签保存失败不阻断其余标签 */
    }
  }
  // 自动保存后联动：项目配置版本快照 + 自动备份
  for (const project of touchedProjects.values()) {
    scheduleProjectHistorySnapshot(project)
    scheduleProjectBackup(project)
  }
  return saved
}

function dirtySignature(state: {
  openTabs: Array<{ id: string; isDirty: boolean }>
  splitTabs: Array<{ id: string; isDirty: boolean }>
}): string {
  return [...state.openTabs, ...state.splitTabs]
    .filter((t) => t.isDirty)
    .map((t) => t.id)
    .sort()
    .join(',')
}

/** 初始化：订阅脏标签变化自动调度；卸载前尽力落盘（崩溃/关闭恢复） */
export function initAutosave(): void {
  if (initialized) return
  initialized = true
  useEditorStore.subscribe((state, prev) => {
    if (dirtySignature(state) !== dirtySignature(prev)) {
      scheduleAutosave()
    }
  })
  if (typeof window !== 'undefined') {
    const flush = () => {
      void flushAutosave()
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
  }
}
