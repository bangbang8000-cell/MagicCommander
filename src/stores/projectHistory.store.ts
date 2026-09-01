/**
 * V4.2.0-42-b/42-c：项目配置版本回滚（保留最近 N 版、重启保留）+ 自动备份轮转 + 一键恢复
 * - 存储于项目目录：.mc_history/snapshots.json（版本历史）、.mc_backups/snapshots.json（备份）
 * - 单文件容量受控轮转：重启保留、超限丢弃最旧版本；与既有 .output_backups 不冲突（目录不同、范围不同）
 * - 复用既有 project:* IPC（listFiles/readFile/writeFile/readExcel/writeExcel），不新增主进程接线
 * - 纯函数（buildStoreFile/parseStoreFile/rotateItems/collectEntries/capStoreByBytes 等）可独立单测
 */
import { create } from 'zustand'
import type { ExcelSheet } from '@/types/editor'

export interface ProjectRef {
  id: number | string
  name: string
}

export type HistoryScope = 'history' | 'backup'

/** 快照文件条目：路径 + 类型 + 内容（Excel 为解析后的 sheets，文本为原始内容） */
export interface HistoryFileEntry {
  path: string
  kind: 'text' | 'excel'
  content: string | ExcelSheet[]
}

/** 清单条目（含完整快照内容） */
export interface HistoryStoreItem {
  id: string
  timestamp: string
  note: string
  fileCount: number
  files: HistoryFileEntry[]
}

/** 版本/备份元信息（列表展示用，不含内容） */
export interface VersionMeta {
  id: string
  timestamp: string
  note: string
  fileCount: number
}

export interface HistoryStoreFile {
  schema_version: number
  scope: HistoryScope
  items: HistoryStoreItem[]
}

/** 项目目录读写抽象（测试注入 mock；运行时用 window.electron.project 实现） */
export interface ProjectHistoryIo {
  listFiles: (id: number | string, fileType: 'text' | 'excel') => Promise<Array<{ path: string }>>
  readFile: (id: number | string, relPath: string, projectName?: string) => Promise<string>
  writeFile: (id: number | string, relPath: string, content: string, projectName?: string) => Promise<void>
  readExcel: (id: number | string, relPath: string, projectName?: string) => Promise<ExcelSheet[]>
  writeExcel: (id: number | string, relPath: string, sheets: ExcelSheet[], projectName?: string) => Promise<void>
}

/** 版本历史保留上限（最近 N 版） */
export const VERSION_HISTORY_LIMIT = 10
/** 备份保留上限（轮转） */
export const BACKUP_LIMIT = 5
/** 单快照体积上限（超过则跳过，防止超大 Excel 撑爆） */
export const SNAPSHOT_MAX_BYTES = 4 * 1024 * 1024

const RUNTIME_TOP_DIRS = new Set(['output', 'yaml', 'output-label', 'output-label-md', 'output-label-pdf', 'snippets'])

function scopeDir(scope: HistoryScope): string {
  return scope === 'backup' ? '.mc_backups' : '.mc_history'
}

function storeFilePath(scope: HistoryScope): string {
  return `${scopeDir(scope)}/snapshots.json`
}

function scopeLimit(scope: HistoryScope): number {
  return scope === 'backup' ? BACKUP_LIMIT : VERSION_HISTORY_LIMIT
}

/** 是否属于项目配置/参数/模板文件（排除运行时产物 output/yaml/label 与隐藏目录） */
export function isProjectConfigPath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  const top = segments[0]
  if (!top) return false
  if (top.startsWith('.')) return false
  if (RUNTIME_TOP_DIRS.has(top)) return false
  return true
}

/** 文本配置类文件（模板 + 元数据 + 规划 JSON），排除说明类 md/txt */
export function isConfigTextPath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/')
  return normalized === 'template.meta.json' || normalized === 'plan.json' || normalized.startsWith('templates/')
}

/** 保留最近 limit 条 */
export function rotateItems<T>(items: T[], limit: number): T[] {
  return items.slice(-limit)
}

export function buildStoreFile(scope: HistoryScope, items: HistoryStoreItem[]): HistoryStoreFile {
  return { schema_version: 1, scope, items: rotateItems(items, scopeLimit(scope)) }
}

export function parseStoreFile(data: unknown): HistoryStoreFile | null {
  const d = data as Partial<HistoryStoreFile> | null
  if (!d || d.schema_version !== 1 || !d.scope || !Array.isArray(d.items)) return null
  if (d.scope !== 'history' && d.scope !== 'backup') return null
  return { schema_version: 1, scope: d.scope, items: d.items as HistoryStoreItem[] }
}

/**
 * 容量受控：轮转后若整体仍超阈值，丢弃最旧版本；单条版本仍超限则返回 null（放弃）。
 */
export function capStoreByBytes(items: HistoryStoreItem[], maxBytes: number): HistoryStoreItem[] | null {
  let current = rotateItems(items, VERSION_HISTORY_LIMIT)
  let json = JSON.stringify({ items: current })
  while (current.length > 1 && json.length > maxBytes) {
    current = current.slice(1)
    json = JSON.stringify({ items: current })
  }
  if (json.length > maxBytes) return null
  return current
}

