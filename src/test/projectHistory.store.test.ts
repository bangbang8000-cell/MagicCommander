/**
 * S-3 / S-4：项目配置版本回滚（保留最近 N 版、重启保留）+ 备份轮转 + 一键恢复（数据一致）
 * V4.2.0-42-b/42-c
 */
import { describe, it, expect, vi } from 'vitest'
import {
  isProjectConfigPath,
  buildStoreFile,
  parseStoreFile,
  capStoreByBytes,
  rotateItems,
  VERSION_HISTORY_LIMIT,
  BACKUP_LIMIT,
  snapshotScope,
  restoreScope,
  listScope,
  collectEntries,
} from '@/stores/projectHistory.store'
import type { ProjectHistoryIo, HistoryScope, ProjectRef, HistoryStoreItem } from '@/stores/projectHistory.store'

const project: ProjectRef = { id: 1, name: 'test1' }

function makeIo(): ProjectHistoryIo & {
  written: Record<string, string>
  excelWritten: Record<string, unknown[]>
  listExcel: string[]
  listText: string[]
  files: Record<string, string>
  excel: Record<string, unknown[]>
} {
  const io = {
    written: {} as Record<string, string>,
    excelWritten: {} as Record<string, unknown[]>,
    listExcel: ['para.xlsx', 'excel/parameter.xlsx', 'output/x.bin'],
    listText: ['templates/ASW.j2', 'template.meta.json', 'output/device.txt', '.mc_history/manifest.json'],
    files: {} as Record<string, string>,
    excel: {} as Record<string, unknown[]>,
    listFiles: vi.fn(async (_id: number | string, type: 'text' | 'excel') => {
      const paths =
        type === 'excel' ? (io as { listExcel: string[] }).listExcel : (io as { listText: string[] }).listText
      return paths.map((p) => ({ path: p }))
    }),
    readFile: vi.fn(async (_id: number | string, relPath: string) => {
      const w = (io as { written: Record<string, string> }).written
      const f = (io as { files: Record<string, string> }).files
      return (w[relPath] ?? f[relPath] ?? `content:${relPath}`) as string
    }),
    writeFile: vi.fn(async (_id: number | string, relPath: string, content: string) => {
      ;(io as { written: Record<string, string> }).written[relPath] = content
    }),
    readExcel: vi.fn(async (_id: number | string, relPath: string) => {
      return ((io as { excel: Record<string, unknown[]> }).excel[relPath] ?? [
        { name: 'Sheet1', headers: ['h1'], rows: [{ h1: relPath }] },
      ]) as { name: string; headers: string[]; rows: Record<string, unknown>[] }[]
    }),
    writeExcel: vi.fn(
      async (
        _id: number | string,
        relPath: string,
        sheets: { name: string; headers: string[]; rows: Record<string, unknown>[] }[],
      ) => {
        ;(io as { excelWritten: Record<string, unknown[]> }).excelWritten[relPath] = sheets
      },
    ),
  } as unknown as ProjectHistoryIo & {
    written: Record<string, string>
    excelWritten: Record<string, unknown[]>
    listExcel: string[]
    listText: string[]
    files: Record<string, string>
    excel: Record<string, unknown[]>
  }
  return io
}

describe('isProjectConfigPath（排除运行时产物与隐藏目录）', () => {
  it('保留项目配置/参数/模板文件', () => {
    expect(isProjectConfigPath('para.xlsx')).toBe(true)
    expect(isProjectConfigPath('excel/parameter.xlsx')).toBe(true)
    expect(isProjectConfigPath('templates/ASW.j2')).toBe(true)
    expect(isProjectConfigPath('template.meta.json')).toBe(true)
  })

  it('排除 output/yaml/隐藏历史/备份目录', () => {
    expect(isProjectConfigPath('output/device.txt')).toBe(false)
    expect(isProjectConfigPath('yaml/dev.yaml')).toBe(false)
    expect(isProjectConfigPath('.mc_history/manifest.json')).toBe(false)
    expect(isProjectConfigPath('.mc_backups/b/1.json')).toBe(false)
    expect(isProjectConfigPath('.output_backups/x')).toBe(false)
  })
})

describe('collectEntries（读取配置/参数 + 模板）', () => {
  it('只收集配置类文件，运行时产物不进入快照', async () => {
    const io = makeIo()
    const entries = await collectEntries(project, io)
    const paths = entries.map((e) => e.path)
    expect(paths).toContain('para.xlsx')
    expect(paths).toContain('excel/parameter.xlsx')
    expect(paths).toContain('templates/ASW.j2')
    expect(paths).toContain('template.meta.json')
    expect(paths).not.toContain('output/x.bin')
    expect(paths).not.toContain('output/device.txt')
    expect(paths).not.toContain('.mc_history/manifest.json')
  })
})

