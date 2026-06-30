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
 */
export function getWorkspaceDir(): string {
  const devPath = path.join(process.cwd(), 'workspace')
  if (fs.existsSync(devPath)) return devPath
  return path.join(process.resourcesPath, 'workspace')
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
    CURRENT: '2.2.0',
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