/** 收集项目配置/参数/模板文件（读取内容） */
export async function collectEntries(project: ProjectRef, io: ProjectHistoryIo): Promise<HistoryFileEntry[]> {
  const entries: HistoryFileEntry[] = []
  try {
    const excelList = await io.listFiles(project.id, 'excel')
    for (const f of excelList) {
      if (!isProjectConfigPath(f.path)) continue
      const sheets = await io.readExcel(project.id, f.path, project.name)
      entries.push({ path: f.path, kind: 'excel', content: sheets })
    }
    const textList = await io.listFiles(project.id, 'text')
    for (const f of textList) {
      if (!isProjectConfigPath(f.path) || !isConfigTextPath(f.path)) continue
      const content = await io.readFile(project.id, f.path, project.name)
      entries.push({ path: f.path, kind: 'text', content })
    }
  } catch {
    /* 读取失败则跳过对应文件 */
  }
  return entries
}

async function readStore(scope: HistoryScope, project: ProjectRef, io: ProjectHistoryIo): Promise<HistoryStoreItem[]> {
  try {
    const raw = await io.readFile(project.id, storeFilePath(scope), project.name)
    if (!raw) return []
    const parsed = parseStoreFile(JSON.parse(raw))
    return parsed ? parsed.items : []
  } catch {
    return []
  }
}

async function writeStore(
  scope: HistoryScope,
  project: ProjectRef,
  items: HistoryStoreItem[],
  io: ProjectHistoryIo,
): Promise<void> {
  const store = buildStoreFile(scope, items)
  await io.writeFile(project.id, storeFilePath(scope), JSON.stringify(store, null, 2), project.name)
}

let snapSeq = 0

/** 创建快照（版本历史或备份），自动轮转保留最近 N 份 */
export async function snapshotScope(
  project: ProjectRef,
  scope: HistoryScope,
  note: string,
  io: ProjectHistoryIo,
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const entries = await collectEntries(project, io)
  const id = `${Date.now()}-${++snapSeq}`
  const item: HistoryStoreItem = {
    id,
    timestamp: new Date().toISOString(),
    note: note || '',
    fileCount: entries.length,
    files: entries,
  }
  const current = rotateItems([...(await readStore(scope, project, io)), item], scopeLimit(scope))
  const capped = capStoreByBytes(current, SNAPSHOT_MAX_BYTES)
  if (!capped) return { ok: false, reason: 'too_large' }
  try {
    await writeStore(scope, project, capped, io)
  } catch {
    return { ok: false, reason: 'write_failed' }
  }
  return { ok: true, id }
}

/** 列出快照（版本历史或备份）元信息 */
export async function listScope(
  project: ProjectRef,
  scope: HistoryScope,
  io: ProjectHistoryIo,
): Promise<VersionMeta[]> {
  const items = await readStore(scope, project, io)
  return items.map(({ id, timestamp, note, fileCount }) => ({ id, timestamp, note, fileCount }))
}

/** 恢复指定快照：把历史内容写回原配置路径（Excel 走 writeExcel、文本走 writeFile） */
export async function restoreScope(
  project: ProjectRef,
  scope: HistoryScope,
  id: string,
  io: ProjectHistoryIo,
): Promise<{ ok: boolean; restored?: number; reason?: string }> {
  const items = await readStore(scope, project, io)
  const item = items.find((it) => it.id === id)
  if (!item) return { ok: false, reason: 'not_found' }
  let restored = 0
  for (const entry of item.files) {
    try {
      if (entry.kind === 'excel') {
        await io.writeExcel(project.id, entry.path, entry.content as ExcelSheet[], project.name)
      } else {
        await io.writeFile(project.id, entry.path, entry.content as string, project.name)
      }
      restored++
    } catch {
      /* 单文件恢复失败继续其余文件 */
    }
  }
  return { ok: true, restored }
}

// ===== 运行时 IO 与 UI 状态 =====

/** 基于 window.electron.project 的默认 IO（惰性读取，未在 Electron 环境调用时返回可失败实现） */
export function defaultHistoryIo(): ProjectHistoryIo {
  const p = typeof window !== 'undefined' ? window.electron?.project : undefined
  if (!p) {
    const fail = async (): Promise<never> => {
      throw new Error('项目 IPC 不可用')
    }
    return {
      listFiles: fail,
      readFile: fail,
      writeFile: fail,
      readExcel: fail,
      writeExcel: fail,
    }
  }
  return {
    listFiles: (id, type) => p.listFiles(String(id), type),
    readFile: (id, rel, name) => p.readFile(Number(id), rel, name),
    writeFile: (id, rel, content, name) => p.writeFile(Number(id), rel, content, name),
    readExcel: (id, rel, name) => p.readExcel(Number(id), rel, name),
    writeExcel: (id, rel, sheets, name) => p.writeExcel(Number(id), rel, sheets, name),
  }
}

interface ProjectHistoryState {
  busy: boolean
  message: string | null
  kind: 'success' | 'error' | null
  setBusy: (busy: boolean) => void
  notify: (kind: 'success' | 'error', message: string) => void
  clearMessage: () => void
}

export const useProjectHistoryStore = create<ProjectHistoryState>()((set) => ({
  busy: false,
  message: null,
  kind: null,
  setBusy: (busy) => set({ busy }),
  notify: (kind, message) => set({ kind, message }),
  clearMessage: () => set({ message: null, kind: null }),
}))

/** 手动创建备份（轮转保留最近 5 份） */
export async function createBackup(project: ProjectRef): Promise<{ ok: boolean; reason?: string }> {
  return snapshotScope(project, 'backup', '手动备份', defaultHistoryIo())
}

/** 一键恢复：恢复最近一次备份 */
export async function restoreLatestBackup(
  project: ProjectRef,
): Promise<{ ok: boolean; restored?: number; reason?: string }> {
  const items = await listScope(project, 'backup', defaultHistoryIo())
  const latest = items[items.length - 1]
  if (!latest) return { ok: false, reason: 'no_backup' }
  return restoreScope(project, 'backup', latest.id, defaultHistoryIo())
}
