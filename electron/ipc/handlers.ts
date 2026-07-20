import { ipcMain, BrowserWindow, shell } from 'electron'
import { RenderHandler } from './render.handler'
import * as fs from 'fs'
import * as path from 'path'
import {
  validateFilePath,
  validateFileContent,
  buildSafePath,
  isFileTypeAllowed,
  isFileAccessible,
  validateProjectName,
} from '../utils/security'
import { logger } from '../utils/logger'
import { getBackendDir, getExampleDir, getTemplateDir, getWorkspaceDir, getUserDataDir, APP_CONFIG } from '../config'
import {
  listTemplateInfosFromDir,
  readTemplateMeta,
  writeTemplateMeta,
  type TemplateMeta,
} from '../services/template.service'
import { readWorkspaceIndex, refreshWorkspaceIndex } from '../services/workspace-index.service'
import { aiHubService, type AIHubStatus } from '../services/aiHub.service'

function readExcelByPath(filePath: string): { name: string; headers: string[]; rows: Record<string, any>[] }[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`)
  }
  const XLSX = require('xlsx')
  const workbook = XLSX.readFile(filePath)
  const sheetNames = workbook.SheetNames
  return sheetNames.map((name: string) => {
    const worksheet = workbook.Sheets[name]
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' })
    const headers = rows.length > 0 ? Object.keys(rows[0]) : []
    return { name, headers, rows }
  })
}

function isProjectLikeDir(dirPath: string): boolean {
  return ['para.xlsx', 'excel', 'templates', 'output', 'yaml'].some((name) => fs.existsSync(path.join(dirPath, name)))
}

function copyDirRecursive(src: string, dest: string, options?: { skipRuntimeDirs?: boolean }): void {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === '__pycache__') continue
    if (options?.skipRuntimeDirs && ['output', 'yaml', 'output-label', 'output-label-md', 'output-label-pdf'].includes(entry.name)) continue
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
    const project = projects.find((p: any) => String(p.id) === String(id))
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
      const project = projects.find((p: any) => p.name === projectName)
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

  ipcMain.handle('project:getTemplate', async (_e, id: string) => {
    const template = listTemplateInfosFromDir(getTemplateDir()).find((item) => item.id === id)
    if (!template) throw new Error(`模板不存在: ${id}`)
    return template
  })

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

  ipcMain.handle('project:saveAsTemplate', async (_e, projectName: string, templateName: string, meta: Partial<TemplateMeta>): Promise<void> => {
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
  })

  ipcMain.handle('project:updateTemplateMeta', async (_e, id: string, meta: Partial<TemplateMeta>): Promise<void> => {
    const targetPath = path.join(getTemplateDir(), id)
    if (!fs.existsSync(targetPath)) throw new Error(`模板不存在: ${id}`)
    const current = readTemplateMeta(targetPath, id)
    writeTemplateMeta(targetPath, { ...current, ...meta })
    refreshWorkspace()
  })

  ipcMain.handle('project:deleteTemplate', async (_e, id: string): Promise<void> => {
    const targetPath = path.join(getTemplateDir(), id)
    if (!fs.existsSync(targetPath)) throw new Error(`模板不存在: ${id}`)
    fs.rmSync(targetPath, { recursive: true, force: true })
    refreshWorkspace()
  })

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

  ipcMain.handle('project:structure', async (_e, name: string): Promise<any[]> => {
    const projectPath = path.join(getWorkspaceDir(), String(name))
    if (!fs.existsSync(projectPath)) {
      return []
    }

    async function buildFileTree(dirPath: string, basePath: string): Promise<any[]> {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
      const result: any[] = []
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

  // 项目参数查询 API — 按 Python 项目列表解析 ID，避免与界面列表不一致
  ipcMain.handle('project:parameters', async (_e, id: string): Promise<any[]> => {
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

  ipcMain.handle('project:listFiles', async (_e, id: string, fileType?: string): Promise<any[]> => {
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
  })

  // 项目 Excel 读写（已使用文件系统直接读写）
  ipcMain.handle(
    'project:readExcel',
    async (
      _e,
      projectId: number,
      filePath: string,
      projectName?: string,
    ): Promise<{ name: string; headers: string[]; rows: Record<string, any>[] }[]> => {
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
      sheets: { name: string; headers: string[]; rows: Record<string, any>[] }[],
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
      const XLSX = require('xlsx')
      const wb = XLSX.utils.book_new()
      for (const sheet of sheets) {
        const ws = XLSX.utils.json_to_sheet(sheet.rows, { header: sheet.headers })
        XLSX.utils.book_append_sheet(wb, ws, sheet.name)
      }
      XLSX.writeFile(wb, fullPath)
      logger.info('[project:writeExcel] 保存成功')
    },
  )

  // 渲染 API（通过 Python 后端执行）
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
  ipcMain.handle('render:dry-run', async (_e, ids: string[], format?: 'device_name' | 'device_sn'): Promise<any> => {
    const args = ['render', 'dry-run', ids.join(',')]
    if (format === 'device_sn') args.push('--format', 'device_sn')
    return await renderHandler.runPythonCommand(args, true)
  })

  // 校验
  ipcMain.handle('validate:template', async (_e, ids: string[]): Promise<any> => {
    return await renderHandler.runPythonCommand(['validate', 'template', ids.join(',')], true)
  })

  ipcMain.handle('validate:excel', async (_e, ids: string[]): Promise<any> => {
    return await renderHandler.runPythonCommand(['validate', 'excel', ids.join(',')], true)
  })

  // Diff 对比
  ipcMain.handle('diff:compare', async (_e, project: string, device: string, content: string, format: string): Promise<any> => {
    return await renderHandler.runPythonCommand(['diff', project, device, content, '--format', format], true)
  })

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
  ipcMain.handle('file:read', async (_e, filePath: string): Promise<string> => {
    logger.info('[file:read] 请求路径:', filePath)
    if (!fs.existsSync(filePath)) {
      logger.error('[file:read] 文件不存在:', filePath)
      throw new Error('文件不存在')
    }
    const buffer = fs.readFileSync(filePath)
    let text = buffer.toString('utf-8')
    if (text.includes('\uFFFD')) {
      try {
        const iconv = require('iconv-lite')
        text = iconv.decode(buffer, 'gbk')
      } catch {
        logger.warn('[file:read] iconv-lite 加载失败，使用 UTF-8 结果')
      }
    }
    logger.info('[file:read] 读取成功，长度:', text.length)
    return text
  })

  ipcMain.handle('file:write', async (_e, filePath: string, content: string): Promise<void> => {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, content, 'utf-8')
  })

  ipcMain.handle('file:exists', async (_e, filePath: string): Promise<boolean> => {
    const exists = fs.existsSync(filePath)
    return exists
  })

  ipcMain.handle(
    'file:readExcel',
    async (_e, filePath: string): Promise<{ name: string; headers: string[]; rows: Record<string, any>[] }[]> => {
      try {
        return readExcelByPath(filePath)
      } catch (err: any) {
        logger.error('[file:readExcel] 错误:', err.message)
        throw err
      }
    },
  )

  // 文件读取 API —— Word 文档
  ipcMain.handle('file:readDocx', async (_e, filePath: string): Promise<string> => {
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
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ path: filePath })
      logger.info('[file:readDocx] 读取成功，文本长度:', String(result.value).length)
      return result.value
    } catch (err: any) {
      logger.error('[file:readDocx] 解析失败:', err.message)
      throw new Error('解析 Word 文档失败: ' + (err.message || String(err)))
    }
  })

  // 项目文件读取 API —— Word 文档（通过 projectId + 相对路径）
  ipcMain.handle(
    'project:readDocx',
    async (_e, projectId: number, filePath: string, projectName?: string): Promise<string> => {
      logger.info('[project:readDocx] 请求', { projectId, projectName, filePath })
      const projectDir = await getProjectPath(projectId, projectName)
      const fullPath = path.join(projectDir, String(filePath))
      logger.info('[project:readDocx] 完整路径:', fullPath)
      if (!fs.existsSync(fullPath)) throw new Error(`文件不存在: ${fullPath}`)

      const ext = fullPath.slice(fullPath.lastIndexOf('.')).toLowerCase()
      if (ext === '.doc') {
        throw new Error('请将 .doc 文件在 Word 中另存为 .docx 格式后再打开')
      }
      try {
        const mammoth = require('mammoth')
        const result = await mammoth.extractRawText({ path: fullPath })
        logger.info('[project:readDocx] 读取成功，文本长度:', String(result.value).length)
        return result.value
      } catch (err: any) {
        logger.error('[project:readDocx] 解析失败:', err.message)
        throw new Error('解析 Word 文档失败: ' + (err.message || String(err)))
      }
    },
  )

  // 项目文件读取 API —— Word 文档（返回 ArrayBuffer 用于 docx-preview）
  ipcMain.handle(
    'project:readDocxBuffer',
    async (_e, projectId: number, filePath: string, projectName?: string): Promise<ArrayBuffer> => {
      logger.info('[project:readDocxBuffer] 请求', { projectId, projectName, filePath })
      const projectDir = await getProjectPath(projectId, projectName)
      const fullPath = path.join(projectDir, String(filePath))
      logger.info('[project:readDocxBuffer] 完整路径:', fullPath)
      if (!fs.existsSync(fullPath)) throw new Error(`文件不存在: ${fullPath}`)

      const ext = fullPath.slice(fullPath.lastIndexOf('.')).toLowerCase()
      if (ext === '.doc') {
        throw new Error('请将 .doc 文件在 Word 中另存为 .docx 格式后再打开')
      }

      try {
        const buffer = fs.readFileSync(fullPath)
        logger.info('[project:readDocxBuffer] 读取成功，文件大小:', buffer.length)
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      } catch (err: any) {
        logger.error('[project:readDocxBuffer] 读取失败:', err.message)
        throw new Error('读取 Word 文档失败: ' + (err.message || String(err)))
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
    return require('../../package.json').version
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
      // 在Electron中实现消息对话框
      logger.info(`[${options.type}] ${options.title}: ${options.message}`)
    },
  )

  ipcMain.handle('dialog:showConfirm', async (_e, options: { title: string; message: string }): Promise<boolean> => {
    // 在Electron中实现确认对话框
    logger.info(`[Confirm] ${options.title}: ${options.message}`)
    return true // 默认返回确认
  })

  // 日志API
  ipcMain.handle('log:write', async (_e, level: string, message: string): Promise<void> => {
    logger.info(`[${level}] ${message}`)
    if (!window.isDestroyed()) {
      window.webContents.send('log:output', { level, message })
    }
  })

  // Shell API
  ipcMain.handle('shell:showItemInFolder', async (_e, filePath: string): Promise<void> => {
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
    ): Promise<string> => {
      let fullContent = ''
      await aiHubService.sendChatMessage(
        sessionId,
        message,
        mode,
        provider,
        attachments,
        autonomyMode,
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
  ipcMain.handle('aihub:getProviders', async (): Promise<Array<{ name: string; model: string; enabled: boolean; is_default: boolean }>> => {
    return await aiHubService.getProviders()
  })

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
    async (_e, provider: string, apiKey: string, baseUrl: string, model: string): Promise<{ status: string; message: string }> => {
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
}
