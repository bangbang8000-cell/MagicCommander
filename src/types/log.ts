// ============================================================
// 日志相关类型
// ============================================================

/** 日志级别 */
export type LogLevel = 'info' | 'warn' | 'error' | 'success' | 'debug'

/** 单条日志条目 */
export interface LogEntry {
  id: number
  timestamp: string
  level: LogLevel
  message: string
  source?: string
}

/** 日志面板过滤器 */
export interface LogFilter {
  levels: Set<LogLevel>
  searchText: string
}

/** 日志持久化配置 */
export interface LogPersistConfig {
  enabled: boolean
  maxFileSize: number // MB
  maxFiles: number
  logDir: string
}
