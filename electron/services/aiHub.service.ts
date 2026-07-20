/**
 * AI Hub 服务
 * 管理 Python AI 子进程的生命周期、健康检查和通信
 */
import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { EventEmitter } from 'events'
import { getPythonPath, getBackendDir, getWorkspaceDir, getTemplateDir } from '../config'
import { logger } from '../utils/logger'

export interface AIHubStatus {
  running: boolean
  port: number
  lastError?: string
  startTime?: number
  installing?: boolean
}

export class AIHubService extends EventEmitter {
  private process: ChildProcess | null = null
  private port: number = 18721
  private host: string = '127.0.0.1'
  private status: AIHubStatus = { running: false, port: 18721 }
  private restartAttempts: number = 0
  private maxRestarts: number = 3
  private restartDelay: number = 3000
  private healthCheckTimer: NodeJS.Timeout | null = null
  private depsChecked: boolean = false

  get baseUrl(): string {
    return `http://${this.host}:${this.port}`
  }

  getStatus(): AIHubStatus {
    return { ...this.status }
  }

  /**
   * 安装 Python 依赖
   */
  async installDependencies(): Promise<boolean> {
    const pythonPath = getPythonPath()
    const backendDir = getBackendDir()

    const aiHubDir = path.join(
      process.env.NODE_ENV === 'development' ? process.cwd() : path.dirname(backendDir),
      'ai_hub',
    )

    const requirementsFile = path.join(aiHubDir, 'requirements.txt')
    if (!fs.existsSync(requirementsFile)) {
      logger.warn('[AIHub] requirements.txt not found, skipping dep install')
      return true
    }

    // 快速检查关键依赖是否已安装
    const checkResult = this.runPythonSync(pythonPath, ['-c', 'import fastapi; import uvicorn; import openai; print("OK")'], aiHubDir)
    if (checkResult?.trim() === 'OK') {
      logger.info('[AIHub] Dependencies already installed')
      this.depsChecked = true
      return true
    }

    logger.info('[AIHub] Installing dependencies...')
    this.status = { ...this.status, installing: true }
    this.emit('installing')

    return new Promise((resolve) => {
      const proc = spawn(pythonPath, ['-m', 'pip', 'install', '-r', requirementsFile, '--quiet'], {
        cwd: aiHubDir,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let output = ''
      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString()
        output += text
        if (text.includes('Successfully installed') || text.includes('already satisfied')) {
          logger.info(`[AIHub] Dep install: ${text.trim()}`)
        }
      })

      proc.on('exit', (code) => {
        this.status = { ...this.status, installing: false }
        if (code === 0) {
          logger.info('[AIHub] Dependencies installed successfully')
          this.depsChecked = true
          resolve(true)
        } else {
          logger.error(`[AIHub] Dep install failed: ${output.trim()}`)
          this.status = { ...this.status, lastError: `依赖安装失败(code=${code})` }
          resolve(false)
        }
      })

      proc.on('error', (err) => {
        this.status = { ...this.status, installing: false }
        logger.error(`[AIHub] Dep install error: ${err.message}`)
        this.status = { ...this.status, lastError: `pip 不可用: ${err.message}` }
        resolve(false)
      })
    })
  }

