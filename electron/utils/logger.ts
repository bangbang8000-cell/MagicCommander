/**
 * 日志服务
 * 统一管理日志输出，支持条件化日志和持久化
 */

import * as fs from 'fs'
import * as path from 'path'
import { getLogDir, isDev } from '../config'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  data?: unknown
}

class Logger {
  private logFile: string
  private enabled: boolean

  constructor() {
    this.logFile = path.join(getLogDir(), 'app.log')
    this.enabled = isDev
  }

  /**
   * 格式化日志条目
   */
  private formatEntry(level: LogLevel, message: string, data?: unknown): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    }
  }

  /**
   * 写入日志文件
   */
  private writeToFile(entry: LogEntry): void {
    try {
      const line = JSON.stringify(entry) + '\n'
      fs.appendFileSync(this.logFile, line, 'utf-8')
    } catch {
      // 忽略写入错误
    }
  }

  /**
   * 输出日志
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    const entry = this.formatEntry(level, message, data)

    // 开发环境输出到控制台
    if (this.enabled) {
      const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]`
      if (data) {
        console.log(prefix, message, data)
      } else {
        console.log(prefix, message)
      }
    }

    // 错误级别始终写入文件
    if (level === 'error' || level === 'warn') {
      this.writeToFile(entry)
    }
  }

  /**
   * 调试日志（仅开发环境）
   */
  debug(message: string, data?: unknown): void {
    if (this.enabled) {
      this.log('debug', message, data)
    }
  }

  /**
   * 信息日志
   */
  info(message: string, data?: unknown): void {
    this.log('info', message, data)
  }

  /**
   * 警告日志
   */
  warn(message: string, data?: unknown): void {
    this.log('warn', message, data)
  }

  /**
   * 错误日志
   */
  error(message: string, data?: unknown): void {
    this.log('error', message, data)
  }

  /**
   * 启用/禁用调试日志
   */
  setDebugEnabled(enabled: boolean): void {
    this.enabled = enabled
  }
}

// 导出单例
export const logger = new Logger()

// 便捷方法
export const logDebug = logger.debug.bind(logger)
export const logInfo = logger.info.bind(logger)
export const logWarn = logger.warn.bind(logger)
export const logError = logger.error.bind(logger)
