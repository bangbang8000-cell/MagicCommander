/**
 * 应用配置模块
 * 统一管理所有路径和配置常量
 */

import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

// 开发环境判断
export const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

/**
 * 获取后端目录路径（Python 代码所在目录）
 */
export function getBackendDir(): string {
  const devPath = path.join(process.cwd(), 'backend')
  if (fs.existsSync(devPath)) return devPath
  return path.join(process.resourcesPath, 'backend')
}

/**
 * 获取工作区目录路径（项目数据所在目录）
 * 生产环境使用用户数据目录，避免安装目录无写入权限
 */
export function getWorkspaceDir(): string {
  const devPath = path.join(process.cwd(), 'workspace')
  if (fs.existsSync(devPath)) return devPath
  return path.join(getUserDataDir(), 'workspace')
}

/**
 * 初始化工作区目录
 * 首次启动时将打包自带的示例项目复制到用户数据目录
 */
export function initializeWorkspace(): void {
  const workspaceDir = getWorkspaceDir()
  if (fs.existsSync(workspaceDir)) {
    return
  }

  fs.mkdirSync(workspaceDir, { recursive: true })

  // 生产环境：从安装目录的 resources/workspace 复制初始示例
  const bundledWorkspace = path.join(process.resourcesPath, 'workspace')
  if (fs.existsSync(bundledWorkspace)) {
    copyDirRecursive(bundledWorkspace, workspaceDir)
  }
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/**
 * 获取 Python 可执行文件路径
 * 生产环境优先使用打包的嵌入式 Python，开发环境回退到系统 Python
 */
export function getPythonPath(): string {
  // Windows 嵌入式 Python
  const winEmbedded = path.join(process.resourcesPath, 'python', 'python.exe')
  if (fs.existsSync(winEmbedded)) return winEmbedded

  // Linux/macOS 嵌入式 Python（常见路径）
  const unixEmbedded = path.join(process.resourcesPath, 'python', 'bin', 'python3')
  if (fs.existsSync(unixEmbedded)) return unixEmbedded

  const unixEmbedded2 = path.join(process.resourcesPath, 'python', 'bin', 'python')
  if (fs.existsSync(unixEmbedded2)) return unixEmbedded2

  // 回退到系统 Python
  return process.platform === 'win32' ? 'python' : 'python3'
}

/**
 * 获取嵌入式 Python 的 site-packages 目录
 * 支持 Windows / Linux / macOS 的不同目录结构
 */
export function getPythonSitePackages(): string {
  // Windows 嵌入式 Python
  const winPath = path.join(process.resourcesPath, 'python', 'Lib', 'site-packages')
  if (fs.existsSync(winPath)) return winPath

  // Linux/macOS：尝试扫描 lib 目录下的 python3.x/site-packages
  const libDir = path.join(process.resourcesPath, 'python', 'lib')
  if (fs.existsSync(libDir)) {
    const entries = fs.readdirSync(libDir)
    for (const entry of entries) {
      if (entry.startsWith('python3.')) {
        const spPath = path.join(libDir, entry, 'site-packages')
        if (fs.existsSync(spPath)) return spPath
      }
    }
    // 通用 site-packages 路径
    const genericPath = path.join(libDir, 'site-packages')
    if (fs.existsSync(genericPath)) return genericPath
  }

  // 回退到 Windows 默认路径（即使不存在）
  return winPath
}

/**
 * 获取用户数据目录路径
 */
export function getUserDataDir(): string {
  if (isDev) {
    const devDir = path.join(process.cwd(), '.electron-user-data')
    if (!fs.existsSync(devDir)) {
      fs.mkdirSync(devDir, { recursive: true })
    }
    return devDir
  }
  return app.getPath('userData')
}

/**
 * 获取缓存目录路径
 */
export function getCacheDir(): string {
  const cacheDir = path.join(getUserDataDir(), 'cache')
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

/**
 * 获取日志目录路径
 */
export function getLogDir(): string {
  const logDir = path.join(getUserDataDir(), 'logs')
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
  return logDir
}

/**
 * 获取崩溃日志目录路径
 */
export function getCrashDumpsDir(): string {
  const crashDir = path.join(getUserDataDir(), 'crashDumps')
  if (!fs.existsSync(crashDir)) {
    fs.mkdirSync(crashDir, { recursive: true })
  }
  return crashDir
}

/**
 * 应用配置常量
 */
export const APP_CONFIG = {
  // 应用名称
  APP_NAME: 'MagicCommander',
  
  // 窗口配置
  WINDOW: {
    WIDTH: 1400,
    HEIGHT: 900,
    MIN_WIDTH: 1100,
    MIN_HEIGHT: 700,
  },
  
  // 布局配置
  LAYOUT: {
    SIDEBAR_MIN: 400,
    SIDEBAR_DEFAULT: 800,
    BOTTOM_MIN: 180,
    BOTTOM_DEFAULT: 320,
  },
  
  // Python 配置
  PYTHON: {
    CMD: process.platform === 'win32' ? 'python' : 'python3',
    SCRIPT_NAME: 'pre_processing.py',
    ENCODING: 'utf-8',
    // 进程健康检查间隔（毫秒）
    HEALTH_CHECK_INTERVAL: 5000,
    // 进程重启最大尝试次数
    MAX_RESTART_ATTEMPTS: 3,
    // 进程重启间隔（毫秒）
    RESTART_INTERVAL: 1000,
  },
  
  // 文件配置
  FILE: {
    // 支持的文本文件扩展名
    TEXT_EXTENSIONS: ['.txt', '.yml', '.yaml', '.j2', '.jinja', '.jinja2', '.json', '.md', '.log'],
    // 支持的 Excel 文件扩展名
    EXCEL_EXTENSIONS: ['.xlsx', '.xls'],
    // 支持的 Word 文件扩展名
    WORD_EXTENSIONS: ['.docx'],
  },
  
  // 状态存储配置
  STORAGE: {
    PROJECT_STATE_KEY: 'mc-project-state',
    EDITOR_STATE_KEY: 'mc-editor-state',
    UI_STATE_KEY: 'mc-ui-state',
  },
  
  // 版本信息
  VERSION: {
    CURRENT: '2.9.7',
    MIN_SUPPORTED_PYTHON: '3.8',
  },
}

/**
 * 初始化应用目录
 */
export function initializeAppDirs(): void {
  const dirs = [
    getUserDataDir(),
    getCacheDir(),
    getLogDir(),
    getCrashDumpsDir(),
  ]
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }
  
  // 设置 Electron 路径
  app.setPath('userData', getUserDataDir())
  app.setPath('appData', getUserDataDir())
  app.setPath('cache', getCacheDir())
  app.setPath('crashDumps', getCrashDumpsDir())
}

/**
 * 获取项目目录路径
 * @param projectName 项目名称
 * @returns 项目完整路径
 */
export function getProjectDir(projectName: string): string {
  return path.join(getWorkspaceDir(), projectName)
}

/**
 * 获取项目模板目录
 * @param projectName 项目名称
 * @returns 模板目录路径
 */
export function getTemplatesDir(projectName: string): string {
  return path.join(getProjectDir(projectName), 'templates')
}

/**
 * 获取项目 Excel 目录
 * @param projectName 项目名称
 * @returns Excel 目录路径
 */
export function getExcelDir(projectName: string): string {
  return path.join(getProjectDir(projectName), 'excel')
}

/**
 * 获取项目输出目录
 * @param projectName 项目名称
 * @returns 输出目录路径
 */
export function getOutputDir(projectName: string): string {
  return path.join(getProjectDir(projectName), 'output')
}