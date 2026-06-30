import { PythonService } from '../services/python.service'
import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'

const isDev = process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged

// dev 模式：从 dist-electron/ipc/project.handler.js -> ../../ 指向项目根目录
const BASE_DIR = isDev
  ? path.join(__dirname, '..', '..')
  : path.join(process.resourcesPath)

const WORKSPACE_DIR = path.join(BASE_DIR, 'workspace')

export class ProjectHandler {
  constructor(private python: PythonService) {}

  list(): string[] {
    const mcParaPath = path.join(WORKSPACE_DIR, 'MC_Para.xlsx')
    if (!fs.existsSync(mcParaPath)) return []
    const wb = XLSX.readFile(mcParaPath)
    const sheet = wb.Sheets['项目名称']
    if (!sheet) return []
    const data: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet)
    return data.map((r) => String(r['项目名称'] || '')).filter(Boolean)
  }

  async create(name: string): Promise<void> {
    if (!name) throw new Error('项目名不能为空')
    const projectDir = path.join(WORKSPACE_DIR, name)
    if (fs.existsSync(projectDir)) throw new Error(`项目 ${name} 已存在`)

    fs.mkdirSync(path.join(projectDir, 'excel'), { recursive: true })
    fs.mkdirSync(path.join(projectDir, 'templates'), { recursive: true })

    const examplePath = path.join(WORKSPACE_DIR, 'para_examples.xlsx')
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, path.join(projectDir, 'para.xlsx'))
    }

    const mcParaPath = path.join(WORKSPACE_DIR, 'MC_Para.xlsx')
    const wb = XLSX.readFile(mcParaPath)
    const sheet = wb.Sheets['项目名称']
    const data: Record<string, unknown>[] = sheet ? XLSX.utils.sheet_to_json(sheet) : []
    data.push({ 项目名称: name })
    wb.Sheets['项目名称'] = XLSX.utils.json_to_sheet(data)
    XLSX.writeFile(wb, mcParaPath)
  }

  async delete(ids: string[]): Promise<void> {
    const projects = this.list()
    for (const id of ids) {
      const name = projects[parseInt(id, 10) - 1]
      if (!name) continue
      const dir = path.join(WORKSPACE_DIR, name)
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }
    const mcParaPath = path.join(WORKSPACE_DIR, 'MC_Para.xlsx')
    const wb = XLSX.readFile(mcParaPath)
    const sheet = wb.Sheets['项目名称']
    const data: Record<string, unknown>[] = sheet ? XLSX.utils.sheet_to_json(sheet) : []
    const filtered = data.filter((_, idx) => !ids.includes(String(idx + 1)))
    wb.Sheets['项目名称'] = XLSX.utils.json_to_sheet(filtered)
    XLSX.writeFile(wb, mcParaPath)
  }

  getStructure(name: string): { name: string; path: string; isDirectory: boolean; children?: unknown[] }[] {
    const projectDir = path.join(WORKSPACE_DIR, name)
    if (!fs.existsSync(projectDir)) return []
    return this.walk(projectDir, projectDir)
  }

  private walk(dir: string, baseDir: string): { name: string; path: string; isDirectory: boolean; children?: unknown[] }[] {
    return fs.readdirSync(dir, { withFileTypes: true }).map((entry) => {
      const fullPath = path.join(dir, entry.name)
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: relativePath,
          isDirectory: true,
          children: this.walk(fullPath, baseDir),
        }
      }
      return { name: entry.name, path: relativePath, isDirectory: false }
    })
  }
}