describe('版本快照/回滚（S-3）', () => {
  it('snapshotScope 轮转保留最近 N 版（重启保留于项目目录 snapshots.json）', async () => {
    const io = makeIo()
    for (let i = 0; i < VERSION_HISTORY_LIMIT + 5; i++) {
      const r = await snapshotScope(project, 'history', `v${i}`, io)
      expect(r.ok).toBe(true)
    }
    const items = await listScope(project, 'history', io)
    expect(items.length).toBe(VERSION_HISTORY_LIMIT)
    // 单文件存储于 .mc_history/snapshots.json
    expect(io.written['.mc_history/snapshots.json']).toBeTruthy()
    const store = parseStoreFile(JSON.parse(io.written['.mc_history/snapshots.json']))
    expect(store).not.toBeNull()
    expect(store!.items.length).toBe(VERSION_HISTORY_LIMIT)
    expect(store!.items[store!.items.length - 1].note).toBe(`v${VERSION_HISTORY_LIMIT + 4}`)
  })

  it('restoreScope 把历史版本写回原路径（Excel 走 writeExcel、文本走 writeFile）', async () => {
    const io = makeIo()
    await snapshotScope(project, 'history', 'v1', io)
    const items = await listScope(project, 'history', io)
    const id = items[0].id

    // 修改当前文件内容后回滚
    io.excel['para.xlsx'] = [{ name: 'S', headers: ['a'], rows: [{ a: 'MODIFIED' }] }]
    io.files['templates/ASW.j2'] = 'MODIFIED'
    const r = await restoreScope(project, 'history', id, io)
    expect(r.ok).toBe(true)
    expect(r.restored).toBeGreaterThanOrEqual(4)

    // Excel 恢复为快照内容
    const excelBack = io.excelWritten['para.xlsx'] as {
      name: string
      headers: string[]
      rows: Record<string, unknown>[]
    }[]
    expect(excelBack[0].rows[0].h1).toBe('para.xlsx')
    // 文本恢复为快照内容（写回原路径）
    expect(io.written['templates/ASW.j2']).toBe('content:templates/ASW.j2')
  })

  it('restoreScope 对不存在的版本返回 not_found', async () => {
    const io = makeIo()
    const r = await restoreScope(project, 'history', 'no-such-id', io)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('not_found')
  })
})

describe('备份轮转 + 一键恢复（S-4）', () => {
  it('备份独立保留最近 5 份，不污染版本历史', async () => {
    const io = makeIo()
    for (let i = 0; i < BACKUP_LIMIT + 5; i++) {
      const r = await snapshotScope(project, 'backup', `b${i}`, io)
      expect(r.ok).toBe(true)
    }
    const backups = await listScope(project, 'backup', io)
    expect(backups.length).toBe(BACKUP_LIMIT)
    expect(io.written['.mc_backups/snapshots.json']).toBeTruthy()
    // 备份不写入版本历史目录
    expect(io.written['.mc_history/snapshots.json']).toBeFalsy()
  })

  it('一键恢复 = 恢复最近一次备份，数据一致', async () => {
    const io = makeIo()
    // 第一份备份：默认内容
    await snapshotScope(project, 'backup', 'initial', io)
    // 修改 para.xlsx 后再备份
    io.excel['para.xlsx'] = [{ name: 'S', headers: ['a'], rows: [{ a: 'CHANGED' }] }]
    await snapshotScope(project, 'backup', 'after-change', io)
    const items = await listScope(project, 'backup', io)
    const latest = items[items.length - 1]

    // 当前文件又被改动
    io.excel['para.xlsx'] = [{ name: 'S', headers: ['a'], rows: [{ a: 'CURRENT' }] }]
    const r = await restoreScope(project, 'backup', latest.id, io)
    expect(r.ok).toBe(true)
    const excelBack = io.excelWritten['para.xlsx'] as {
      name: string
      headers: string[]
      rows: Record<string, unknown>[]
    }[]
    expect(excelBack[0].rows[0].a).toBe('CHANGED')
  })
})

describe('store 文件校验/构建/容量', () => {
  it('parseStoreFile 拒绝损坏数据', () => {
    expect(parseStoreFile(null)).toBeNull()
    expect(parseStoreFile({})).toBeNull()
    expect(parseStoreFile({ schema_version: 1, scope: 'history', items: 'nope' })).toBeNull()
  })

  it('buildStoreFile/rotateItems 保留最近 N 条', () => {
    const items: HistoryStoreItem[] = Array.from({ length: 11 }, (_, i) => ({
      id: String(i),
      timestamp: String(i),
      note: '',
      fileCount: 0,
      files: [],
    }))
    expect(rotateItems(items, BACKUP_LIMIT)).toHaveLength(BACKUP_LIMIT)
    const store = buildStoreFile('backup' as HistoryScope, items)
    expect(store.items).toHaveLength(BACKUP_LIMIT)
  })

  it('capStoreByBytes 超限丢弃最旧版本；单条仍超限返回 null', () => {
    const items: HistoryStoreItem[] = [1, 2, 3, 4, 5].map((n) => ({
      id: String(n),
      timestamp: String(n),
      note: '',
      fileCount: 1,
      files: [{ path: 'x.json', kind: 'text' as const, content: 'x'.repeat(1000) }],
    }))
    const capped = capStoreByBytes(items, 2500)
    expect(capped).not.toBeNull()
    expect(capped!.length).toBeLessThan(items.length)

    const huge: HistoryStoreItem[] = [
      {
        id: '1',
        timestamp: '1',
        note: '',
        fileCount: 1,
        files: [{ path: 'x.json', kind: 'text' as const, content: 'x'.repeat(100_000) }],
      },
    ]
    expect(capStoreByBytes(huge, 1000)).toBeNull()
  })
})
