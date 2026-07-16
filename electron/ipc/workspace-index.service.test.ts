import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { readWorkspaceIndex, scanWorkspaceIndex, writeWorkspaceIndex } from '../services/workspace-index.service'

let tempRoot = ''

const makeRoot = () => {
  tempRoot = mkdtempSync(path.join(tmpdir(), 'mc-workspace-'))
  return tempRoot
}

afterEach(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true })
  tempRoot = ''
})

describe('workspace-index.service', () => {
  it('scans projects and templates when index is missing', () => {
    const root = makeRoot()
    mkdirSync(path.join(root, 'test2', 'templates'), { recursive: true })
    mkdirSync(path.join(root, 'test2', 'excel'), { recursive: true })
    writeFileSync(path.join(root, 'test2', 'templates', 'ASW.j2'), '')
    writeFileSync(path.join(root, 'test2', 'para.xlsx'), '')
    mkdirSync(path.join(root, 'template', 'campus', 'templates'), { recursive: true })
    writeFileSync(path.join(root, 'template', 'campus', 'templates', 'ASW.j2'), '')
    const index = scanWorkspaceIndex(root)
    expect(index.projects[0].name).toBe('test2')
    expect(index.templates[0].id).toBe('campus')
  })

  it('writes and reads workspace index', () => {
    const root = makeRoot()
    const index = scanWorkspaceIndex(root)
    writeWorkspaceIndex(root, index)
    const loaded = readWorkspaceIndex(root)
    expect(loaded.version).toBe(1)
  })
})
