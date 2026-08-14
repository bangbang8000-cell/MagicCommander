import { ipcMain, BrowserWindow, shell, safeStorage, app, dialog } from 'electron'
import { spawn } from 'child_process'
import { RenderHandler } from './render.handler'
import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'
import iconv from 'iconv-lite'
import mammoth from 'mammoth'
import packageJson from '../../package.json'
import {
  validateFilePath,
  validateFileContent,
  buildSafePath,
  isPathSafe,
  isFileTypeAllowed,
  isFileAccessible,
  validateProjectName,
} from '../utils/security'
import { logger } from '../utils/logger'
import {
  getBackendDir,
  getExampleDir,
  getTemplateDir,
  getWorkspaceDir,
  getUserDataDir,
  getPythonPath,
  APP_CONFIG,
} from '../config'
import electronI18n from '../electron-i18n'
import {
  listTemplateInfosFromDir,
  readTemplateMeta,
  writeTemplateMeta,
  type TemplateMeta,
} from '../services/template.service'
import { readWorkspaceIndex, refreshWorkspaceIndex } from '../services/workspace-index.service'
import { aiHubService, type AIHubStatus } from '../services/aiHub.service'
import { getLocalCommitSha, collectProjectFiles, installRemoteProject } from '../utils/git'

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function readExcelByPath(filePath: string): { name: string; headers: string[]; rows: Record<string, unknown>[] }[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`)
  }
  const workbook = XLSX.readFile(filePath)
  const sheetNames = workbook.SheetNames
  return sheetNames.map((name: string) => {
    const worksheet = workbook.Sheets[name]
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
    const headers = rows.length > 0 ? Object.keys(rows[0]) : []
    return { name, headers, rows }
  })
}

interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileTreeNode[]
}

function isProjectLikeDir(dirPath: string): boolean {
  return ['para.xlsx', 'excel', 'templates', 'output', 'yaml'].some((name) => fs.existsSync(path.join(dirPath, name)))
}

function copyDirRecursive(src: string, dest: string, options?: { skipRuntimeDirs?: boolean }): void {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === '__pycache__') continue
    if (
      options?.skipRuntimeDirs &&
      ['output', 'yaml', 'output-label', 'output-label-md', 'output-label-pdf'].includes(entry.name)
    )
      continue
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath, options)
    else fs.copyFileSync(srcPath, destPath)
  }
}

function listExampleProjects(): string[] {
  const templateDir = getTemplateDir()
  const templateNames = listTemplateInfosFromDir(templateDir).map((item) => item.id)
  if (templateNames.length > 0) return templateNames

  const exampleDir = getExampleDir()
  if (!fs.existsSync(exampleDir)) return []
  return fs
    .readdirSync(exampleDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .filter((name) => isProjectLikeDir(path.join(exampleDir, name)))
    .sort((a, b) => a.localeCompare(b))
}

function ensureTemplateForPython(templateName: string): void {
  const templatePath = path.join(getTemplateDir(), templateName)
  const examplePath = path.join(getExampleDir(), templateName)
  if (!fs.existsSync(templatePath) || fs.existsSync(examplePath)) return
  copyDirRecursive(templatePath, examplePath, { skipRuntimeDirs: true })
}

function refreshWorkspace(): void {
  refreshWorkspaceIndex(getWorkspaceDir())
}

/**
 * 校验 IPC 请求来自可信的渲染进程（本应用窗口）。
 * 防止第三方 iframe / 注入页面调用任意路径读写的 file:* API。
 */
function isTrustedSender(event: Electron.IpcMainInvokeEvent): boolean {
  try {
    const frameUrl = event.senderFrame?.url || ''
    if (app.isPackaged) return frameUrl.startsWith('file://')
    return frameUrl.startsWith('http://localhost:') || frameUrl.startsWith('file://')
  } catch {
    return false
  }
}

/**
 * 安全解析模板 ID 对应的模板目录。
 * 校验模板名合法且解析后的路径严格落在模板根目录内，
 * 防止 `id='..'` 之类的路径穿越删除/读写模板根目录之外的文件。
 */
function resolveTemplateDir(templateId: string): string | null {
  if (!templateId || typeof templateId !== 'string') return null
  const validation = validateProjectName(templateId)
  if (!validation.valid) return null

  const templateRoot = getTemplateDir()
  const fullPath = path.join(templateRoot, templateId)
  if (!isPathSafe(fullPath, templateRoot)) return null
  return fullPath
}

/**
 * 安全解析项目名对应的项目目录。
 * 校验项目名合法且解析后的路径严格落在工作区目录内。
 */
function resolveProjectDir(projectName: string): string | null {
  if (!projectName || typeof projectName !== 'string') return null
  const validation = validateProjectName(projectName)
  if (!validation.valid) return null

  const workspace = getWorkspaceDir()
  const fullPath = path.join(workspace, projectName)
  if (!isPathSafe(fullPath, workspace)) return null
  return fullPath
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function markdownToPrintableHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  const html: string[] = []
  let inTable = false

  for (const line of lines) {
    if (/^\|.+\|$/.test(line.trim())) {
      const cells = line
        .trim()
        .slice(1, -1)
        .split('|')
        .map((cell) => escapeHtml(cell.trim()))
      if (cells.every((cell) => /^-+$/.test(cell))) continue
      if (!inTable) {
        html.push('<table>')
        inTable = true
      }
      const tag = html[html.length - 1] === '<table>' ? 'th' : 'td'
      html.push(`<tr>${cells.map((cell) => `<${tag}>${cell}</${tag}>`).join('')}</tr>`)
      continue
    }

    if (inTable) {
      html.push('</table>')
      inTable = false
    }

    if (line.startsWith('# ')) html.push(`<h1>${escapeHtml(line.slice(2))}</h1>`)
    else if (line.startsWith('## ')) html.push(`<h2>${escapeHtml(line.slice(3))}</h2>`)
    else if (line.startsWith('> ')) html.push(`<blockquote>${escapeHtml(line.slice(2))}</blockquote>`)
    else if (line.trim() === '---') html.push('<hr />')
    else if (line.trim()) html.push(`<p>${escapeHtml(line)}</p>`)
  }

  if (inTable) html.push('</table>')

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: "Microsoft YaHei", "Segoe UI", sans-serif; padding: 24px; color: #111827; }
    h1 { font-size: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0 18px; page-break-inside: avoid; }
    th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; }
    th { background: #f3f4f6; font-weight: 700; }
    blockquote { color: #6b7280; border-left: 4px solid #d1d5db; padding-left: 12px; }
    hr { border: none; border-top: 1px dashed #d1d5db; margin: 20px 0; }
  </style></head><body>${html.join('\n')}</body></html>`
}

