import fs from 'fs'
import path from 'path'
import { computeProjectStatus, listTemplateInfosFromDir, type TemplateInfo, type TemplateProjectStatus } from './template.service'

const INDEX_FILE = 'mc-workspace.json'

export interface WorkspaceProjectInfo {
  id: number
  name: string
  index: number
  path: string
  createdAt?: string
  updatedAt?: string
  lastOpenedAt?: string
  status: TemplateProjectStatus
}

export interface WorkspaceIndex {
  version: 1
  updatedAt: string
  projects: WorkspaceProjectInfo[]
  templates: TemplateInfo[]
}

function isProjectLikeDir(dirPath: string): boolean {
  return ['para.xlsx', 'excel', 'templates', 'output', 'yaml', 'output-label'].some((name) => fs.existsSync(path.join(dirPath, name)))
}

export function scanWorkspaceIndex(workspaceDir: string): WorkspaceIndex {
  const projects: WorkspaceProjectInfo[] = fs.existsSync(workspaceDir)
    ? fs
        .readdirSync(workspaceDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'template')
        .filter((entry) => isProjectLikeDir(path.join(workspaceDir, entry.name)))
        .map((entry, idx) => {
          const projectDir = path.join(workspaceDir, entry.name)
          const stat = fs.statSync(projectDir)
          return {
            id: idx + 1,
            name: entry.name,
            index: idx + 1,
            path: entry.name,
            createdAt: stat.birthtime.toISOString(),
            updatedAt: stat.mtime.toISOString(),
            status: computeProjectStatus(projectDir),
          }
        })
    : []

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    projects,
    templates: listTemplateInfosFromDir(path.join(workspaceDir, 'template')),
  }
}

export function writeWorkspaceIndex(workspaceDir: string, index: WorkspaceIndex): void {
  fs.mkdirSync(workspaceDir, { recursive: true })
  fs.writeFileSync(path.join(workspaceDir, INDEX_FILE), JSON.stringify({ ...index, updatedAt: new Date().toISOString() }, null, 2), 'utf-8')
}

export function readWorkspaceIndex(workspaceDir: string): WorkspaceIndex {
  const indexPath = path.join(workspaceDir, INDEX_FILE)
  if (!fs.existsSync(indexPath)) {
    const index = scanWorkspaceIndex(workspaceDir)
    writeWorkspaceIndex(workspaceDir, index)
    return index
  }
  const raw = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as Partial<WorkspaceIndex>
  return {
    version: 1,
    updatedAt: raw.updatedAt || new Date().toISOString(),
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    templates: Array.isArray(raw.templates) ? raw.templates : [],
  }
}

export function refreshWorkspaceIndex(workspaceDir: string): WorkspaceIndex {
  const index = scanWorkspaceIndex(workspaceDir)
  writeWorkspaceIndex(workspaceDir, index)
  return index
}
