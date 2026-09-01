import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import path from 'path'

const root = process.cwd()
const script = path.join(root, 'scripts', 'sync-version.js')

function runNode(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [script, ...args], { encoding: 'utf-8' })
    return { stdout, status: 0 }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return { stdout: String(e.stdout ?? e.stderr ?? ''), status: e.status ?? 1 }
  }
}

describe('版本单源与发布说明抽取（4.0.0-F0-2，G-6）', () => {
  it('--release-notes 输出当前版本发布说明（非空）', () => {
    const r = runNode(['--release-notes'])
    expect(r.status).toBe(0)
    expect(r.stdout.trim().length).toBeGreaterThan(0)
  })

  it('--check 通过（version.json / VERSION.txt / package.json / CHANGELOG 一致）', () => {
    const r = runNode(['--check'])
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('版本信息一致')
    expect(r.stdout).toContain('发布说明已覆盖当前版本')
  })
})
