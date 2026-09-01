import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = process.cwd()
const goldenDir = path.join(root, 'tests', 'golden')

describe('门禁脚本自测（4.0.0-F0-1，G-2/G-3/G-4）', () => {
  it('golden 基线文件存在且结构完整（render_hash + batch_manifest）', () => {
    const files = fs.readdirSync(goldenDir).filter((f) => f.endsWith('.json'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const snap = JSON.parse(fs.readFileSync(path.join(goldenDir, f), 'utf-8'))
      expect(snap.render_hash).toBeTypeOf('string')
      expect(snap.render_hash).toHaveLength(16)
      expect(Array.isArray(snap.batch_manifest)).toBe(true)
      expect(snap.device_count).toBeGreaterThan(0)
    }
  })

  it('门禁脚本齐备且 CLI 契约一致', () => {
    for (const s of ['gen_golden.py', 'validate_templates.py', 'bench_perf.py']) {
      const p = path.join(root, 'scripts', s)
      expect(fs.existsSync(p), `${s} 缺失`).toBe(true)
    }
    const golden = fs.readFileSync(path.join(root, 'scripts', 'gen_golden.py'), 'utf-8')
    expect(golden).toContain('--check')
    expect(golden).toContain('render_hash')
    const validate = fs.readFileSync(path.join(root, 'scripts', 'validate_templates.py'), 'utf-8')
    expect(validate).toContain('template.meta.json')
    const bench = fs.readFileSync(path.join(root, 'scripts', 'bench_perf.py'), 'utf-8')
    expect(bench).toContain('--projects')
  })

  it('sync-version 支持 --check 与 --release-notes 入口', () => {
    const src = fs.readFileSync(path.join(root, 'scripts', 'sync-version.js'), 'utf-8')
    expect(src).toContain('--check')
    expect(src).toContain('--release-notes')
  })
})
