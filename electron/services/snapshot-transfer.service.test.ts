import { describe, expect, it } from 'vitest'
import {
  buildSnapshotExport,
  mergeSnapshotStores,
  parseSnapshotImport,
  rotateSnapshotItems,
  SNAPSHOT_EXPORT_SCHEMA,
  snapshotLimit,
} from './snapshot-transfer.service'

function item(id: string, note = 'v') {
  return { id, timestamp: '2026-09-02T00:00:00Z', note, fileCount: 1, files: [] }
}

describe('snapshot-transfer.service (48-b)', () => {
  it('buildSnapshotExport 包装 schema/version/kind/data', () => {
    const store = { schema_version: 1, scope: 'history' as const, items: [item('1')] }
    const bundle = buildSnapshotExport(store)
    expect(bundle.schema).toBe(SNAPSHOT_EXPORT_SCHEMA)
    expect(bundle.version).toBe(1)
    expect(bundle.kind).toBe('snapshot-bundle')
    expect(bundle.data).toEqual(store)
  })

  it('parseSnapshotImport 接受合法导出', () => {
    const bundle = buildSnapshotExport({ schema_version: 1, scope: 'history' as const, items: [item('1')] })
    const parsed = parseSnapshotImport(bundle)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.store.items).toHaveLength(1)
  })

  it('parseSnapshotImport 拒绝非法格式（schema/结构/scope）', () => {
    expect(parseSnapshotImport(null).ok).toBe(false)
    expect(parseSnapshotImport({}).ok).toBe(false)
    expect(parseSnapshotImport({ schema: 'x' }).ok).toBe(false)
    expect(parseSnapshotImport(buildSnapshotExport({ schema_version: 2, scope: 'history' as const, items: [] })).ok).toBe(false)
    expect(parseSnapshotImport(buildSnapshotExport({ schema_version: 1, scope: 'other' as const, items: [] })).ok).toBe(false)
  })

  it('mergeSnapshotStores 按 id 去重合并', () => {
    const merged = mergeSnapshotStores([item('a'), item('b')], [item('b'), item('c')])
    expect(merged.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('rotateSnapshotItems 保留最近 N 条', () => {
    const items = [item('1'), item('2'), item('3')]
    expect(rotateSnapshotItems(items, 2).map((x) => x.id)).toEqual(['2', '3'])
  })

  it('snapshotLimit 按 scope 返回保留上限', () => {
    expect(snapshotLimit('history')).toBe(10)
    expect(snapshotLimit('backup')).toBe(5)
  })
})
