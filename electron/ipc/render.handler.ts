import { BrowserWindow } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { spawn } from 'child_process'
import { sanitizePathArg, validateProjectName, isPathSafe } from '../utils/security'
import { getPythonPath, getWorkspaceDir, getPythonSitePackages } from '../config'
import { telemetryService } from '../services/telemetry.service'

const THROTTLE_MS = 100

export function formatCommandForLog(args: string[]): string {
  return args.map((arg) => (/\s|"/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)).join(' ')
}

export interface PythonOutput {
  status?: string
  message?: string
  data?: unknown
}

export interface ProgressEvent {
  status: string
  message?: string
  data?: unknown
  [key: string]: unknown
}

export class RenderHandler {
  private progressBuffer: ProgressEvent[] = []
  private progressTimer: NodeJS.Timeout | null = null
  private logBuffer: { level: string; message: string }[] = []
  private logTimer: NodeJS.Timeout | null = null
  constructor(private window: BrowserWindow) {
    // Python output is now handled via per-command spawn in runPythonCommand()
  }

  private queueProgress(item: ProgressEvent): void {
    this.progressBuffer.push(item)
    if (this.progressTimer) return
    this.progressTimer = setTimeout(() => this.flushProgress(), THROTTLE_MS)
  }

  private flushProgress(): void {
    const items = this.progressBuffer
    this.progressBuffer = []
    this.progressTimer = null
    if (items.length === 0 || this.window.isDestroyed()) return
    // 若只有 1 条，直接发送；多条批量发送
    if (items.length === 1) {
      this.window.webContents.send('render:progress', items[0])
      return
    }
    // 批量：只发送最后一条 status + 合并 message（避免渲染器端多次 setState）
    const last = items[items.length - 1]
    const mergedMessage = items
      .map((i) => (typeof i?.message === 'string' ? i.message : ''))
      .filter(Boolean)
      .join(' | ')
    this.window.webContents.send('render:progress', {
      status: last?.status || 'log',
      message: mergedMessage,
      data: last?.data,
    })
  }

  private queueLog(item: { level: string; message: string }): void {
    this.logBuffer.push(item)
    if (this.logTimer) return
    this.logTimer = setTimeout(() => this.flushLog(), THROTTLE_MS)
  }

  private flushLog(): void {
    const items = this.logBuffer
    this.logBuffer = []
    this.logTimer = null
    if (items.length === 0 || this.window.isDestroyed()) return
    for (const item of items) {
      this.window.webContents.send('log:output', item)
    }
  }

  async renderProject(ids: string[]): Promise<void> {
    const safeIds = ids.map((id) => sanitizePathArg(id)).filter((id) => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    await this.runPythonCommand(['render', 'project', safeIds.join(',')])
  }

  async renderYaml(ids: string[]): Promise<void> {
    const safeIds = ids.map((id) => sanitizePathArg(id)).filter((id) => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    await this.runPythonCommand(['render', 'yaml', safeIds.join(',')])
  }

  async renderProjectSn(ids: string[]): Promise<void> {
    const safeIds = ids.map((id) => sanitizePathArg(id)).filter((id) => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    await this.runPythonCommand(['render', 'project', safeIds.join(','), '--format', 'device_sn'])
  }

  async renderYamlSn(ids: string[]): Promise<void> {
    const safeIds = ids.map((id) => sanitizePathArg(id)).filter((id) => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    await this.runPythonCommand(['render', 'yaml', safeIds.join(','), '--format', 'device_sn'])
  }

  // P1.4 + 契约 v1.2（P2）：plan:table 导入（projectDir 可选 → 自动匹配新建/更新/跳过；支持 .zip 交付包）
  async planImport(planJson: string, projectDir?: string): Promise<unknown> {
    const safePlan = sanitizePathArg(planJson)
    if (!safePlan) throw new Error('无效的规划文件路径')
    const args = ['plan', 'import', safePlan]
    if (projectDir) {
      const safeDir = this.assertWorkspaceDir(projectDir)
      if (safeDir) args.push(safeDir)
    }
    return await this.runPythonCommand(args, true)
  }

  // P2（V-MC4）：内存 plan 直接导入（tunable 编辑后重导入，免临时文件；--rehash 由 Python 权威重算 planHash）
  async planImportData(plan: unknown, projectDir?: string): Promise<unknown> {
    const tmp = path.join(os.tmpdir(), `aidc_plan_${Date.now()}.json`)
    fs.writeFileSync(tmp, JSON.stringify(plan), 'utf-8')
    const args = ['plan', 'import', sanitizePathArg(tmp), '--rehash']
    if (projectDir) {
      const safeDir = this.assertWorkspaceDir(projectDir)
      if (safeDir) args.push(safeDir)
    }
    try {
      return await this.runPythonCommand(args, true)
    } finally {
      try {
        fs.unlinkSync(tmp)
      } catch {
        /* ignore */
      }
    }
  }

  // P1.4: j2 模板 ↔ 规划字段 对齐检查
  async planAnalyze(projectDir: string): Promise<unknown> {
    const safeDir = this.assertWorkspaceDir(projectDir)
    if (!safeDir) throw new Error('无效的项目目录')
    return await this.runPythonCommand(['plan', 'analyze', safeDir], true)
  }

  // G4: plan:table 契约级校验（桥接标识 + macro 完整 + 接线引用）
  async planValidate(planJson: string): Promise<unknown> {
    const safePlan = sanitizePathArg(planJson)
    if (!safePlan) throw new Error('无效的规划文件路径')
    return await this.runPythonCommand(['plan', 'validate', safePlan], true)
  }

  // MC-M3e: 校验数据源统一——以内存 plan 对象为准（临时文件导入，路径仅初始载入）
  async planValidateData(plan: unknown): Promise<unknown> {
    const tmp = path.join(os.tmpdir(), `aidc_validate_${Date.now()}.json`)
    fs.writeFileSync(tmp, JSON.stringify(plan), 'utf-8')
    try {
      return await this.runPythonCommand(['plan', 'validate', sanitizePathArg(tmp)], true)
    } finally {
      try {
        fs.unlinkSync(tmp)
      } catch {
        /* ignore */
      }
    }
  }

  // P2（V-MC2）：渲染命令核对矩阵（结构化 JSON）
  async planVerify(projectDir: string): Promise<unknown> {
    const safeDir = this.assertWorkspaceDir(projectDir)
    if (!safeDir) throw new Error('无效的项目目录')
    return await this.runPythonCommand(['plan', 'verify', safeDir], true)
  }

  // 4.8.0（F8-1 / 48-a）：项目包导出/导入（可移植项目包，zip + manifest）
  async exportProjectPackage(projectName: string, outPath: string): Promise<unknown> {
    const safeName = sanitizePathArg(projectName)
    if (!safeName) throw new Error('无效的项目名称')
    if (!outPath) throw new Error('无效的导出路径')
    return await this.runPythonCommand(['project', 'package', 'export', safeName, outPath], true)
  }

  async importProjectPackage(packagePath: string, projectDir?: string): Promise<unknown> {
    const safePackage = sanitizePathArg(packagePath)
    if (!safePackage) throw new Error('无效的项目包路径')
    const args = ['project', 'package', 'import', safePackage]
    if (projectDir) {
      const safeDir = this.assertWorkspaceDir(projectDir)
      if (safeDir) args.push(safeDir)
    }
    return await this.runPythonCommand(args, true)
  }

  /** 校验 projectDir 属于 workspace 内且为安全路径；不合法返回 null */
  private assertWorkspaceDir(projectDir: string): string | null {
    const safe = sanitizePathArg(projectDir)
    if (!safe) return null
    // 绝对路径：必须在 workspace 内；相对路径：由 Python 以 MC_WORKSPACE 为基解析
    if (path.isAbsolute(safe) && !isPathSafe(safe, getWorkspaceDir())) return null
    return safe
  }

  async createProject(name: string): Promise<void> {
    const validation = validateProjectName(name)
    if (!validation.valid) throw new Error(validation.error || '项目名无效')
    await this.runPythonCommand(['project', 'create', name])
  }

  async deleteProject(ids: string[]): Promise<void> {
    const safeIds = ids.map((id) => sanitizePathArg(id)).filter((id) => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    await this.runPythonCommand(['project', 'delete', safeIds.join(','), '--force'])
  }

  async deleteOutput(ids: string[]): Promise<void> {
    const safeIds = ids.map((id) => sanitizePathArg(id)).filter((id) => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    await this.runPythonCommand(['file', 'delete', 'output', safeIds.join(','), '--force'])
  }

  async deleteOutputSn(ids: string[]): Promise<void> {
    const safeIds = ids.map((id) => sanitizePathArg(id)).filter((id) => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    await this.runPythonCommand(['file', 'delete', 'output-sn', safeIds.join(','), '--force'])
  }

  async deleteYaml(ids: string[]): Promise<void> {
    const safeIds = ids.map((id) => sanitizePathArg(id)).filter((id) => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    await this.runPythonCommand(['file', 'delete', 'yaml', safeIds.join(','), '--force'])
  }

  async deleteYamlSn(ids: string[]): Promise<void> {
    const safeIds = ids.map((id) => sanitizePathArg(id)).filter((id) => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    await this.runPythonCommand(['file', 'delete', 'yaml-sn', safeIds.join(','), '--force'])
  }

  async listProjects(): Promise<{ id: number; name: string; index: number }[]> {
    return await this.runPythonCommand<{ id: number; name: string; index: number }[]>(['project', 'list'], true)
  }

  async listProjectParameters(id: string): Promise<Array<{ file: string; path: string }>> {
    return await this.runPythonCommand<Array<{ file: string; path: string }>>(['project', 'info', id], true)
  }

  async labelPrint(ids: string[], config?: unknown): Promise<void> {
    const target = ids.join(',')
    const args: string[] = ['label', 'print', target]
    if (config) {
      args.push('--config', JSON.stringify(config))
    }
    await this.runPythonCommand(args)
  }

  async labelMarkdown(ids: string[], config?: unknown): Promise<void> {
    const target = ids.join(',')
    const args: string[] = ['label', 'md', target]
    if (config) {
      args.push('--config', JSON.stringify(config))
    }
    await this.runPythonCommand(args)
  }

  async labelDelete(ids: string[]): Promise<void> {
    const target = ids.join(',')
    await this.runPythonCommand(['label', 'delete', target])
  }

  async readProjectExcel(
    id: string,
    file: string,
    sheet?: string,
  ): Promise<Array<{ name: string; headers: string[]; rows: Record<string, unknown>[] }>> {
    const args = ['project', 'read-excel', id, file]
    if (sheet) args.push('--sheet', sheet)
    return await this.runPythonCommand<Array<{ name: string; headers: string[]; rows: Record<string, unknown>[] }>>(
      args,
      true,
    )
  }

  async writeProjectExcel(id: string, file: string, data: unknown): Promise<void> {
    await this.runPythonCommand(['project', 'write-excel', id, file, JSON.stringify(data)])
  }

  async readProjectFile(id: string, filePath: string): Promise<string> {
    return await this.runPythonCommand(['project', 'read-file', id, filePath], true)
  }

  async writeProjectFile(id: string, filePath: string, content: string): Promise<void> {
    await this.runPythonCommand(['project', 'write-file', id, filePath, content])
  }

  async listProjectFiles(
    id: string,
    fileType?: string,
  ): Promise<Array<{ name: string; path: string; isDirectory: boolean }>> {
    const args = ['project', 'list-files', id]
    if (fileType) args.push('--type', fileType)
    return await this.runPythonCommand<Array<{ name: string; path: string; isDirectory: boolean }>>(args, true)
  }

  async runPythonCommand<T = unknown>(args: string[], returnData: boolean = false): Promise<T> {
    const startedAt = Date.now()
    const actionKey = Array.isArray(args) && args.length > 0 ? String(args[0]) : 'python'
    const promise = new Promise<T>((resolve, reject) => {
      const devPath = path.join(process.cwd(), 'backend')
      const backendPath = fs.existsSync(devPath) ? devPath : path.join(process.resourcesPath, 'backend')

      const pythonCmd = getPythonPath()
      const scriptPath = path.join(backendPath, 'main.py')

      if (!fs.existsSync(scriptPath)) {
        const msg = `未找到 Python 脚本: ${scriptPath}（渲染/标签打印功能需要 Python 后端支持）`
        this.queueProgress({ status: 'error', message: msg })
        reject(new Error(msg))
        return
      }

      const fullCommand = [scriptPath, ...args]
      const commandText = formatCommandForLog(args)

      this.queueProgress({ status: 'start', message: `开始执行命令: ${commandText}` })

      try {
        const pythonPaths: string[] = [backendPath]
        const sitePackages = getPythonSitePackages()
        if (sitePackages && fs.existsSync(sitePackages)) {
          pythonPaths.push(sitePackages)
        }
        const pythonProcess = spawn(pythonCmd, fullCommand, {
          cwd: backendPath,
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUNBUFFERED: '1',
            MC_WORKSPACE: getWorkspaceDir(),
            PYTHONPATH: pythonPaths.join(path.delimiter),
          },
          shell: false,
        })

        let output = ''
        let errorOutput = ''

        pythonProcess.stdout.on('data', (data: Buffer) => {
          const str = data.toString('utf-8')
          output += str
          const lines = str.split('\n')
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            try {
              const parsed = JSON.parse(trimmed)
              this.queueProgress(parsed)
            } catch {
              this.queueProgress({ status: 'log', message: trimmed })
            }
          }
        })

        pythonProcess.stderr.on('data', (data: Buffer) => {
          const str = data.toString('utf-8').trim()
          errorOutput += str
          if (str) this.queueProgress({ status: 'log', message: str })
        })

        pythonProcess.on('close', (code: number) => {
          if (code === 0) {
            if (returnData) {
              // 从混合输出中提取最后一个合法 JSON 对象（支持跨行 + 进度消息混合）
              const result = extractLastJson(output)
              if (result && (result.status === 'success' || result.status === 'complete')) {
                this.queueProgress({ status: 'complete', message: result.message || '命令执行完成' })
                resolve(result.data as T)
                return
              }
              if (result && result.status === 'error') {
                this.queueProgress({ status: 'error', message: result.message || '命令执行失败' })
                reject(new Error(result.message))
                return
              }
              reject(new Error(`Python 脚本输出格式不正确（非 JSON）: ${output.slice(0, 500)}`))
            } else {
              this.queueProgress({ status: 'complete', message: '命令执行完成' })
              resolve(null as T)
            }
          } else {
            const msg = `Python 执行失败，退出码: ${code}。请检查 backend/main.py 及依赖。${errorOutput ? ' stderr: ' + errorOutput.slice(0, 500) : ''}`
            this.queueProgress({ status: 'error', message: msg })
            reject(new Error(msg))
          }
        })

        pythonProcess.on('error', (err: Error) => {
          reject(new Error(`无法启动 Python: ${err.message}。请确认已安装 Python 并添加到 PATH。`))
        })
      } catch (err) {
        reject(err)
      }
    })
    // 47-d：关键动作耗时遥测（本地仅落盘，启用时记录）
    promise.then(
      () =>
        telemetryService.record('action.duration', { action: actionKey, durationMs: Date.now() - startedAt, ok: true }),
      () =>
        telemetryService.record('action.duration', {
          action: actionKey,
          durationMs: Date.now() - startedAt,
          ok: false,
        }),
    )
    return promise
  }
}

/**
 * 从混合输出（进度 JSON + 跨行最终 JSON）中提取最后一个合法 JSON 对象。
 * 使用平衡括号追踪，正确处理 indent=2 的多行 JSON 和前缀的进度消息。
 */
function extractLastJson(text: string): PythonOutput | null {
  let depth = 0
  let start = -1
  let lastJson: string | null = null

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{' && depth === 0) {
      start = i
      depth = 1
    } else if (text[i] === '{') {
      depth++
    } else if (text[i] === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        const candidate = text.slice(start, i + 1)
        try {
          JSON.parse(candidate)
          lastJson = candidate
        } catch {
          // JSON 不合法，继续扫描
        }
        start = -1
      }
    }
  }

  if (lastJson) {
    try {
      return JSON.parse(lastJson) as PythonOutput
    } catch {
      return null
    }
  }
  return null
}
