import { BrowserWindow } from 'electron'
import { PythonService } from '../services/python.service'
import * as path from 'path'
import * as fs from 'fs'
import { spawn } from 'child_process'
import { escapePythonArg, validateProjectName, validateFilePath } from '../utils/security'
import { getBackendDir, getPythonPath, getWorkspaceDir, APP_CONFIG } from '../config'

const THROTTLE_MS = 100

export class RenderHandler {
  private progressBuffer: any[] = []
  private progressTimer: NodeJS.Timeout | null = null
  private logBuffer: { level: string; message: string }[] = []
  private logTimer: NodeJS.Timeout | null = null

  constructor(
    private python: PythonService,
    private window: BrowserWindow,
  ) {
    python.on('output', (line: string) => {
      try {
        const parsed = JSON.parse(line)
        this.queueProgress(parsed)
      } catch {
        this.queueProgress({ status: 'log', message: line })
      }
    })
    python.on('progress', (data: { status: string; message: string }) => {
      this.queueProgress(data)
    })
    python.on('log', (data: { level: string; message: string }) => {
      this.queueLog(data)
    })
  }

  private queueProgress(item: any): void {
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
    // 安全校验：转义项目 ID
    const safeIds = ids.map(id => escapePythonArg(id)).filter(id => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    const target = safeIds.join(',')
    await this.runPythonCommand(`render project ${target}`)
  }

  async renderYaml(ids: string[]): Promise<void> {
    const safeIds = ids.map(id => escapePythonArg(id)).filter(id => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    const target = safeIds.join(',')
    await this.runPythonCommand(`render yaml ${target}`)
  }

  async renderProjectSn(ids: string[]): Promise<void> {
    const safeIds = ids.map(id => escapePythonArg(id)).filter(id => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    const target = safeIds.join(',')
    await this.runPythonCommand(`render project ${target} --format device_sn`)
  }

  async renderYamlSn(ids: string[]): Promise<void> {
    const safeIds = ids.map(id => escapePythonArg(id)).filter(id => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    const target = safeIds.join(',')
    await this.runPythonCommand(`render yaml ${target} --format device_sn`)
  }

  async createProject(name: string): Promise<void> {
    // 安全校验：项目名
    const validation = validateProjectName(name)
    if (!validation.valid) throw new Error(validation.error || '项目名无效')
    const safeName = escapePythonArg(name)
    await this.runPythonCommand(`project create "${safeName}"`)
  }

  async deleteProject(ids: string[]): Promise<void> {
    const safeIds = ids.map(id => escapePythonArg(id)).filter(id => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    const target = safeIds.join(',')
    await this.runPythonCommand(`project delete ${target} --force`)
  }

  async deleteOutput(ids: string[]): Promise<void> {
    const safeIds = ids.map(id => escapePythonArg(id)).filter(id => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    const target = safeIds.join(',')
    await this.runPythonCommand(`file delete output ${target} --force`)
  }

  async deleteOutputSn(ids: string[]): Promise<void> {
    const safeIds = ids.map(id => escapePythonArg(id)).filter(id => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    const target = safeIds.join(',')
    await this.runPythonCommand(`file delete output-sn ${target} --force`)
  }

  async deleteYaml(ids: string[]): Promise<void> {
    const safeIds = ids.map(id => escapePythonArg(id)).filter(id => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    const target = safeIds.join(',')
    await this.runPythonCommand(`file delete yaml ${target} --force`)
  }

  async deleteYamlSn(ids: string[]): Promise<void> {
    const safeIds = ids.map(id => escapePythonArg(id)).filter(id => id)
    if (safeIds.length === 0) throw new Error('无效的项目 ID')
    const target = safeIds.join(',')
    await this.runPythonCommand(`file delete yaml-sn ${target} --force`)
  }

  async listProjects(): Promise<any[]> {
    return await this.runPythonCommand('project list', true)
  }

  async listProjectParameters(id: string): Promise<any[]> {
    return await this.runPythonCommand(`project info ${id}`, true)
  }

  async labelPrint(ids: string[], config?: unknown): Promise<void> {
    const target = ids.join(',')
    let command = `label print ${target}`
    if (config) {
      const configStr = JSON.stringify(config).replace(/"/g, '\\"')
      command += ` --config "${configStr}"`
    }
    await this.runPythonCommand(command)
  }

  async labelDelete(ids: string[]): Promise<void> {
    const target = ids.join(',')
    await this.runPythonCommand(`label delete ${target}`)
  }

  async readProjectExcel(id: string, file: string, sheet?: string): Promise<any> {
    let command = `project read-excel ${id} "${file}"`
    if (sheet) command += ` --sheet "${sheet}"`
    return await this.runPythonCommand(command, true)
  }

  async writeProjectExcel(id: string, file: string, data: any): Promise<void> {
    const dataStr = JSON.stringify(data)
    const command = `project write-excel ${id} "${file}" '${dataStr.replace(/'/g, "\\'")}'`
    await this.runPythonCommand(command)
  }

  async readProjectFile(id: string, filePath: string): Promise<string> {
    return await this.runPythonCommand(`project read-file ${id} "${filePath}"`, true)
  }

  async writeProjectFile(id: string, filePath: string, content: string): Promise<void> {
    const escaped = content.replace(/"/g, '\\"').replace(/\n/g, '\\n')
    await this.runPythonCommand(`project write-file ${id} "${filePath}" "${escaped}"`)
  }

  async listProjectFiles(id: string, fileType?: string): Promise<any> {
    let command = `project list-files ${id}`
    if (fileType) command += ` --type ${fileType}`
    return await this.runPythonCommand(command, true)
  }

  private async runPythonCommand(command: string, returnData: boolean = false): Promise<any> {
    return new Promise((resolve, reject) => {
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

      const args = command.split(' ').filter((arg) => arg.trim() !== '')
      const fullCommand = [scriptPath, ...args]

      this.queueProgress({ status: 'start', message: `开始执行命令: ${command}` })

      try {
        const pythonProcess = spawn(pythonCmd, fullCommand, {
          cwd: backendPath,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1', MC_WORKSPACE: getWorkspaceDir() },
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
              const jsonMatch = output.match(/\{[\s\S]*\}/)
              if (jsonMatch) {
                try {
                  const result = JSON.parse(jsonMatch[0])
                  if (result.status === 'success') {
                    this.queueProgress({ status: 'complete', message: result.message || '命令执行完成' })
                    resolve(result.data)
                    return
                  }
                  this.queueProgress({ status: 'error', message: result.message || '命令执行失败' })
                  reject(new Error(result.message))
                  return
                } catch {
                  // fallthrough
                }
              }
              reject(new Error(`Python 脚本输出格式不正确（非 JSON）: ${output.slice(0, 500)}`))
            } else {
              this.queueProgress({ status: 'complete', message: '命令执行完成' })
              resolve(null)
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
      } catch (err: any) {
        reject(err)
      }
    })
  }
}
