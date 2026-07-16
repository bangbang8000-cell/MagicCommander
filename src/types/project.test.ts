import { describe, expect, it } from 'vitest'
import type { FileNode, ProjectInfo, ProjectStatus, TemplateInfo, WorkspaceIndex } from './project'

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

  it('supports project status metadata', () => {
    const status: ProjectStatus = {
      hasExcel: true,
      hasTemplates: true,
      hasPara: true,
      hasOutput: false,
      hasYaml: false,
      hasLabelOutput: false,
    }
    expect(status.hasTemplates).toBe(true)
  })

  it('supports workspace index and template metadata', () => {
    const project: ProjectInfo = { id: 1, name: 'test2', index: 1 }
    const template: TemplateInfo = {
      id: 'campus-switch-standard',
      name: '园区交换机标准模板',
      path: 'template/campus-switch-standard',
      description: '适用于园区接入交换机批量配置生成',
      scenario: '园区网络',
      sourceProject: 'test2',
      updatedAt: '2026-07-16T00:00:00.000Z',
      inputRequirements: ['hostname 表'],
      outputDescription: '生成设备配置、YAML 中间文件和设备标签',
      structure: {
        hasExcel: true,
        hasTemplates: true,
        hasPara: true,
        hasOutput: false,
        hasYaml: false,
        hasLabelOutput: false,
      },
      files: [],
    }
    const index: WorkspaceIndex = {
      version: 1,
      updatedAt: '2026-07-16T00:00:00.000Z',
      projects: [{ ...project, path: 'test2', status: template.structure }],
      templates: [template],
    }
    expect(index.templates[0].sourceProject).toBe('test2')
  })
})
