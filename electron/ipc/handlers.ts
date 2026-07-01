import { ipcMain, BrowserWindow, shell } from 'electron'
import { PythonService } from '../services/python.service'
import { RenderHandler } from './render.handler'
import * as fs from 'fs'
import * as path from 'path'
import {
  validateProjectName,
  validateFilePath,
  validateFileContent,
  buildSafePath,
  isFileTypeAllowed,
  isFileAccessible,
  escapePythonArg,
} from '../utils/security'
import { getBackendDir, getProjectDir, getWorkspaceDir } from '../config'
import { logDebug, logError } from '../utils/logger'

function scanProjects(): { id: number; name: string; index: number }[] {
  const workspaceDir = getWorkspaceDir()
  logDebug('[scanProjects] workspaceDir:', workspaceDir)
  if (!fs.existsSync(workspaceDir)) {
    logDebug('[scanProjects] workspaceDir 不存在')
    return []
  }
  const entries = fs.readdirSync(workspaceDir, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== '__pycache__').map((e) => e.name)
  const sorted = dirs.sort((a, b) => a.localeCompare(b))
  logDebug('[scanProjects] 扫描到的项目:', sorted)
  return sorted.map((name, index) => ({ id: index + 1, name, index: index + 1 }))
}

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

export function setupIpcHandlers(python: PythonService, window: BrowserWindow): void {
  const renderHandler = new RenderHandler(python, window)

  // 项目管理 API — 直接操作文件系统，不依赖 Python
  ipcMain.handle('project:list', async (): Promise<{ id: number; name: string; index: number }[]> => {
    return scanProjects()
  })

  ipcMain.handle('project:create', async (_e, name: string): Promise<void> => {
    // 安全校验：项目名
    const validation = validateProjectName(name)
    if (!validation.valid) {
      throw new Error(validation.error || '项目名无效')
    }
    
    const trimmed = validation.valid ? name.trim() : ''
    const backendDir = getBackendDir()
    const projectDir = getProjectDir(trimmed)
    
    if (fs.existsSync(projectDir)) {
      throw new Error(`项目已存在: ${trimmed}`)
    }
    
    // 创建基础目录结构: project/ templates/ excel/ output/
    fs.mkdirSync(path.join(projectDir, 'templates'), { recursive: true })
    fs.mkdirSync(path.join(projectDir, 'excel'), { recursive: true })
    fs.mkdirSync(path.join(projectDir, 'output'), { recursive: true })
    
    // 创建空白的模板文件示例
    fs.writeFileSync(
      path.join(projectDir, 'templates', 'main.j2'),
      '{% for item in items %}\n{{ item.name }}\n{% endfor %}\n',
      'utf-8',
    )
    
    // 创建示例 Excel 文件
    try {
      const XLSX = require('xlsx')
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([['name', 'value'], ['sample', '1']])
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      XLSX.writeFile(wb, path.join(projectDir, 'excel', 'parameters.xlsx'))
    } catch {
      // ignore — xlsx writing is optional
    }
  })

  ipcMain.handle('project:delete', async (_e, ids: string[]): Promise<void> => {
    const allProjects = scanProjects()
    for (const idStr of ids) {
      const id = Number(idStr)
      const project = allProjects.find((p) => p.id === id)
      if (!project) continue
      const projectDir = getProjectDir(project.name)
      if (fs.existsSync(projectDir)) {
        fs.rmSync(projectDir, { recursive: true, force: true })
      }
    }
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

  // 项目参数查询 API — 回退到 fs 扫描（若无法扫描则返回空）
  ipcMain.handle('project:parameters', async (_e, id: string): Promise<any[]> => {
    const allProjects = scanProjects()
    const project = allProjects.find((p) => String(p.id) === String(id))
    if (!project) return []
    const excelDir = path.join(getWorkspaceDir(), project.name, 'excel')
    if (!fs.existsSync(excelDir)) return []
    const files = fs.readdirSync(excelDir).filter((f) => f.endsWith('.xlsx') || f.endsWith('.xls'))
    return files.map((f) => ({ file: f, path: `excel/${f}` }))
  })

  // 项目文件读写 API（走文件系统，替代 Python 回退）
  ipcMain.handle('project:readFile', async (_e, id: number, filePath: string): Promise<string> => {
    // 安全校验：文件路径
    const pathValidation = validateFilePath(filePath)
    if (!pathValidation.valid) {
      throw new Error(pathValidation.error || '文件路径无效')
    }
    
    // 安全校验：文件类型
    if (!isFileTypeAllowed(filePath)) {
      throw new Error('不支持该文件类型')
    }
    
    const allProjects = scanProjects()
    const project = allProjects.find((p) => Number(p.id) === Number(id))
    if (!project) throw new Error(`未找到项目: ${id}`)
    
    // 构建安全路径
    const projectDir = getProjectDir(project.name)
    const fullPath = buildSafePath(projectDir, filePath)
    if (!fullPath) {
      throw new Error('文件路径不安全')
    }
    
    if (!isFileAccessible(fullPath)) {
      throw new Error(`文件不存在或无法访问`)
    }
    
    return fs.readFileSync(fullPath, 'utf-8')
  })

  ipcMain.handle('project:writeFile', async (_e, id: number, filePath: string, content: string): Promise<void> => {
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
    
    const allProjects = scanProjects()
    const project = allProjects.find((p) => Number(p.id) === Number(id))
    if (!project) throw new Error(`未找到项目: ${id}`)
    
    // 构建安全路径
    const projectDir = getProjectDir(project.name)
    const fullPath = buildSafePath(projectDir, filePath)
    if (!fullPath) {
      throw new Error('文件路径不安全')
    }
    
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
  })

  ipcMain.handle('project:listFiles', async (_e, id: string, fileType?: string): Promise<any[]> => {
    const allProjects = scanProjects()
    const project = allProjects.find((p) => String(p.id) === String(id))
    if (!project) return []
    const projectDir = path.join(getWorkspaceDir(), project.name)
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
          } else if (fileType === 'text' && ['.txt', '.yml', '.yaml', '.j2', '.jinja', '.jinja2', '.html', '.json', '.md'].includes(ext)) {
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
  ipcMain.handle('project:readExcel', async (_e, projectId: number, filePath: string): Promise<{ name: string; headers: string[]; rows: Record<string, any>[] }[]> => {
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
    
    const allProjects = scanProjects()
    const project = allProjects.find((p) => Number(p.id) === Number(projectId))
    if (!project) {
      throw new Error(`未找到项目: ${projectId}`)
    }
    
    // 构建安全路径
    const projectDir = getProjectDir(project.name)
    const fullPath = buildSafePath(projectDir, filePath)
    if (!fullPath) {
      throw new Error('文件路径不安全')
    }
    
    if (!isFileAccessible(fullPath)) {
      throw new Error(`文件不存在或无法访问`)
    }
    
    return readExcelByPath(fullPath)
  })

  ipcMain.handle('project:writeExcel', async (_e, projectId: number, filePath: string, sheets: { name: string; headers: string[]; rows: Record<string, any>[] }[]): Promise<void> => {
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
    
    const allProjects = scanProjects()
    const project = allProjects.find((p) => Number(p.id) === Number(projectId))
    if (!project) throw new Error(`未找到项目: ${projectId}`)
    
    // 构建安全路径
    const projectDir = getProjectDir(project.name)
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
    console.log('[project:writeExcel] 保存成功')
  })

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

  ipcMain.handle('feature:label-delete', async (_e, ids: string[]): Promise<void> => {
    return await renderHandler.labelDelete(ids)
  })

  // 文件操作API
  ipcMain.handle('file:read', async (_e, filePath: string): Promise<string> => {
    console.log('[file:read] 请求路径:', filePath)
    if (!fs.existsSync(filePath)) {
      console.log('[file:read] 文件不存在:', filePath)
      throw new Error('文件不存在')
    }
    const buffer = fs.readFileSync(filePath)
    let text = buffer.toString('utf-8')
    if (text.includes('\uFFFD')) {
      try {
        const iconv = require('iconv-lite')
        text = iconv.decode(buffer, 'gbk')
      } catch {
        console.log('[file:read] iconv-lite 加载失败，使用 UTF-8 结果')
      }
    }
    console.log('[file:read] 读取成功，长度:', text.length)
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

  ipcMain.handle('file:readExcel', async (_e, filePath: string): Promise<{ name: string; headers: string[]; rows: Record<string, any>[] }[]> => {
    try {
      return readExcelByPath(filePath)
    } catch (err: any) {
      console.error('[file:readExcel] 错误:', err.message)
      throw err
    }
  })

  // 文件读取 API —— Word 文档
  ipcMain.handle('file:readDocx', async (_e, filePath: string): Promise<string> => {
    console.log('[file:readDocx] 请求:', filePath)
    if (!fs.existsSync(filePath)) {
      console.log('[file:readDocx] 文件不存在:', filePath)
      throw new Error('文件不存在: ' + filePath)
    }
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    if (ext === '.doc') {
      throw new Error('请将 .doc 文件在 Word 中另存为 .docx 格式后再打开')
    }
    try {
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ path: filePath })
      console.log('[file:readDocx] 读取成功，文本长度:', String(result.value).length)
      return result.value
    } catch (err: any) {
      console.log('[file:readDocx] 解析失败:', err.message)
      throw new Error('解析 Word 文档失败: ' + (err.message || String(err)))
    }
  })

  // 项目文件读取 API —— Word 文档（通过 projectId + 相对路径）
  ipcMain.handle('project:readDocx', async (_e, projectId: number, filePath: string): Promise<string> => {
    console.log('[project:readDocx] 请求 projectId:', projectId, 'filePath:', filePath)
    const allProjects = scanProjects()
    const project = allProjects.find((p) => Number(p.id) === Number(projectId))
    if (!project) throw new Error(`未找到项目: ${projectId}`)
    const fullPath = path.join(getWorkspaceDir(), project.name, String(filePath))
    console.log('[project:readDocx] 完整路径:', fullPath)
    if (!fs.existsSync(fullPath)) throw new Error(`文件不存在: ${fullPath}`)

    const ext = fullPath.slice(fullPath.lastIndexOf('.')).toLowerCase()
    if (ext === '.doc') {
      throw new Error('请将 .doc 文件在 Word 中另存为 .docx 格式后再打开')
    }
    try {
      const mammoth = require('mammoth')
      const result = await mammoth.extractRawText({ path: fullPath })
      console.log('[project:readDocx] 读取成功，文本长度:', String(result.value).length)
      return result.value
    } catch (err: any) {
      console.log('[project:readDocx] 解析失败:', err.message)
      throw new Error('解析 Word 文档失败: ' + (err.message || String(err)))
    }
  })

  // 项目文件读取 API —— Word 文档（返回 ArrayBuffer 用于 docx-preview）
  ipcMain.handle('project:readDocxBuffer', async (_e, projectId: number, filePath: string): Promise<ArrayBuffer> => {
    console.log('[project:readDocxBuffer] 请求 projectId:', projectId, 'filePath:', filePath)
    const allProjects = scanProjects()
    const project = allProjects.find((p) => Number(p.id) === Number(projectId))
    if (!project) throw new Error(`未找到项目: ${projectId}`)
    const fullPath = path.join(getWorkspaceDir(), project.name, String(filePath))
    console.log('[project:readDocxBuffer] 完整路径:', fullPath)
    if (!fs.existsSync(fullPath)) throw new Error(`文件不存在: ${fullPath}`)

    const ext = fullPath.slice(fullPath.lastIndexOf('.')).toLowerCase()
    if (ext === '.doc') {
      throw new Error('请将 .doc 文件在 Word 中另存为 .docx 格式后再打开')
    }

    try {
      const buffer = fs.readFileSync(fullPath)
      console.log('[project:readDocxBuffer] 读取成功，文件大小:', buffer.length)
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    } catch (err: any) {
      console.log('[project:readDocxBuffer] 读取失败:', err.message)
      throw new Error('读取 Word 文档失败: ' + (err.message || String(err)))
    }
  })

  // 应用API
  ipcMain.handle('app:getVersion', async (): Promise<string> => {
    return require('../../package.json').version
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
  ipcMain.handle('dialog:showMessage', async (_e, options: { type: 'info' | 'warning' | 'error'; title: string; message: string }): Promise<void> => {
    // 在Electron中实现消息对话框
    console.log(`[${options.type}] ${options.title}: ${options.message}`)
  })

  ipcMain.handle('dialog:showConfirm', async (_e, options: { title: string; message: string }): Promise<boolean> => {
    // 在Electron中实现确认对话框
    console.log(`[Confirm] ${options.title}: ${options.message}`)
    return true // 默认返回确认
  })

  // 日志API
  ipcMain.handle('log:write', async (_e, level: string, message: string): Promise<void> => {
    console.log(`[${level}] ${message}`)
    if (!window.isDestroyed()) {
      window.webContents.send('log:output', { level, message })
    }
  })

  // Shell API
  ipcMain.handle('shell:showItemInFolder', async (_e, filePath: string): Promise<void> => {
    shell.showItemInFolder(filePath)
  })
}