async function exportMarkdownFileToPdf(markdownPath: string, pdfPath: string): Promise<void> {
  const markdown = fs.readFileSync(markdownPath, 'utf-8')
  const html = markdownToPrintableHtml(markdown)
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const data = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true })
    fs.writeFileSync(pdfPath, data)
  } finally {
    win.destroy()
  }
}

function findLatestMarkdownLabel(projectDir: string): string | null {
  const labelDir = path.join(projectDir, 'output-label')
  if (!fs.existsSync(labelDir)) return null

  const mdFiles: string[] = []
  const walkDir = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walkDir(fullPath)
      } else if (entry.name.toLowerCase().endsWith('.md')) {
        mdFiles.push(fullPath)
      }
    }
  }
  walkDir(labelDir)

  if (mdFiles.length === 0) return null
  mdFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  return mdFiles[0]
}

export function setupIpcHandlers(window: BrowserWindow): void {
  const renderHandler = new RenderHandler(window)

  const resolveProjectById = async (id: string | number): Promise<{ id: number; name: string; index: number }> => {
    const projects = await renderHandler.listProjects()
    const project = projects.find((p: { id: number; name: string; index: number }) => String(p.id) === String(id))
    if (!project) throw new Error(`未找到项目: ${id}`)
    return project
  }

  const getProjectPathById = async (id: string | number): Promise<string> => {
    const project = await resolveProjectById(id)
    return path.join(getWorkspaceDir(), project.name)
  }

  const getProjectPath = async (id: string | number, projectName?: string): Promise<string> => {
    if (projectName) {
      const projects = await renderHandler.listProjects()
      const project = projects.find((p: { id: number; name: string; index: number }) => p.name === projectName)
      if (project) return path.join(getWorkspaceDir(), project.name)
    }
    return getProjectPathById(id)
  }

  // 项目管理 API — 统一走 Python 后端，保证目录、MC_Para.xlsx、para.xlsx 同步
  ipcMain.handle('project:list', async (): Promise<{ id: number; name: string; index: number }[]> => {
    return await renderHandler.listProjects()
  })

  ipcMain.handle('project:listExamples', async (): Promise<string[]> => {
    const examples = listExampleProjects()
    logger.info('[project:listExamples]', { dir: getTemplateDir(), examples })
    return examples
  })

  ipcMain.handle('project:listTemplates', async () => listTemplateInfosFromDir(getTemplateDir()))

  // 项目依赖分析：模板 ↔ Excel 列 反向索引（P1 智能分析底座）
  ipcMain.handle('project:analyze', async (_e, id: string): Promise<unknown> => {
    return await renderHandler.runPythonCommand(['analyze', 'project', String(id)], true)
  })

  // 智能校对：模板语法 / 缺失列 / 数据空值（P1 渲染后自动验证）
  ipcMain.handle('project:proofread', async (_e, id: string): Promise<unknown> => {
    return await renderHandler.runPythonCommand(['proofread', 'project', String(id)], true)
  })

  ipcMain.handle('template:analyze', async (_e, templateId: string): Promise<unknown> => {
    const templateDir = resolveTemplateDir(templateId)
    if (!templateDir || !fs.existsSync(templateDir)) throw new Error(`模板不存在: ${templateId}`)
    // 调用 Python analyzer 分析模板目录，返回质量报告
    return await new Promise((resolve) => {
      const pythonCmd = getPythonPath()
      const backendDir = getBackendDir()
      const script = `import sys, json; sys.path.insert(0, ${JSON.stringify(backendDir)}); from analyzer import analyze_project; print(json.dumps(analyze_project(${JSON.stringify(templateDir)}), ensure_ascii=False))`
      const proc = spawn(pythonCmd, ['-c', script], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let out = ''
      let err = ''
      proc.stdout.on('data', (d: Buffer) => {
        out += d.toString()
      })
      proc.stderr.on('data', (d: Buffer) => {
        err += d.toString()
      })
      proc.on('close', () => {
        try {
          const lastLine = out.trim().split('\n').filter(Boolean).pop() || ''
          resolve(JSON.parse(lastLine))
        } catch {
          resolve({ status: 'error', message: err.trim() || '分析失败' })
        }
      })
      proc.on('error', (e: Error) => resolve({ status: 'error', message: e.message }))
    })
  })

  ipcMain.handle('project:getTemplate', async (_e, id: string) => {
    const template = listTemplateInfosFromDir(getTemplateDir()).find((item) => item.id === id)
    if (!template) throw new Error(`模板不存在: ${id}`)
    return template
  })

  ipcMain.handle('project:readTemplateFile', async (_e, templateId: string, filePath: string): Promise<string> => {
    const templateDir = resolveTemplateDir(templateId)
    if (!templateDir) throw new Error('模板不存在或名称无效')
    const pathValidation = validateFilePath(filePath)
    if (!pathValidation.valid) throw new Error(pathValidation.error || '文件路径无效')
    if (!isFileTypeAllowed(filePath)) throw new Error('不支持该文件类型')

    const fullPath = buildSafePath(templateDir, filePath)
    if (!fullPath) throw new Error('文件路径不安全')
    if (!isFileAccessible(fullPath)) throw new Error(`文件不存在: ${filePath}`)

    return fs.readFileSync(fullPath, 'utf-8')
  })

  ipcMain.handle(
    'project:readTemplateExcel',
    async (
      _e,
      templateId: string,
      filePath: string,
    ): Promise<{ name: string; headers: string[]; rows: Record<string, unknown>[] }[]> => {
      const templateDir = resolveTemplateDir(templateId)
      if (!templateDir) throw new Error('模板不存在或名称无效')
      const pathValidation = validateFilePath(filePath)
      if (!pathValidation.valid) throw new Error(pathValidation.error || '文件路径无效')

      const ext = path.extname(filePath).toLowerCase()
      if (!['.xlsx', '.xls'].includes(ext)) throw new Error('仅支持 Excel 文件')

      const fullPath = buildSafePath(templateDir, filePath)
      if (!fullPath) throw new Error('文件路径不安全')
      if (!isFileAccessible(fullPath)) throw new Error(`文件不存在: ${filePath}`)

      return readExcelByPath(fullPath)
    },
  )

  ipcMain.handle('project:getWorkspaceIndex', async () => readWorkspaceIndex(getWorkspaceDir()))

  ipcMain.handle(
    'project:create',
    async (_e, name: string, options?: { template?: string; empty?: boolean }): Promise<void> => {
      const validation = validateProjectName(name)
      if (!validation.valid) {
        throw new Error(validation.error || '项目名无效')
      }
      const workspaceDir = getWorkspaceDir()
      const targetPath = path.join(workspaceDir, name)
      if (fs.existsSync(targetPath)) throw new Error(`项目已存在: ${name}`)

      if (options?.empty) {
        await renderHandler.runPythonCommand(['project', 'create', name, '--empty'])
      } else {
        const examples = listExampleProjects()
        const template = options?.template ?? examples[0] ?? null
        if (!template) {
          throw new Error('没有可用的示例模板，请使用空白项目模式创建')
        }
        if (!examples.includes(template)) {
          throw new Error(`示例模板 "${template}" 不存在，可用模板: ${examples.join(', ') || '无'}`)
        }
        ensureTemplateForPython(template)
        await renderHandler.runPythonCommand(['project', 'create', name, '--template', template])
      }
      refreshWorkspace()
    },
  )

  ipcMain.handle(
    'project:saveAsTemplate',
    async (_e, projectName: string, templateName: string, meta: Partial<TemplateMeta>): Promise<void> => {
      const projectPath = path.join(getWorkspaceDir(), projectName)
      if (!fs.existsSync(projectPath) || !isProjectLikeDir(projectPath)) {
        throw new Error(`项目不存在或结构无效: ${projectName}`)
      }
      const nameValidation = validateFilePath(templateName)
      if (!nameValidation.valid || templateName.includes('/') || templateName.includes('\\')) {
        throw new Error('模板名称无效')
      }
      const templateDir = getTemplateDir()
      const targetPath = path.join(templateDir, templateName)
      if (fs.existsSync(targetPath)) throw new Error(`模板已存在: ${templateName}`)
      copyDirRecursive(projectPath, targetPath, { skipRuntimeDirs: true })
      writeTemplateMeta(targetPath, { ...meta, name: meta.name || templateName, sourceProject: projectName })
      refreshWorkspace()
    },
  )

  ipcMain.handle('project:updateTemplateMeta', async (_e, id: string, meta: Partial<TemplateMeta>): Promise<void> => {
    const targetPath = resolveTemplateDir(id)
    if (!targetPath || !fs.existsSync(targetPath)) throw new Error(`模板不存在: ${id}`)
    const current = readTemplateMeta(targetPath, id)
    writeTemplateMeta(targetPath, { ...current, ...meta })
    refreshWorkspace()
  })

  ipcMain.handle('project:deleteTemplate', async (_e, id: string): Promise<void> => {
    const targetPath = resolveTemplateDir(id)
    if (!targetPath || !fs.existsSync(targetPath)) throw new Error(`模板不存在: ${id}`)
    fs.rmSync(targetPath, { recursive: true, force: true })
    refreshWorkspace()
  })

  ipcMain.handle(
    'project:installRemoteTemplate',
    async (_e, data: { name: string; zipData: string; owner: string }): Promise<void> => {
      const AdmZip = (await import('adm-zip')).default
      const templateDir = resolveTemplateDir(data.name)
      if (!templateDir) throw new Error('模板名称无效')

      // Decode base64 zip data
      const buffer = Buffer.from(data.zipData, 'base64')
      const zip = new AdmZip(buffer)

      const targetPath = templateDir

      // Check if template already exists
      if (fs.existsSync(targetPath)) {
        throw new Error(`模板已存在: ${data.name}`)
      }

      // 逐条目安全解压：拒绝绝对路径与 ../ 穿越，防止 zip-slip
      const entries = zip.getEntries()
      for (const entry of entries) {
        const entryName = entry.entryName.replace(/\\/g, '/')
        const segments = entryName.split('/').filter((seg) => seg.length > 0)
        if (segments.includes('..') || path.isAbsolute(entryName)) {
          fs.rmSync(targetPath, { recursive: true, force: true })
          throw new Error('压缩包包含不安全的文件路径，已取消安装')
        }
        const destPath = path.join(targetPath, entryName)
        if (!isPathSafe(destPath, targetPath)) {
          fs.rmSync(targetPath, { recursive: true, force: true })
          throw new Error('压缩包包含不安全的文件路径，已取消安装')
        }
        if (entry.isDirectory) {
          fs.mkdirSync(destPath, { recursive: true })
        } else {
          fs.mkdirSync(path.dirname(destPath), { recursive: true })
          fs.writeFileSync(destPath, entry.getData())
        }
      }

      // Save metadata
      const metaFile = path.join(targetPath, '.mc-template-meta.json')
      fs.writeFileSync(
        metaFile,
        JSON.stringify(
          {
            name: data.name,
            source: 'remote',
            owner: data.owner,
            installedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        'utf-8',
      )

      refreshWorkspace()
      logger.info(`模板安装成功: ${data.owner}/${data.name}`)
    },
  )

  ipcMain.handle('project:saveAsExample', async (_e, projectName: string, exampleName: string): Promise<void> => {
    const projectPath = path.join(getWorkspaceDir(), projectName)
    if (!fs.existsSync(projectPath) || !isProjectLikeDir(projectPath)) {
      throw new Error(`项目不存在或结构无效: ${projectName}`)
    }
    const nameValidation = validateFilePath(exampleName)
    if (!nameValidation.valid || exampleName.includes('/') || exampleName.includes('\\')) {
      throw new Error('示例名称无效')
    }
    const templateDir = getTemplateDir()
    const targetPath = path.join(templateDir, exampleName)
    if (fs.existsSync(targetPath)) throw new Error(`示例已存在: ${exampleName}`)
    copyDirRecursive(projectPath, targetPath, { skipRuntimeDirs: true })
    writeTemplateMeta(targetPath, { name: exampleName, sourceProject: projectName })
    refreshWorkspace()
  })

  ipcMain.handle('project:delete', async (_e, ids: string[]): Promise<void> => {
    await renderHandler.deleteProject(ids)
    refreshWorkspace()
  })

  ipcMain.handle('project:structure', async (_e, name: string): Promise<FileTreeNode[]> => {
    const projectPath = resolveProjectDir(String(name))
    if (!projectPath || !fs.existsSync(projectPath)) {
      return []
    }

    async function buildFileTree(dirPath: string, basePath: string): Promise<FileTreeNode[]> {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
      const result: FileTreeNode[] = []
      for (const entry of entries) {
        const entryName = entry.name.toLowerCase()
        if (entryName === '__pycache__' || entryName.startsWith('.')) continue
        const fullPath = path.join(dirPath, entry.name)
        const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/')
        if (entry.isDirectory()) {
          result.push({
            name: entry.name,
            path: relativePath,
            isDirectory: true,
            children: await buildFileTree(fullPath, basePath),
          })
        } else {
          result.push({
            name: entry.name,
            path: relativePath,
            isDirectory: false,
          })
        }
      }
      return result
    }

    const tree = await buildFileTree(projectPath, projectPath)
    return tree
  })

  // 项目信息查询 API — 返回项目路径与目录结构（excel/templates/para/output/yaml 是否存在）
  ipcMain.handle(
    'project:info',
    async (
      _e,
      id: string,
    ): Promise<{
      id: number
      name: string
      path: string
      exists: boolean
      structure: { excel: boolean; templates: boolean; para: boolean; output: boolean; yaml: boolean }
    }> => {
      return await renderHandler.runPythonCommand(['project', 'info', String(id), '--format', 'json'], true)
    },
  )

  // 项目参数查询 API — 按 Python 项目列表解析 ID，避免与界面列表不一致
  ipcMain.handle('project:parameters', async (_e, id: string): Promise<Array<{ file: string; path: string }>> => {
    const projectDir = await getProjectPathById(id)
    const excelDir = path.join(projectDir, 'excel')
    if (!fs.existsSync(excelDir)) return []
    const files = fs.readdirSync(excelDir).filter((f) => f.endsWith('.xlsx') || f.endsWith('.xls'))
    return files.map((f) => ({ file: f, path: `excel/${f}` }))
  })

  // 项目文件读写 API（走文件系统，替代 Python 回退）
  ipcMain.handle(
    'project:readFile',
    async (_e, id: number, filePath: string, projectName?: string): Promise<string> => {
      // 安全校验：文件路径
      const pathValidation = validateFilePath(filePath)
      if (!pathValidation.valid) {
        throw new Error(pathValidation.error || '文件路径无效')
      }

      // 安全校验：文件类型
      if (!isFileTypeAllowed(filePath)) {
        throw new Error('不支持该文件类型')
      }

      const projectDir = await getProjectPath(id, projectName)

      // 构建安全路径
      const fullPath = buildSafePath(projectDir, filePath)
      if (!fullPath) {
        throw new Error('文件路径不安全')
      }

      if (!isFileAccessible(fullPath)) {
        throw new Error(`文件不存在或无法访问`)
      }

      return fs.readFileSync(fullPath, 'utf-8')
    },
  )

  ipcMain.handle(
    'project:writeFile',
    async (_e, id: number, filePath: string, content: string, projectName?: string): Promise<void> => {
      // 安全校验：文件路径
      const pathValidation = validateFilePath(filePath)
      if (!pathValidation.valid) {
        throw new Error(pathValidation.error || '文件路径无效')
      }

      // 安全校验：文件类型
      if (!isFileTypeAllowed(filePath)) {
        throw new Error('不支持该文件类型')
      }

      // 安全校验：文件内容长度
      const contentValidation = validateFileContent(content)
      if (!contentValidation.valid) {
        throw new Error(contentValidation.error || '文件内容过大')
      }

      const projectDir = await getProjectPath(id, projectName)

      // 构建安全路径
      const fullPath = buildSafePath(projectDir, filePath)
      if (!fullPath) {
        throw new Error('文件路径不安全')
      }

      const dir = path.dirname(fullPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(fullPath, content, 'utf-8')
    },
  )

  ipcMain.handle(
    'project:listFiles',
    async (_e, id: string, fileType?: string): Promise<Array<{ name: string; path: string; isDirectory: boolean }>> => {
      const projectDir = await getProjectPathById(id)
      if (!fs.existsSync(projectDir)) return []
      const files: string[] = []
      function walk(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) walk(fullPath)
          else {
            const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
            if (!fileType) {
              files.push(path.relative(projectDir, fullPath).replace(/\\/g, '/'))
            } else if (
              fileType === 'text' &&
              ['.txt', '.yml', '.yaml', '.j2', '.jinja', '.jinja2', '.html', '.json', '.md'].includes(ext)
            ) {
              files.push(path.relative(projectDir, fullPath).replace(/\\/g, '/'))
            } else if (fileType === 'excel' && ['.xlsx', '.xls'].includes(ext)) {
              files.push(path.relative(projectDir, fullPath).replace(/\\/g, '/'))
            }
          }
        }
      }
      walk(projectDir)
      return files.map((f) => ({ name: f, path: f, isDirectory: false }))
    },
  )

  // 项目 Excel 读写（已使用文件系统直接读写）
  ipcMain.handle(
    'project:readExcel',
    async (
      _e,
      projectId: number,
      filePath: string,
      projectName?: string,
    ): Promise<{ name: string; headers: string[]; rows: Record<string, unknown>[] }[]> => {
      // 安全校验：文件路径
      const pathValidation = validateFilePath(filePath)
      if (!pathValidation.valid) {
        throw new Error(pathValidation.error || '文件路径无效')
      }

      // 安全校验：文件类型（仅允许 Excel）
      const ext = path.extname(filePath).toLowerCase()
      if (!['.xlsx', '.xls'].includes(ext)) {
        throw new Error('仅支持 Excel 文件 (.xlsx, .xls)')
      }

      const projectDir = await getProjectPath(projectId, projectName)

      // 构建安全路径
      const fullPath = buildSafePath(projectDir, filePath)
      if (!fullPath) {
        throw new Error('文件路径不安全')
      }

      if (!isFileAccessible(fullPath)) {
        throw new Error(`文件不存在或无法访问`)
      }

      return readExcelByPath(fullPath)
    },
  )

  ipcMain.handle(
    'project:writeExcel',
    async (
      _e,
      projectId: number,
      filePath: string,
      sheets: { name: string; headers: string[]; rows: Record<string, unknown>[] }[],
      projectName?: string,
    ): Promise<void> => {
      // 安全校验：文件路径
      const pathValidation = validateFilePath(filePath)
      if (!pathValidation.valid) {
        throw new Error(pathValidation.error || '文件路径无效')
      }

      // 安全校验：文件类型（仅允许 Excel）
      const ext = path.extname(filePath).toLowerCase()
      if (!['.xlsx', '.xls'].includes(ext)) {
        throw new Error('仅支持 Excel 文件 (.xlsx, .xls)')
      }

      const projectDir = await getProjectPath(projectId, projectName)

      // 构建安全路径
      const fullPath = buildSafePath(projectDir, filePath)
      if (!fullPath) {
        throw new Error('文件路径不安全')
      }

      const dir = path.dirname(fullPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const wb = XLSX.utils.book_new()
      for (const sheet of sheets) {
        const ws = XLSX.utils.json_to_sheet(sheet.rows, { header: sheet.headers })
        XLSX.utils.book_append_sheet(wb, ws, sheet.name)
      }
      XLSX.writeFile(wb, fullPath)
      logger.info('[project:writeExcel] 保存成功')
    },
  )

  // ===== 模板片段库（workspace/snippets）=====
  const snippetsDir = path.join(getWorkspaceDir(), 'snippets')
  const snippetsIndexPath = path.join(snippetsDir, 'snippets.json')

  const readSnippetsIndex = (): Array<Record<string, unknown>> => {
    try {
      if (fs.existsSync(snippetsIndexPath)) {
        const data = JSON.parse(fs.readFileSync(snippetsIndexPath, 'utf-8'))
        return Array.isArray(data) ? data : []
      }
    } catch {
      /* 忽略损坏的索引 */
    }
    return []
  }

  ipcMain.handle(
    'snippet:list',
    async (): Promise<Array<{ name: string; file: string; description: string; category: string }>> => {
      const items = readSnippetsIndex()
      const files = fs.existsSync(snippetsDir) ? fs.readdirSync(snippetsDir).filter((f) => f.endsWith('.j2')) : []
      const indexed = new Set(items.map((i) => String(i.file)))
      for (const f of files) {
        if (!indexed.has(f)) {
          items.push({ name: f.replace(/\.j2$/, ''), file: f, description: '', category: '通用' })
        }
      }
      return items as Array<{ name: string; file: string; description: string; category: string }>
    },
  )

  ipcMain.handle('snippet:get', async (_e, file: string): Promise<string> => {
    const full = buildSafePath(snippetsDir, String(file))
    if (!full || !fs.existsSync(full)) throw new Error('片段不存在')
    return fs.readFileSync(full, 'utf-8')
  })

  ipcMain.handle(
    'snippet:save',
    async (
      _e,
      data: { name: string; content: string; description?: string; category?: string },
    ): Promise<{ file: string }> => {
      const fileName =
        String(data.name)
          .replace(/\.j2$/i, '')
          .replace(/[\\/:*?"<>|]/g, '_') + '.j2'
      const full = buildSafePath(snippetsDir, fileName)
      if (!full) throw new Error('片段名称无效')
      fs.mkdirSync(snippetsDir, { recursive: true })
      fs.writeFileSync(full, String(data.content ?? ''), 'utf-8')
      const items = readSnippetsIndex()
      const existing = items.find((i) => i.file === fileName)
      if (existing) {
        Object.assign(existing, {
          description: data.description ?? '',
          category: data.category ?? '通用',
          updatedAt: Date.now(),
        })
      } else {
        items.push({
          name: String(data.name).replace(/\.j2$/i, ''),
          file: fileName,
          description: data.description ?? '',
          category: data.category ?? '通用',
          createdAt: Date.now(),
        })
      }
      fs.mkdirSync(snippetsDir, { recursive: true })
      fs.writeFileSync(snippetsIndexPath, JSON.stringify(items, null, 2), 'utf-8')
      return { file: fileName }
    },
  )

  ipcMain.handle('snippet:delete', async (_e, file: string): Promise<void> => {
    const full = buildSafePath(snippetsDir, String(file))
    if (!full) throw new Error('片段名称无效')
    if (fs.existsSync(full)) fs.unlinkSync(full)
    const items = readSnippetsIndex().filter((i) => i.file !== String(file))
    fs.mkdirSync(snippetsDir, { recursive: true })
    fs.writeFileSync(snippetsIndexPath, JSON.stringify(items, null, 2), 'utf-8')
  })

  // 渲染 API（通过 Python 后端执行）
  ipcMain.handle('plan:import', async (_e, planJson: string, projectDir: string): Promise<void> => {
    return await renderHandler.planImport(planJson, projectDir)
  })
  ipcMain.handle('plan:analyze', async (_e, projectDir: string): Promise<unknown> => {
    return await renderHandler.planAnalyze(projectDir)
  })

  ipcMain.handle('render:project', async (_e, ids: string[]): Promise<void> => {
    return await renderHandler.renderProject(ids)
  })

  ipcMain.handle('render:yaml', async (_e, ids: string[]): Promise<void> => {
    return await renderHandler.renderYaml(ids)
  })

  ipcMain.handle('render:project-sn', async (_e, ids: string[]): Promise<void> => {
    return await renderHandler.renderProjectSn(ids)
  })

  ipcMain.handle('render:yaml-sn', async (_e, ids: string[]): Promise<void> => {
    return await renderHandler.renderYamlSn(ids)
  })

  // 渲染撤销
  ipcMain.handle('render:undo', async (_e, ids: string[]): Promise<void> => {
    return await renderHandler.runPythonCommand(['render', 'undo', ids.join(',')])
  })

  // 渲染预览
  ipcMain.handle(
    'render:dry-run',
    async (_e, ids: string[], format?: 'device_name' | 'device_sn'): Promise<unknown> => {
      const args = ['render', 'dry-run', ids.join(',')]
      if (format === 'device_sn') args.push('--format', 'device_sn')
      return await renderHandler.runPythonCommand(args, true)
    },
  )

  // 模板调试沙盒：仅渲染指定模板文件，输出预览（不写文件）
  ipcMain.handle('template:preview', async (_e, projectId: string, templatePath: string): Promise<unknown> => {
    const pathValidation = validateFilePath(String(templatePath))
    if (!pathValidation.valid) throw new Error(pathValidation.error || '模板路径无效')
    return await renderHandler.runPythonCommand(['template', 'preview', String(projectId), String(templatePath)], true)
  })

  // 模板版本历史（.template_history/<key>/）：快照 / 列表 / 恢复
  const templateHistoryDir = async (projectId: string | number, templatePath: string): Promise<string> => {
    const projectDir = await getProjectPath(projectId)
    const safeKey = String(templatePath).replace(/[^a-zA-Z0-9_一-鿿.-]/g, '_')
    return path.join(projectDir, '.template_history', safeKey)
  }

  ipcMain.handle('template:history', async (_e, projectId, templatePath): Promise<unknown[]> => {
    const histDir = await templateHistoryDir(projectId, templatePath)
    const manifestPath = path.join(histDir, 'manifest.json')
    try {
      if (fs.existsSync(manifestPath)) {
        const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        return Array.isArray(data) ? data : []
      }
    } catch {
      /* 忽略损坏清单 */
    }
    return []
  })

  ipcMain.handle('template:snapshot', async (_e, projectId, templatePath, note): Promise<unknown[]> => {
    const projectDir = await getProjectPath(projectId)
    const full = buildSafePath(projectDir, String(templatePath))
    if (!full || !fs.existsSync(full)) throw new Error('模板文件不存在')
    const content = fs.readFileSync(full, 'utf-8')
    const histDir = await templateHistoryDir(projectId, templatePath)
    fs.mkdirSync(histDir, { recursive: true })
    const version = String(Date.now())
    fs.writeFileSync(path.join(histDir, `${version}.j2`), content, 'utf-8')
    const manifestPath = path.join(histDir, 'manifest.json')
    const items = (() => {
      try {
        if (fs.existsSync(manifestPath)) {
          const d = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
          return Array.isArray(d) ? d : []
        }
      } catch {
        /* ignore */
      }
      return []
    })()
    items.push({
      version,
      timestamp: new Date().toISOString(),
      note: note || '',
      file: `${version}.j2`,
      templatePath: String(templatePath),
    })
    fs.writeFileSync(manifestPath, JSON.stringify(items, null, 2), 'utf-8')
    return items
  })

  ipcMain.handle('template:restore', async (_e, projectId, templatePath, version): Promise<void> => {
    const projectDir = await getProjectPath(projectId)
    const histDir = await templateHistoryDir(projectId, templatePath)
    const snapshotFile = path.join(histDir, `${String(version)}.j2`)
    if (!fs.existsSync(snapshotFile)) throw new Error('版本不存在')
    const content = fs.readFileSync(snapshotFile, 'utf-8')
    const full = buildSafePath(projectDir, String(templatePath))
    if (!full) throw new Error('模板路径不安全')
    fs.writeFileSync(full, content, 'utf-8')
  })

  // 校验
  ipcMain.handle('validate:template', async (_e, ids: string[]): Promise<unknown> => {
    return await renderHandler.runPythonCommand(['validate', 'template', ids.join(',')], true)
  })

  ipcMain.handle('validate:excel', async (_e, ids: string[]): Promise<unknown> => {
    return await renderHandler.runPythonCommand(['validate', 'excel', ids.join(',')], true)
  })

  // Diff 对比
  ipcMain.handle(
    'diff:compare',
    async (_e, project: string, device: string, content: string, format: string): Promise<unknown> => {
      return await renderHandler.runPythonCommand(['diff', project, device, content, '--format', format], true)
    },
  )

  // 删除操作 API（通过 Python 后端执行）
  ipcMain.handle('delete:output', async (_e, ids: string[]): Promise<void> => {
    return await renderHandler.deleteOutput(ids)
  })

  ipcMain.handle('delete:output-sn', async (_e, ids: string[]): Promise<void> => {
    return await renderHandler.deleteOutputSn(ids)
  })

  ipcMain.handle('delete:yaml', async (_e, ids: string[]): Promise<void> => {
    return await renderHandler.deleteYaml(ids)
  })

  ipcMain.handle('delete:yaml-sn', async (_e, ids: string[]): Promise<void> => {
    return await renderHandler.deleteYamlSn(ids)
  })

  // 功能 API（标签打印/删除，通过 Python 后端执行）
  ipcMain.handle('feature:label-print', async (_e, ids: string[], config?: unknown): Promise<void> => {
    return await renderHandler.labelPrint(ids, config)
  })

  ipcMain.handle('feature:label-markdown', async (_e, ids: string[], config?: unknown): Promise<void> => {
    return await renderHandler.labelMarkdown(ids, config)
  })

  ipcMain.handle('feature:label-pdf', async (_e, ids: string[], config?: unknown): Promise<string[]> => {
    await renderHandler.labelMarkdown(ids, config)

    const pdfPaths: string[] = []
    for (const id of ids) {
      const project = await resolveProjectById(id)
      const projectDir = path.join(getWorkspaceDir(), project.name)
      const markdownPath = findLatestMarkdownLabel(projectDir)
      if (!markdownPath) throw new Error(`未找到 ${project.name} 的 Markdown 标签文件`)

      const timestampDir = path.dirname(markdownPath)
      const pdfPath = path.join(timestampDir, path.basename(markdownPath).replace(/_label\.md$/i, '_label.pdf'))
      await exportMarkdownFileToPdf(markdownPath, pdfPath)
      pdfPaths.push(pdfPath)
    }

    return pdfPaths
  })

  ipcMain.handle('feature:label-delete', async (_e, ids: string[]): Promise<void> => {
    return await renderHandler.labelDelete(ids)
  })

  // 文件操作API
  ipcMain.handle('file:read', async (e, filePath: string): Promise<string> => {
    if (!isTrustedSender(e)) throw new Error('无权执行该操作')
    logger.info('[file:read] 请求路径:', filePath)
    if (!fs.existsSync(filePath)) {
      logger.error('[file:read] 文件不存在:', filePath)
      throw new Error('文件不存在')
    }
    const buffer = fs.readFileSync(filePath)
    let text = buffer.toString('utf-8')
    if (text.includes('\uFFFD')) {
      try {
        text = iconv.decode(buffer, 'gbk')
      } catch {
        logger.warn('[file:read] iconv-lite 加载失败，使用 UTF-8 结果')
      }
    }
    logger.info('[file:read] 读取成功，长度:', text.length)
    return text
  })

  ipcMain.handle('file:write', async (e, filePath: string, content: string): Promise<void> => {
    if (!isTrustedSender(e)) throw new Error('无权执行该操作')
    const contentValidation = validateFileContent(content)
    if (!contentValidation.valid) throw new Error(contentValidation.error || '文件内容无效')
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, content, 'utf-8')
  })

  ipcMain.handle('file:exists', async (e, filePath: string): Promise<boolean> => {
    if (!isTrustedSender(e)) throw new Error('无权执行该操作')
    const exists = fs.existsSync(filePath)
    return exists
  })

  ipcMain.handle(
    'file:readExcel',
    async (e, filePath: string): Promise<{ name: string; headers: string[]; rows: Record<string, unknown>[] }[]> => {
      if (!isTrustedSender(e)) throw new Error('无权执行该操作')
      try {
        return readExcelByPath(filePath)
      } catch (err) {
        logger.error('[file:readExcel] 错误:', errorMessage(err))
        throw err
      }
    },
  )

  // 文件读取 API —— Word 文档
  ipcMain.handle('file:readDocx', async (e, filePath: string): Promise<string> => {
    if (!isTrustedSender(e)) throw new Error('无权执行该操作')
    logger.info('[file:readDocx] 请求:', filePath)
    if (!fs.existsSync(filePath)) {
      logger.error('[file:readDocx] 文件不存在:', filePath)
      throw new Error('文件不存在: ' + filePath)
    }
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    if (ext === '.doc') {
      throw new Error('请将 .doc 文件在 Word 中另存为 .docx 格式后再打开')
    }
    try {
      const result = await mammoth.extractRawText({ path: filePath })
      logger.info('[file:readDocx] 读取成功，文本长度:', String(result.value).length)
      return result.value
    } catch (err) {
      logger.error('[file:readDocx] 解析失败:', errorMessage(err))
      throw new Error('解析 Word 文档失败: ' + errorMessage(err))
    }
  })

  // 项目文件读取 API —— Word 文档（通过 projectId + 相对路径）
  ipcMain.handle(
    'project:readDocx',
    async (_e, projectId: number, filePath: string, projectName?: string): Promise<string> => {
      logger.info('[project:readDocx] 请求', { projectId, projectName, filePath })
      const projectDir = await getProjectPath(projectId, projectName)
      const fullPath = buildSafePath(projectDir, String(filePath))
      if (!fullPath) throw new Error('文件路径不安全')
      if (!fs.existsSync(fullPath)) throw new Error(`文件不存在: ${fullPath}`)

      const ext = fullPath.slice(fullPath.lastIndexOf('.')).toLowerCase()
      if (ext === '.doc') {
        throw new Error('请将 .doc 文件在 Word 中另存为 .docx 格式后再打开')
      }
      try {
        const result = await mammoth.extractRawText({ path: fullPath })
        logger.info('[project:readDocx] 读取成功，文本长度:', String(result.value).length)
        return result.value
      } catch (err) {
        logger.error('[project:readDocx] 解析失败:', errorMessage(err))
        throw new Error('解析 Word 文档失败: ' + errorMessage(err))
      }
    },
  )

  // 项目文件读取 API —— Word 文档（返回 ArrayBuffer 用于 docx-preview）
  ipcMain.handle(
    'project:readDocxBuffer',
    async (_e, projectId: number, filePath: string, projectName?: string): Promise<ArrayBuffer> => {
      logger.info('[project:readDocxBuffer] 请求', { projectId, projectName, filePath })
      const projectDir = await getProjectPath(projectId, projectName)
      const fullPath = buildSafePath(projectDir, String(filePath))
      if (!fullPath) throw new Error('文件路径不安全')
      if (!fs.existsSync(fullPath)) throw new Error(`文件不存在: ${fullPath}`)

      const ext = fullPath.slice(fullPath.lastIndexOf('.')).toLowerCase()
      if (ext === '.doc') {
        throw new Error('请将 .doc 文件在 Word 中另存为 .docx 格式后再打开')
      }

      try {
        const buffer = fs.readFileSync(fullPath)
        logger.info('[project:readDocxBuffer] 读取成功，文件大小:', buffer.length)
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      } catch (err) {
        logger.error('[project:readDocxBuffer] 读取失败:', errorMessage(err))
        throw new Error('读取 Word 文档失败: ' + errorMessage(err))
      }
    },
  )

  // 应用API
  ipcMain.handle('guide:getContent', async (_e, lang: string): Promise<string> => {
    // 同时尝试 public/docs（开发环境，Vite 直接服务）和 dist/docs（生产环境，构建产物）
    const possibleDirs = [path.join(process.cwd(), 'public', 'docs'), path.join(__dirname, '..', '..', 'dist', 'docs')]
    const supportedLangs = ['zh-CN', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'ar', 'vi', 'th']
    const targetLang = supportedLangs.includes(lang) ? lang : 'zh-CN'
    for (const guideDir of possibleDirs) {
      const filePath = path.join(guideDir, `user-guide.${targetLang}.md`)
      const fallbackPath = path.join(guideDir, 'user-guide.zh-CN.md')
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8')
      }
      if (fs.existsSync(fallbackPath)) {
        return fs.readFileSync(fallbackPath, 'utf-8')
      }
    }
    throw new Error('Guide file not found')
  })

  ipcMain.handle('app:getVersion', async (): Promise<string> => {
    return packageJson.version
  })

  ipcMain.handle('app:getBuildInfo', async (): Promise<{ version: string; build: string; displayVersion: string }> => {
    return {
      version: APP_CONFIG.VERSION.CURRENT,
      build: APP_CONFIG.VERSION.BUILD,
      displayVersion: APP_CONFIG.VERSION.DISPLAY,
    }
  })

  ipcMain.handle('app:getPath', async (_e, name: string): Promise<string> => {
    if (name === 'backend') {
      return getBackendDir()
    }
    if (name === 'workspace') {
      return getWorkspaceDir()
    }
    return ''
  })

  // 对话框API
  ipcMain.handle(
    'dialog:showMessage',
    async (_e, options: { type: 'info' | 'warning' | 'error'; title: string; message: string }): Promise<void> => {
      const type = options.type === 'error' ? 'error' : options.type === 'warning' ? 'warning' : 'info'
      await dialog.showMessageBox(window, {
        type,
        title: options.title,
        message: options.message,
      })
    },
  )

  ipcMain.handle('dialog:showConfirm', async (_e, options: { title: string; message: string }): Promise<boolean> => {
    const result = await dialog.showMessageBox(window, {
      type: 'question',
      title: options.title,
      message: options.message,
      buttons: [electronI18n.t('common:app.yes', '确定'), electronI18n.t('common:app.no', '取消')],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    return result.response === 0
  })

  ipcMain.handle(
    'dialog:openFile',
    async (
      _e,
      options: { title?: string; filters?: { name: string; extensions: string[] }[] },
    ): Promise<string | null> => {
      if (!isTrustedSender(_e)) throw new Error('无权执行该操作')
      const result = await dialog.showOpenDialog(window, {
        title: options?.title,
        filters: options?.filters,
        properties: ['openFile'],
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    },
  )

  ipcMain.handle(
    'dialog:saveFile',
    async (
      _e,
      options: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] },
    ): Promise<string | null> => {
      if (!isTrustedSender(_e)) throw new Error('无权执行该操作')
      const result = await dialog.showSaveDialog(window, {
        title: options?.title,
        defaultPath: options?.defaultPath,
        filters: options?.filters,
      })
      if (result.canceled || !result.filePath) return null
      return result.filePath
    },
  )

  // 日志API
  ipcMain.handle('log:write', async (_e, level: string, message: string): Promise<void> => {
    logger.info(`[${level}] ${message}`)
    if (!window.isDestroyed()) {
      window.webContents.send('log:output', { level, message })
    }
  })

  // Shell API
  ipcMain.handle('shell:showItemInFolder', async (e, filePath: string): Promise<void> => {
    if (!isTrustedSender(e)) throw new Error('无权执行该操作')
    if (!fs.existsSync(filePath)) return
    shell.showItemInFolder(filePath)
  })

  // ====== AI Hub IPC ======

  // AI Hub 生命周期
  ipcMain.handle('aihub:start', async (): Promise<void> => {
    await aiHubService.start()
  })

  ipcMain.handle('aihub:stop', async (): Promise<void> => {
    await aiHubService.stop()
  })

  ipcMain.handle('aihub:status', async (): Promise<AIHubStatus> => {
    return aiHubService.getStatus()
  })

  ipcMain.handle('aihub:health', async (): Promise<boolean> => {
    return await aiHubService.healthCheck()
  })

  // AI Hub 聊天
  ipcMain.handle(
    'aihub:chat',
    async (
      _e,
      sessionId: string,
      message: string,
      mode?: string,
      provider?: string,
      attachments?: Array<{ id: string; name: string; type: string; path: string; size: number }>,
      autonomyMode?: string,
      projectName?: string,
    ): Promise<string> => {
      let fullContent = ''
      await aiHubService.sendChatMessage(
        sessionId,
        message,
        mode,
        provider,
        attachments,
        autonomyMode,
        projectName,
        (chunk: string) => {
          fullContent += chunk
          if (!window.isDestroyed()) {
            window.webContents.send('aihub:stream', { sessionId, chunk })
          }
        },
      )
      return fullContent
    },
  )

  ipcMain.handle('aihub:clearSession', async (_e, sessionId: string): Promise<void> => {
    await aiHubService.clearSession(sessionId)
  })

  // AI Hub Provider 管理
  ipcMain.handle(
    'aihub:getProviders',
    async (): Promise<Array<{ name: string; model: string; enabled: boolean; is_default: boolean }>> => {
      return await aiHubService.getProviders()
    },
  )

  ipcMain.handle(
    'aihub:configureProvider',
    async (_e, provider: string, apiKey: string, model?: string, baseUrl?: string): Promise<void> => {
      await aiHubService.configureProvider(provider, apiKey, model, baseUrl)
    },
  )

  ipcMain.handle('aihub:setDefaultProvider', async (_e, provider: string): Promise<void> => {
    await aiHubService.setDefaultProvider(provider)
  })

  // AI Hub 测试连接
  ipcMain.handle(
    'aihub:testConnection',
    async (
      _e,
      provider: string,
      apiKey: string,
      baseUrl: string,
      model: string,
    ): Promise<{ status: string; message: string }> => {
      return await aiHubService.testConnection(provider, apiKey, baseUrl, model)
    },
  )

  // AI Hub 同步 Provider 配置
  ipcMain.handle(
    'aihub:syncProviders',
    async (
      _e,
      configs: Array<{ provider: string; apiKey: string; model: string; baseUrl: string }>,
      defaultProvider: string,
    ): Promise<void> => {
      await aiHubService.syncProviders(configs, defaultProvider)
    },
  )

  // AI Hub 策略路由
  ipcMain.handle(
    'aihub:resolveProvider',
    async (
      _e,
      message: string,
      routingRules: Array<{ taskType: string; provider: string }>,
      defaultProvider: string,
    ): Promise<string> => {
      return aiHubService.resolveProvider(message, routingRules, defaultProvider)
    },
  )

  // AI Hub 获取模型列表
  ipcMain.handle(
    'aihub:fetchModels',
    async (_e, baseUrl: string, apiKey: string): Promise<{ status: string; models: string[]; message?: string }> => {
      return await aiHubService.fetchModels(baseUrl, apiKey)
    },
  )

  // AI Hub 保存 Skill
  ipcMain.handle(
    'aihub:saveSkill',
    async (_e, name: string, content: string): Promise<{ status: string; name: string }> => {
      return await aiHubService.saveSkill(name, content)
    },
  )

  // ===== AI 配置备份/恢复 =====
  const aiConfigBackupFile = path.join(getUserDataDir(), 'ai-config-backup.json')

  ipcMain.handle('app:backupAiConfig', async (_e, config: unknown): Promise<void> => {
    try {
      fs.writeFileSync(aiConfigBackupFile, JSON.stringify(config, null, 2), 'utf-8')
    } catch (err) {
      logger.error('备份 AI 配置失败', err)
    }
  })

  ipcMain.handle('app:restoreAiConfig', async (): Promise<unknown> => {
    try {
      if (fs.existsSync(aiConfigBackupFile)) {
        const content = fs.readFileSync(aiConfigBackupFile, 'utf-8')
        return JSON.parse(content)
      }
    } catch (err) {
      logger.error('恢复 AI 配置失败', err)
    }
    return null
  })

  // ===== 项目同步 =====

  ipcMain.handle('project:getLocalSha', async (_e, projectName: string): Promise<string | null> => {
    const projectDir = resolveProjectDir(projectName)
    if (!projectDir || !fs.existsSync(projectDir)) return null
    return getLocalCommitSha(projectDir)
  })

  ipcMain.handle(
    'project:collectProjectFiles',
    async (_e, projectName: string): Promise<{ path: string; content: string }[]> => {
      const projectDir = resolveProjectDir(projectName)
      if (!projectDir || !fs.existsSync(projectDir)) {
        throw new Error(`项目不存在: ${projectName}`)
      }
      return collectProjectFiles(projectDir)
    },
  )

  ipcMain.handle(
    'project:installRemoteProject',
    async (_e, data: { name: string; zipData: string; owner: string }): Promise<void> => {
      const projectDir = resolveProjectDir(data.name)
      if (!projectDir) throw new Error('项目名称无效')
      const workspaceDir = getWorkspaceDir()
      await installRemoteProject(data.zipData, workspaceDir, data.name, data.owner, projectDir)
      refreshWorkspace()
      logger.info(`远程项目安装成功: ${data.owner}/${data.name}`)
    },
  )

  ipcMain.handle(
    'project:batchGetLocalSha',
    async (_e, projectNames: string[]): Promise<Record<string, string | null>> => {
      const result: Record<string, string | null> = {}
      for (const name of projectNames) {
        const projectDir = resolveProjectDir(name)
        if (projectDir && fs.existsSync(projectDir)) {
          result[name] = await getLocalCommitSha(projectDir)
        } else {
          result[name] = null
        }
      }
      return result
    },
  )

  // ===== 平台 Token 安全存储 =====
  ipcMain.handle('platform:saveToken', async (_e, token: string): Promise<void> => {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(token)
        const tokenFile = path.join(getUserDataDir(), 'platform-token.enc')
        fs.writeFileSync(tokenFile, encrypted)
      } else {
        // 回退到普通文件存储（开发环境）
        const tokenFile = path.join(getUserDataDir(), 'platform-token.json')
        fs.writeFileSync(tokenFile, JSON.stringify({ token }), 'utf-8')
      }
    } catch (err) {
      logger.error('保存平台 Token 失败', err)
    }
  })

  ipcMain.handle('platform:loadToken', async (): Promise<string | null> => {
    try {
      const encFile = path.join(getUserDataDir(), 'platform-token.enc')
      const jsonFile = path.join(getUserDataDir(), 'platform-token.json')
      if (fs.existsSync(encFile)) {
        if (safeStorage.isEncryptionAvailable()) {
          const encrypted = fs.readFileSync(encFile)
          return safeStorage.decryptString(encrypted)
        }
      }
      if (fs.existsSync(jsonFile)) {
        const content = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'))
        return content.token || null
      }
    } catch (err) {
      logger.error('加载平台 Token 失败', err)
    }
    return null
  })

  ipcMain.handle('platform:clearToken', async (): Promise<void> => {
    try {
      const encFile = path.join(getUserDataDir(), 'platform-token.enc')
      const jsonFile = path.join(getUserDataDir(), 'platform-token.json')
      if (fs.existsSync(encFile)) fs.unlinkSync(encFile)
      if (fs.existsSync(jsonFile)) fs.unlinkSync(jsonFile)
    } catch (err) {
      logger.error('清除平台 Token 失败', err)
    }
  })
}
