import fs from 'fs'
import path from 'path'

export interface TemplateFileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: TemplateFileNode[]
}

export interface TemplateProjectStatus {
  hasExcel: boolean
  hasTemplates: boolean
  hasPara: boolean
  hasOutput: boolean
  hasYaml: boolean
  hasLabelOutput: boolean
}

export interface TemplateMeta {
  name: string
  description: string
  scenario: string
  sourceProject: string
  updatedAt: string
  inputRequirements: string[]
  outputDescription: string
}

export interface TemplateInfo extends TemplateMeta {
  id: string
  path: string
  structure: TemplateProjectStatus
  files: TemplateFileNode[]
}

const META_FILE = 'template.meta.json'

export function buildDefaultTemplateMeta(name: string): TemplateMeta {
  return {
    name,
    description: `${name} 模板`,
    scenario: '',
    sourceProject: '',
    updatedAt: new Date().toISOString(),
    inputRequirements: [],
    outputDescription: '',
  }
}

export function readTemplateMeta(templateDir: string, fallbackName: string): TemplateMeta {
  const metaPath = path.join(templateDir, META_FILE)
  if (!fs.existsSync(metaPath)) return buildDefaultTemplateMeta(fallbackName)
  const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as Partial<TemplateMeta>
  return {
    ...buildDefaultTemplateMeta(fallbackName),
    ...raw,
    inputRequirements: Array.isArray(raw.inputRequirements) ? raw.inputRequirements : [],
  }
}

export function writeTemplateMeta(templateDir: string, meta: Partial<TemplateMeta>): TemplateMeta {
  fs.mkdirSync(templateDir, { recursive: true })
  const fallbackName = path.basename(templateDir)
  const next: TemplateMeta = {
    ...buildDefaultTemplateMeta(fallbackName),
    ...meta,
    updatedAt: new Date().toISOString(),
    inputRequirements: Array.isArray(meta.inputRequirements) ? meta.inputRequirements : [],
  }
  fs.writeFileSync(path.join(templateDir, META_FILE), JSON.stringify(next, null, 2), 'utf-8')
  return next
}

export function computeProjectStatus(projectDir: string): TemplateProjectStatus {
  const hasDirectory = (name: string) => fs.existsSync(path.join(projectDir, name))
  const templatesDir = path.join(projectDir, 'templates')
  const hasTemplates = fs.existsSync(templatesDir) && fs.readdirSync(templatesDir).length > 0
  return {
    hasExcel: hasDirectory('excel'),
    hasTemplates,
    hasPara: fs.existsSync(path.join(projectDir, 'para.xlsx')),
    hasOutput: hasDirectory('output'),
    hasYaml: hasDirectory('yaml'),
    hasLabelOutput: hasDirectory('output-label'),
  }
}

function buildFileTree(dirPath: string, basePath: string): TemplateFileNode[] {
  if (!fs.existsSync(dirPath)) return []
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && entry.name !== '__pycache__')
    .map((entry) => {
      const fullPath = path.join(dirPath, entry.name)
      const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/')
      return {
        name: entry.name,
        path: relativePath,
        isDirectory: entry.isDirectory(),
        children: entry.isDirectory() ? buildFileTree(fullPath, basePath) : undefined,
      }
    })
}

function isTemplateLikeDir(dirPath: string): boolean {
  return ['para.xlsx', 'excel', 'templates', META_FILE].some((name) => fs.existsSync(path.join(dirPath, name)))
}

export function listTemplateInfosFromDir(templateRoot: string): TemplateInfo[] {
  if (!fs.existsSync(templateRoot)) return []
  return fs
    .readdirSync(templateRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .filter((entry) => isTemplateLikeDir(path.join(templateRoot, entry.name)))
    .map((entry) => {
      const templateDir = path.join(templateRoot, entry.name)
      const meta = readTemplateMeta(templateDir, entry.name)
      return {
        id: entry.name,
        path: `template/${entry.name}`,
        ...meta,
        structure: computeProjectStatus(templateDir),
        files: buildFileTree(templateDir, templateDir),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
