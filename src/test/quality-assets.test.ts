/**
 * 4.6.0-F6-2（46-b）Q-2：测试数据资产可复用（vitest 侧消费样例）
 * - 消费 tests/fixtures/manifest.json 清单：assets 完整、path 存在、声明 vitest 消费
 * - 消费 samples/64h100_para.json：参数表键值结构 + 64 台 H100 场景元数据
 * - 消费 render-baselines/example1_baseline.json：渲染基线结构（render_hash 长度 16）
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = process.cwd()
const fixturesDir = path.join(root, 'tests', 'fixtures')

function loadJson(rel: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, rel), 'utf-8'))
}

describe('测试数据资产清单（Q-2 vitest 消费）', () => {
  it('manifest 完整且所有资产文件存在，vitest 可消费样例', () => {
    const manifest = loadJson('manifest.json') as {
      schema: string
      assets: Array<{ id: string; category: string; path: string; consumedBy: string[] }>
    }
    expect(manifest.schema.startsWith('mc.quality.fixture-manifest')).toBe(true)
    expect(manifest.assets.length).toBeGreaterThanOrEqual(4)
    let vitestAssets = 0
    for (const asset of manifest.assets) {
      expect(fs.existsSync(path.join(fixturesDir, asset.path)), `资产缺失: ${asset.path}`).toBe(true)
      expect(asset.consumedBy.length).toBeGreaterThan(0)
      if (asset.consumedBy.includes('vitest')) vitestAssets += 1
    }
    expect(vitestAssets).toBeGreaterThanOrEqual(1)
  })

  it('64h100_para 样例：参数表键值结构与 64 台 H100 场景', () => {
    const sample = loadJson('samples/64h100_para.json') as {
      asset: string
      schema: string
      meta: { gpuCount: number; gpuModel: string; racks: number }
      parameters: Array<{ key: string; value: string }>
      consumedBy: string[]
    }
    expect(sample.schema).toBe('mc.quality.fixture/1')
    expect(sample.meta.gpuCount).toBe(64)
    expect(sample.meta.gpuModel).toBe('H100')
    expect(sample.parameters.length).toBeGreaterThanOrEqual(10)
    const params = Object.fromEntries(sample.parameters.map((p) => [p.key, p.value]))
    expect(params.gpu_count).toBe('64')
    expect(params.fabric_mode).toBe('converged')
    expect(sample.consumedBy).toContain('vitest')
  })

  it('多机柜/融合网/存储关闭样例结构一致（键值对参数表）', () => {
    for (const rel of ['samples/multi_rack.json', 'samples/fabric_converged.json', 'samples/storage_off.json']) {
      const sample = loadJson(rel) as {
        schema: string
        meta: Record<string, unknown>
        parameters: Array<{ key: string; value: string }>
      }
      expect(sample.schema).toBe('mc.quality.fixture/1')
      expect(sample.meta.scenario ?? sample.meta).toBeDefined()
      expect(sample.parameters.length).toBeGreaterThan(0)
      for (const p of sample.parameters) {
        expect(typeof p.key).toBe('string')
        expect(typeof p.value).toBe('string')
      }
    }
  })

  it('渲染基线样例：render_hash 长度 16 + 批次清单', () => {
    const base = loadJson('render-baselines/example1_baseline.json') as {
      render_hash: string
      batch_manifest: unknown[]
      device_count: number
    }
    expect(base.render_hash).toHaveLength(16)
    expect(Array.isArray(base.batch_manifest)).toBe(true)
    expect(base.batch_manifest.length).toBeGreaterThan(0)
    expect(base.device_count).toBe(base.batch_manifest.length)
  })
})
