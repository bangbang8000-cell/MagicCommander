import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildDefaultTemplateMeta,
  computeProjectStatus,
  listTemplateInfosFromDir,
  readTemplateMeta,
  writeTemplateMeta,
} from '../services/template.service'

let tempRoot = ''

const makeRoot = () => {
  tempRoot = mkdtempSync(path.join(tmpdir(), 'mc-template-'))
  return tempRoot
}

afterEach(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true })
  tempRoot = ''
})

describe('template.service', () => {
  it('builds default meta for legacy template folders', () => {
    const meta = buildDefaultTemplateMeta('legacy-template')
    expect(meta.name).toBe('legacy-template')
    expect(meta.description).toContain('legacy-template')
    expect(meta.inputRequirements).toEqual([])
  })

  it('reads and writes template meta', () => {
    const root = makeRoot()
    const templateDir = path.join(root, 'campus')
    mkdirSync(templateDir, { recursive: true })
    writeTemplateMeta(templateDir, {
      name: '园区模板',
      description: '标准园区模板',
      scenario: '园区网络',
      sourceProject: 'test2',
      inputRequirements: ['hostname 表'],
      outputDescription: '生成配置',
    })
    const raw = JSON.parse(readFileSync(path.join(templateDir, 'template.meta.json'), 'utf-8'))
    const meta = readTemplateMeta(templateDir, 'campus')
    expect(raw.name).toBe('园区模板')
    expect(meta.scenario).toBe('园区网络')
    expect(meta.updatedAt).toMatch(/T/)
  })

  it('computes project-like structure summary', () => {
    const root = makeRoot()
    mkdirSync(path.join(root, 'excel'), { recursive: true })
    mkdirSync(path.join(root, 'templates'), { recursive: true })
    writeFileSync(path.join(root, 'templates', 'ASW.j2'), '')
    writeFileSync(path.join(root, 'para.xlsx'), '')
    const status = computeProjectStatus(root)
    expect(status.hasExcel).toBe(true)
    expect(status.hasTemplates).toBe(true)
    expect(status.hasPara).toBe(true)
  })

  it('lists legacy folders as templates', () => {
    const root = makeRoot()
    mkdirSync(path.join(root, 'legacy', 'templates'), { recursive: true })
    writeFileSync(path.join(root, 'legacy', 'templates', 'ASW.j2'), '')
    const templates = listTemplateInfosFromDir(root)
    expect(templates).toHaveLength(1)
    expect(templates[0].id).toBe('legacy')
  })
})
