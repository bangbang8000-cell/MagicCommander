/**
 * 47-c：健康检查 / 自检服务（环境 / 引擎 / 网络 / 依赖）
 * - 环境：OS / arch / node / electron 版本、userData 磁盘可用空间
 * - 引擎：AI Hub /api/chat/health；Python 后端探测
 * - 网络：更新源（GitHub Releases latest.yml）连通性、平台 /api/v1/health
 * - 依赖：Python 版本 + 关键模块（openpyxl / yaml / jinja2）
 * 所有探测均有超时保护，单项失败不影响其余项。
 */
import { spawn } from 'child_process'
import * as fs from 'fs'
import { getUserDataDir, getPythonPath } from '../config'
import { aiHubService } from './aiHub.service'

export interface HealthCheckItem {
  name: string
  ok: boolean
  detail: string
}

export interface HealthReport {
  generatedAt: string
  environment: HealthCheckItem[]
  engine: HealthCheckItem[]
  network: HealthCheckItem[]
  dependencies: HealthCheckItem[]
  summary: { total: number; ok: number; failed: number }
}

const UPDATE_SOURCE_URL = 'https://github.com/bangbang8000-cell/MagicCommander/releases/latest/download/latest.yml'
const HEALTH_TIMEOUT_MS = 5000

function okItem(name: string, detail: string): HealthCheckItem {
  return { name, ok: true, detail }
}

function failItem(name: string, detail: string): HealthCheckItem {
  return { name, ok: false, detail }
}

function getDiskFreeBytes(dir: string): number | null {
  try {
    const s = fs.statfsSync(dir)
    return s.bavail * s.bsize
  } catch {
    return null
  }
}

/** 运行 Python 探测命令（版本 / 模块导入），带超时 */
function probePython(script: string, timeoutMs = 10000): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const pythonCmd = getPythonPath()
    let proc: ReturnType<typeof spawn> | null = null
    const timeout = setTimeout(() => {
      if (proc) proc.kill()
      resolve({ ok: false, detail: 'probe timeout' })
    }, timeoutMs)
    try {
      proc = spawn(pythonCmd, ['-c', script], { shell: false })
    } catch (err) {
      clearTimeout(timeout)
      resolve({ ok: false, detail: err instanceof Error ? err.message : String(err) })
      return
    }
    let out = ''
    let err = ''
    proc.stdout?.on('data', (d: Buffer) => {
      out += d.toString()
    })
    proc.stderr?.on('data', (d: Buffer) => {
      err += d.toString()
    })
    proc.on('error', (e: Error) => {
      clearTimeout(timeout)
      resolve({ ok: false, detail: e.message })
    })
    proc.on('close', (code: number | null) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolve({ ok: true, detail: out.trim() || 'ok' })
      } else {
        resolve({ ok: false, detail: err.trim() || `exit code ${code}` })
      }
    })
  })
}

/** 检查网络连通性：fetch 带超时，能拿到 2xx 响应即视为健康 */
async function checkUrl(url: string): Promise<HealthCheckItem> {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) })
    return res.ok ? okItem(url, `HTTP ${res.status}`) : failItem(url, `HTTP ${res.status}`)
  } catch (err) {
    return failItem(url, err instanceof Error ? err.message : String(err))
  }
}

export class HealthService {
  /** 执行完整健康检查；platformUrl 为渲染层设置的云平台地址（可选） */
  async run(platformUrl?: string): Promise<HealthReport> {
    const userDataDir = getUserDataDir()
    const freeBytes = getDiskFreeBytes(userDataDir)
    const freeMB = freeBytes != null ? Math.round(freeBytes / 1024 / 1024) : null

    const environment: HealthCheckItem[] = [
      okItem(
        '操作系统',
        `${process.platform} ${process.arch}${process.getSystemVersion ? ` (${process.getSystemVersion()})` : ''}`,
      ),
      okItem(
        '运行时',
        `Electron ${process.versions.electron} / Node ${process.versions.node} / Chrome ${process.versions.chrome}`,
      ),
      freeMB == null
        ? failItem('磁盘可用空间', '无法获取')
        : freeMB > 100
          ? okItem('磁盘可用空间', `${freeMB} MB`)
          : failItem('磁盘可用空间', `${freeMB} MB（低于 100 MB 阈值）`),
    ]

    const aiHubOk = await aiHubService.healthCheck()
    const engine: HealthCheckItem[] = [
      aiHubOk ? okItem('AI Hub', `/api/chat/health 正常`) : failItem('AI Hub', '未运行或健康检查失败'),
    ]

    const pythonProbe = await probePython(
      `import sys, json; import openpyxl, yaml, jinja2; print(json.dumps({'version': sys.version.split()[0], 'modules': ['openpyxl','yaml','jinja2']}))`,
    )
    const dependencies: HealthCheckItem[] = [
      pythonProbe.ok ? okItem('Python 环境', pythonProbe.detail) : failItem('Python 环境', pythonProbe.detail),
    ]

    const updateSource = await checkUrl(UPDATE_SOURCE_URL)
    const network: HealthCheckItem[] = [updateSource]
    if (platformUrl) {
      const platform = await checkUrl(`${platformUrl.replace(/\/+$/, '')}/api/v1/health`)
      network.push(platform)
    }

    const all = [...environment, ...engine, ...network, ...dependencies]
    const report: HealthReport = {
      generatedAt: new Date().toISOString(),
      environment,
      engine,
      network,
      dependencies,
      summary: {
        total: all.length,
        ok: all.filter((i) => i.ok).length,
        failed: all.filter((i) => !i.ok).length,
      },
    }
    return report
  }
}

export const healthService = new HealthService()
