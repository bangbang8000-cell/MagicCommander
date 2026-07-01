import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import * as path from 'path'
import * as fs from 'fs'
import { getPythonPath, getWorkspaceDir, getPythonSitePackages } from '../config'

export class PythonService extends EventEmitter {
  private process: ChildProcess | null = null
  private workingDir: string
  private pythonCmd: string
  private buffer: string = ''
  private isReady: boolean = false
  private pendingStart: Promise<void> | null = null

  constructor() {
    super()
    const devPath = path.join(process.cwd(), 'backend')
    this.workingDir = fs.existsSync(devPath) ? devPath : path.join(process.resourcesPath, 'backend')
    this.pythonCmd = getPythonPath()
  }

  private ensureStarted(): Promise<void> {
    if (this.pendingStart) return this.pendingStart
    if (this.isProcessReady()) return Promise.resolve()
    this.pendingStart = this.spawnPythonProcess().finally(() => {
      this.pendingStart = null
    })
    return this.pendingStart
  }

  private async spawnPythonProcess(): Promise<void> {
    const scriptPath = path.join(this.workingDir, 'pre_processing.py')
    if (!fs.existsSync(this.workingDir) || !fs.existsSync(scriptPath)) {
      this.isReady = false
      return
    }
    return new Promise<void>((resolve) => {
      try {
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1',
          MC_WORKSPACE: getWorkspaceDir(),
        }
        const sitePackages = getPythonSitePackages()
        if (sitePackages && fs.existsSync(sitePackages)) {
          env.PYTHONPATH = sitePackages
        }
        this.process = spawn(this.pythonCmd, [scriptPath], {
          cwd: this.workingDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          env,
        })

        this.process.stdout?.on('data', (data: Buffer) => this.handleStdout(data))
        this.process.stderr?.on('data', (data: Buffer) => this.handleStderr(data))
        this.process.on('exit', () => {
          this.isReady = false
        })
        this.process.on('error', () => {
          this.isReady = false
        })
        this.isReady = true
        resolve()
      } catch {
        this.isReady = false
        resolve()
      }
    })
  }

  private handleStdout(data: Buffer): void {
    this.buffer += data.toString('utf-8')
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      this.emit('output', trimmed)
      this.emit('log', { level: 'info', message: trimmed })
      this.parseProgress(trimmed)
    }
  }

  private handleStderr(data: Buffer): void {
    const message = data.toString('utf-8').trim()
    if (message) {
      this.emit('log', { level: 'error', message })
      this.emit('error', message)
    }
  }

  private parseProgress(line: string): void {
    if (line.includes('完成') || line.includes('程序运行结束')) {
      this.emit('progress', { message: line, type: 'progress' })
    }
    if (line.includes('程序运行结束')) {
      this.emit('progress', { message: line, type: 'complete' })
    }
  }

  getProcess(): ChildProcess | null {
    return this.process
  }

  isProcessReady(): boolean {
    return this.isReady && this.process !== null && !this.process.killed
  }

  async sendCommand(command: string): Promise<void> {
    await this.ensureStarted()
    if (!this.isProcessReady() || !this.process?.stdin?.writable) {
      this.emit('error', 'Python 进程未就绪')
      return
    }
    this.process.stdin.write(command + '\n')
  }

  destroy(): void {
    this.isReady = false
    try {
      this.process?.stdin?.end()
      this.process?.kill()
    } catch {
      // ignore
    }
    this.process = null
  }
}
