/**
 * Python 环境检测服务
 * 检测 Python 是否安装并可用
 */

import { exec } from 'child_process'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { getBackendDir, APP_CONFIG } from '../config'

export interface PythonEnvInfo {
  available: boolean
  version: string | null
  path: string | null
  minVersion: string
  isCompatible: boolean
  error: string | null
}

/**
 * 检测 Python 环境
 * @returns Python 环境信息
 */
export async function checkPythonEnv(): Promise<PythonEnvInfo> {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
  const minVersion = APP_CONFIG.VERSION.MIN_SUPPORTED_PYTHON

  try {
    // 执行 python --version 命令
    const version = await executeCommand(`${pythonCmd} --version`)

    // 解析版本号
    const versionMatch = version.match(/Python\s+(\d+\.\d+\.\d+)/i)
    const parsedVersion = versionMatch ? versionMatch[1] : null

    // 检查版本是否兼容
    const isCompatible = parsedVersion ? compareVersions(parsedVersion, minVersion) >= 0 : false

    // 获取 Python 路径
    const pythonPath = await executeCommand(`${pythonCmd} -c "import sys; print(sys.executable)"`)

    return {
      available: true,
      version: parsedVersion,
      path: pythonPath.trim(),
      minVersion,
      isCompatible,
      error: isCompatible ? null : `Python 版本过低，需要 ${minVersion} 或更高版本`,
    }
  } catch (error) {
    return {
      available: false,
      version: null,
      path: null,
      minVersion,
      isCompatible: false,
      error: '未检测到 Python 环境，请先安装 Python',
    }
  }
}

/**
 * 检测 Python 脚本是否存在
 * @returns 脚本是否存在
 */
export function checkPythonScript(): { exists: boolean; path: string | null; error: string | null } {
  const backendDir = getBackendDir()
  const scriptPath = path.join(backendDir, 'main.py')

  if (fs.existsSync(scriptPath)) {
    return { exists: true, path: scriptPath, error: null }
  }

  return { exists: false, path: null, error: `未找到 Python 脚本: ${scriptPath}` }
}

/**
 * 检测 Python 依赖是否安装
 * @returns 依赖检测结果
 */
export async function checkPythonDependencies(): Promise<{
  installed: string[]
  missing: string[]
  error: string | null
}> {
  const requiredPackages = ['jinja2', 'openpyxl', 'xlsxwriter']
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'

  try {
    const result = await executeCommand(
      `${pythonCmd} -c "import pkg_resources; print([pkg.key for pkg in pkg_resources.working_set])"`,
    )

    const installedPackages = JSON.parse(result.replace(/'/g, '"'))

    const installed: string[] = []
    const missing: string[] = []

    for (const pkg of requiredPackages) {
      if (installedPackages.includes(pkg)) {
        installed.push(pkg)
      } else {
        missing.push(pkg)
      }
    }

    return {
      installed,
      missing,
      error: missing.length > 0 ? `缺少依赖包: ${missing.join(', ')}` : null,
    }
  } catch {
    return {
      installed: [],
      missing: requiredPackages,
      error: '无法检测 Python 依赖，请手动检查',
    }
  }
}

/**
 * 执行命令并返回输出
 * @param command 命令字符串
 * @returns 命令输出
 */
function executeCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { encoding: 'utf-8', timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        reject(error)
      } else {
        resolve(stdout || stderr)
      }
    })
  })
}

/**
 * 比较版本号
 * @param v1 版本1
 * @param v2 版本2
 * @returns 比较结果（正数表示 v1 > v2）
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0
    const p2 = parts2[i] || 0
    if (p1 !== p2) return p1 - p2
  }

  return 0
}

/**
 * 完整的环境检测
 * @returns 环境检测结果
 */
export async function fullEnvironmentCheck(): Promise<{
  python: PythonEnvInfo
  script: { exists: boolean; path: string | null; error: string | null }
  dependencies: { installed: string[]; missing: string[]; error: string | null }
  ready: boolean
  errors: string[]
}> {
  const python = await checkPythonEnv()
  const script = checkPythonScript()
  const dependencies = await checkPythonDependencies()

  const errors: string[] = []

  if (!python.available) {
    errors.push(python.error || 'Python 环境不可用')
  } else if (!python.isCompatible) {
    errors.push(python.error || 'Python 版本不兼容')
  }

  if (!script.exists) {
    errors.push(script.error || 'Python 脚本不存在')
  }

  if (dependencies.missing.length > 0) {
    errors.push(dependencies.error || '缺少依赖包')
  }

  return {
    python,
    script,
    dependencies,
    ready: errors.length === 0,
    errors,
  }
}
