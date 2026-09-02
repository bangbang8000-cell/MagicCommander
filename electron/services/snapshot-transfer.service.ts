/**
 * 4.8.0（F8-2 / 48-b）：项目历史快照「导出为文件 / 导入合并」可移植格式。
 *
 * 将项目目录 .mc_history/snapshots.json（或 .mc_backups/snapshots.json）包装为
 * 带 schema/version/kind 的便携包，可导出到任意路径；导入时校验格式后按 id 合并
 * （去重）+ 容量轮转（与 projectHistory.store 的保留上限一致）。
 * 纯函数便于主进程 IPC + 单测。
 */

/** 快照存储文件结构（与 src/stores/projectHistory.store 对齐） */
export interface SnapshotStoreItem {
  id: string
  timestamp: string
  note: string
  fileCount: number
  files: unknown[]
}

export interface SnapshotStore {
  schema_version: number
  scope: 'history' | 'backup'
  items: SnapshotStoreItem[]
}

export const SNAPSHOT_EXPORT_SCHEMA = 'mc.snapshot-bundle/1'
export const SNAPSHOT_EXPORT_VERSION = 1
/** 历史版本保留上限（与 VERSION_HISTORY_LIMIT 对齐） */
export const SNAPSHOT_HISTORY_LIMIT = 10
/** 备份保留上限（与 BACKUP_LIMIT 对齐） */
export const SNAPSHOT_BACKUP_LIMIT = 5

export interface SnapshotExportBundle {
  schema: string
  version: number
  kind: 'snapshot-bundle'
  exportedAt: string
  data: unknown
}

/** 包装快照存储为可移植导出格式 */
export function buildSnapshotExport(store: unknown): SnapshotExportBundle {
  return {
    schema: SNAPSHOT_EXPORT_SCHEMA,
    version: SNAPSHOT_EXPORT_VERSION,
    kind: 'snapshot-bundle',
    exportedAt: new Date().toISOString(),
    data: store,
  }
}

/** 解析导入文件：校验 schema/结构，返回快照存储或错误 */
export function parseSnapshotImport(raw: unknown): { ok: true; store: SnapshotStore } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '快照文件为空或格式无效' }
  const d = raw as { schema?: unknown; data?: unknown }
  if (d.schema !== SNAPSHOT_EXPORT_SCHEMA) return { ok: false, error: '快照文件格式不受支持（schema 不匹配）' }
  const store = d.data as Partial<SnapshotStore> | null
  if (!store || typeof store !== 'object') return { ok: false, error: '快照内容缺失' }
  if (store.schema_version !== 1 || !Array.isArray(store.items)) return { ok: false, error: '快照内容结构无效' }
  if (store.scope !== 'history' && store.scope !== 'backup') return { ok: false, error: '快照范围无效' }
  return { ok: true, store: store as SnapshotStore }
}

/** 合并两批快照（按 id 去重，保持已有在前、新增追加） */
export function mergeSnapshotStores(existing: SnapshotStoreItem[], incoming: SnapshotStoreItem[]): SnapshotStoreItem[] {
  const seen = new Set<string>()
  const out: SnapshotStoreItem[] = []
  for (const it of [...(existing || []), ...(incoming || [])]) {
    if (!it || !it.id || seen.has(it.id)) continue
    seen.add(it.id)
    out.push(it)
  }
  return out
}

/** 容量轮转：保留最近 N 条（与既有快照保留策略一致） */
export function rotateSnapshotItems(items: SnapshotStoreItem[], limit: number): SnapshotStoreItem[] {
  return items.slice(-limit)
}

/** 快照保留上限（按 scope） */
export function snapshotLimit(scope: 'history' | 'backup'): number {
  return scope === 'backup' ? SNAPSHOT_BACKUP_LIMIT : SNAPSHOT_HISTORY_LIMIT
}