  private runPythonSync(pythonPath: string, args: string[], cwd: string): string | null {
    try {
      const { execSync } = require('child_process')
      return execSync([pythonPath, ...args].join(' '), {
        cwd,
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      return null
    }
  }

  /**
   * 启动 AI Hub 子进程
   */
  async start(): Promise<void> {
    if (this.process) {
      logger.info('[AIHub] Already running')
      return
    }

    const pythonPath = getPythonPath()
    const backendDir = getBackendDir()
    const workspaceDir = getWorkspaceDir()
    const templateDir = getTemplateDir()

    // ai_hub 目录在项目根目录下
    const aiHubDir = path.join(
      process.env.NODE_ENV === 'development' ? process.cwd() : path.dirname(backendDir),
      'ai_hub',
    )

    // 检查并安装依赖
    if (!this.depsChecked) {
      const depsOk = await this.installDependencies()
      if (!depsOk) {
        throw new Error(this.status.lastError || '依赖安装失败')
      }
    }

    const args = [
      path.join(aiHubDir, 'main.py'),
      '--port', String(this.port),
      '--host', this.host,
      '--workspace', workspaceDir,
      '--template-dir', templateDir,
      '--backend-dir', backendDir,
    ]

    logger.info(`[AIHub] Starting: ${pythonPath} ${args.join(' ')}`)

    return new Promise((resolve, reject) => {
      const proc = spawn(pythonPath, args, {
        cwd: aiHubDir,
        env: {
          ...process.env,
          PYTHONPATH: [backendDir, path.dirname(aiHubDir)].join(path.delimiter),
          PYTHONUNBUFFERED: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let started = false
      const timeout = setTimeout(() => {
        if (!started) {
          reject(new Error('AI Hub 启动超时'))
          proc.kill()
        }
      }, 30000)

      proc.stdout?.on('data', (data: Buffer) => {
        const text = data.toString().trim()
        if (text.includes('AI_HUB_READY')) {
          started = true
          clearTimeout(timeout)
          this.process = proc
          this.status = {
            ...this.status,
            running: true,
            startTime: Date.now(),
          }
          this.restartAttempts = 0
          logger.info(`[AIHub] Started on port ${this.port}`)
          this.startHealthCheck()
          this.emit('started', this.port)
          resolve()
        }
      })

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString().trim()
        if (text) {
          logger.info(`[AIHub] ${text}`)
        }
      })

      proc.on('error', (err) => {
        clearTimeout(timeout)
        logger.error(`[AIHub] Process error: ${err.message}`)
        this.status = { ...this.status, running: false, lastError: err.message }
        this.emit('error', err)
        if (!started) reject(err)
      })

      proc.on('exit', (code, signal) => {
        clearTimeout(timeout)
        logger.info(`[AIHub] Process exited: code=${code} signal=${signal}`)
        this.process = null
        this.status = { ...this.status, running: false }
        this.stopHealthCheck()
        this.emit('stopped', { code, signal })

        // 自动重启
        if (started && this.restartAttempts < this.maxRestarts) {
          this.restartAttempts++
          logger.info(`[AIHub] Auto-restart attempt ${this.restartAttempts}/${this.maxRestarts}`)
          setTimeout(() => this.start().catch((e) => logger.error(`[AIHub] Restart failed: ${e.message}`)), this.restartDelay)
        }
      })
    })
  }

  /**
   * 停止 AI Hub 子进程
   */
  async stop(): Promise<void> {
    this.stopHealthCheck()
    if (!this.process) return

    return new Promise((resolve) => {
      const proc = this.process!
      const timeout = setTimeout(() => {
        logger.warn('[AIHub] Force killing process')
        proc.kill('SIGKILL')
      }, 5000)

      proc.on('exit', () => {
        clearTimeout(timeout)
        this.process = null
        this.status = { ...this.status, running: false }
        logger.info('[AIHub] Stopped')
        resolve()
      })

      proc.kill('SIGTERM')
    })
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    if (!this.status.running) return false

    try {
      const response = await fetch(`${this.baseUrl}/api/chat/health`, {
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  private startHealthCheck(): void {
    this.stopHealthCheck()
    this.healthCheckTimer = setInterval(async () => {
      const healthy = await this.healthCheck()
      if (!healthy && this.status.running) {
        logger.warn('[AIHub] Health check failed, restarting...')
        await this.stop()
        this.start().catch((e) => logger.error(`[AIHub] Restart after health failure: ${e.message}`))
      }
    }, 30000) // 每 30 秒检查一次
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  /**
   * 发送聊天消息（SSE 流式）
   */
  async sendChatMessage(
    sessionId: string,
    message: string,
    mode: string = 'general',
    provider?: string,
    attachments?: Array<{ id: string; name: string; type: string; path: string; size: number }>,
    autonomyMode: string = 'semi_auto',
    onChunk?: (text: string) => void,
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        message,
        mode,
        provider,
        attachments,
        autonomy_mode: autonomyMode,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`AI Hub 请求失败: ${response.status} ${err}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('无法读取流式响应')

    const decoder = new TextDecoder()
    let fullContent = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.content) {
              fullContent += data.content
              onChunk?.(data.content)
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    return fullContent
  }

  /**
   * 清除会话
   */
  async clearSession(sessionId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/chat/clear?session_id=${encodeURIComponent(sessionId)}`, {
      method: 'POST',
    })
  }

  /**
   * 获取 Provider 列表
   */
  async getProviders(): Promise<Array<{ name: string; model: string; enabled: boolean; is_default: boolean }>> {
    const response = await fetch(`${this.baseUrl}/api/chat/providers`)
    const data = await response.json()
    return data.providers || []
  }

  /**
   * 配置 Provider API Key
   */
  async configureProvider(provider: string, apiKey: string, model?: string, baseUrl?: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/chat/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, api_key: apiKey, model, base_url: baseUrl }),
    })
  }

  /**
   * 设置默认 Provider
   */
  async setDefaultProvider(provider: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/chat/config/default`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    })
  }

  /**
   * 测试 Provider 连接
   */
  async testConnection(provider: string, apiKey: string, baseUrl: string, model: string): Promise<{ status: string; message: string }> {
    const response = await fetch(`${this.baseUrl}/api/chat/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, api_key: apiKey, base_url: baseUrl, model }),
    })
    return await response.json()
  }

  /**
   * 同步 Provider 配置到 AI Hub（批量）
   * 将渲染进程 localStorage 中的配置推送到 AI Hub 的 secrets 文件
   */
  async syncProviders(
    configs: Array<{ provider: string; apiKey: string; model: string; baseUrl: string }>,
    defaultProvider: string,
  ): Promise<void> {
    for (const cfg of configs) {
      if (cfg.apiKey) {
        await this.configureProvider(cfg.provider, cfg.apiKey, cfg.model, cfg.baseUrl)
      }
    }
    if (defaultProvider) {
      await this.setDefaultProvider(defaultProvider)
    }
  }

  /**
   * 根据消息内容和路由策略选择合适的 Provider
   */
  resolveProvider(
    message: string,
    routingRules: Array<{ taskType: string; provider: string }>,
    defaultProvider: string,
  ): string {
    // 关键词匹配规则
    const codeKeywords = ['创建', '生成', '模板', '渲染', 'render', 'template', 'create', '新建', '编写', '写', '生成配置']
    const analysisKeywords = ['分析', '对比', '审查', 'review', 'diff', 'compare', 'analyze', '检查', '查看', '评估', '校验']
    const simpleKeywords = ['列表', '列出', 'list', 'show', '显示', '帮助', 'help', '你好', 'hello', '是什么']

    const lowerMsg = message.toLowerCase()

    let taskType = 'complex'
    if (simpleKeywords.some((kw) => lowerMsg.includes(kw))) {
      taskType = 'simple'
    } else if (codeKeywords.some((kw) => lowerMsg.includes(kw))) {
      taskType = 'code'
    } else if (analysisKeywords.some((kw) => lowerMsg.includes(kw))) {
      taskType = 'analysis'
    }

    const rule = routingRules.find((r) => r.taskType === taskType)
    return rule?.provider || defaultProvider
  }

  /**
   * 保存 Skill
   */
  async saveSkill(name: string, content: string): Promise<{ status: string; name: string }> {
    const response = await fetch(`${this.baseUrl}/api/chat/skill/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    })
    return await response.json()
  }

  /**
   * 获取可用模型列表
   */
  async fetchModels(baseUrl: string, apiKey: string): Promise<{ status: string; models: string[]; message?: string }> {
    const response = await fetch(`${this.baseUrl}/api/chat/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_url: baseUrl, api_key: apiKey }),
    })
    return await response.json()
  }
}

// 全局单例
export const aiHubService = new AIHubService()