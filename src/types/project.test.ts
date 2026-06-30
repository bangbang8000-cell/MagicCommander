import { describe, expect, it } from 'vitest'
import type { ProjectInfo, FileNode } from './project'

describe('project types', () => {
  it('ProjectInfo has required fields', () => {
    const p: ProjectInfo = { id: 1, name: 'test', index: 0 }
    expect(p.id).toBe(1)
    expect(p.name).toBe('test')
  })

  it('FileNode supports nested children', () => {
    const f: FileNode = {
      name: 'root',
      path: '/root',
      isDirectory: true,
      children: [{ name: 'child', path: '/root/child', isDirectory: false }],
    }
    expect(f.children?.[0].name).toBe('child')
  })
})
