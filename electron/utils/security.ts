/**
 * 安全工具模块
 * 提供路径校验、文件类型白名单、输入长度限制等安全功能
 */

import * as path from 'path'
import * as fs from 'fs'

// 配置常量
export const SECURITY_CONFIG = {
  // 项目名最大长度
  PROJECT_NAME_MAX_LENGTH: 100,
  // 文件名最大长度
  FILE_NAME_MAX_LENGTH: 255,
  // 文件路径最大长度
  FILE_PATH_MAX_LENGTH: 1024,
  // 文件内容最大长度（10MB）
  FILE_CONTENT_MAX_LENGTH: 10 * 1024 * 1024,
  
  // 允许的文件类型白名单
  ALLOWED_FILE_EXTENSIONS: [
    // 文本文件
    '.txt', '.log', '.md', '.json', '.yaml', '.yml',
    // 模板文件
    '.j2', '.jinja', '.jinja2',
    // Excel 文件
    '.xlsx', '.xls',
    // Word 文件
    '.docx',
    // 配置文件
    '.conf', '.cfg', '.ini',
    // 网络设备配置
    '.cfg', '.config',
  ],
  
  // 禁止访问的目录/文件名模式
  FORBIDDEN_PATH_PATTERNS: [
    '..',
    '~',
    '.env',
    '.git',
    '.ssh',
    'node_modules',
    'package.json',
    'package-lock.json',
  ],
}

/**
 * 转义 Python 命令参数，防止命令注入
 * @param arg 原始参数
 * @returns 转义后的安全参数
 */
export function escapePythonArg(arg: string): string {
  if (!arg || typeof arg !== 'string') return ''
  
  // 移除危险字符（Shell 元字符），保留空格（spawn 用数组传参，空格安全）
  const dangerousChars = ['$', '`', '\\', '\n', '\r', ';', '|', '&', '<', '>', '(', ')', '{', '}', '[', ']']
  let escaped = arg
  
  for (const char of dangerousChars) {
    escaped = escaped.replace(char, '')
  }
  
  // 允许字母、数字、下划线、连字符、点、空格、中文
  escaped = escaped.replace(/[^\w\-\u4e00-\u9fff\u3400-\u4dbf\s\.]/g, '_')
  
  // 限制长度
  if (escaped.length > SECURITY_CONFIG.PROJECT_NAME_MAX_LENGTH) {
    escaped = escaped.slice(0, SECURITY_CONFIG.PROJECT_NAME_MAX_LENGTH)
  }
  
  return escaped.trim()
}

/**
 * 校验路径是否在允许范围内（项目目录内）
 * @param fullPath 完整路径
 * @param allowedBaseDir 允许的基础目录
 * @returns 是否安全
 */
export function isPathSafe(fullPath: string, allowedBaseDir: string): boolean {
  if (!fullPath || !allowedBaseDir) return false
  
  try {
    // 规范化路径
    const normalizedPath = path.normalize(fullPath)
    const normalizedBase = path.normalize(allowedBaseDir)
    
    // 检查路径长度
    if (normalizedPath.length > SECURITY_CONFIG.FILE_PATH_MAX_LENGTH) {
      return false
    }
    
    // 检查禁止的模式
    for (const pattern of SECURITY_CONFIG.FORBIDDEN_PATH_PATTERNS) {
      if (normalizedPath.includes(pattern)) {
        return false
      }
    }
    
    // 检查是否在允许的基础目录内
    const relativePath = path.relative(normalizedBase, normalizedPath)
    
    // 如果相对路径以 .. 开头，说明路径在基础目录外
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return false
    }
    
    return true
  } catch {
    return false
  }
}

/**
 * 校验文件类型是否在白名单内
 * @param filePath 文件路径
 * @returns 是否允许
 */
export function isFileTypeAllowed(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false
  
  const ext = path.extname(filePath).toLowerCase()
  
  // 无扩展名的文件不允许
  if (!ext) return false
  
  return SECURITY_CONFIG.ALLOWED_FILE_EXTENSIONS.includes(ext)
}

/**
 * 校验项目名称
 * @param name 项目名称
 * @returns 校验结果 { valid, error }
 */
export function validateProjectName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: '项目名不能为空' }
  }
  
  const trimmed = name.trim()
  
  if (trimmed.length === 0) {
    return { valid: false, error: '项目名不能为空' }
  }
  
  if (trimmed.length > SECURITY_CONFIG.PROJECT_NAME_MAX_LENGTH) {
    return { valid: false, error: `项目名长度不能超过 ${SECURITY_CONFIG.PROJECT_NAME_MAX_LENGTH} 个字符` }
  }
  
  // 检查非法字符
  const invalidChars = /[\\/:*?"<>|]/
  if (invalidChars.test(trimmed)) {
    return { valid: false, error: '项目名不能包含 \\ / : * ? " < > |' }
  }
  
  // 检查禁止的模式
  for (const pattern of SECURITY_CONFIG.FORBIDDEN_PATH_PATTERNS) {
    if (trimmed.toLowerCase().includes(pattern.toLowerCase())) {
      return { valid: false, error: `项目名不能包含 "${pattern}"` }
    }
  }
  
  return { valid: true }
}

/**
 * 校验文件路径
 * @param filePath 文件路径
 * @returns 校验结果 { valid, error }
 */
export function validateFilePath(filePath: string): { valid: boolean; error?: string } {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: '文件路径不能为空' }
  }
  
  if (filePath.length > SECURITY_CONFIG.FILE_PATH_MAX_LENGTH) {
    return { valid: false, error: `文件路径长度不能超过 ${SECURITY_CONFIG.FILE_PATH_MAX_LENGTH} 个字符` }
  }
  
  // 检查禁止的模式
  for (const pattern of SECURITY_CONFIG.FORBIDDEN_PATH_PATTERNS) {
    if (filePath.includes(pattern)) {
      return { valid: false, error: `文件路径不能包含 "${pattern}"` }
    }
  }
  
  return { valid: true }
}

/**
 * 校验文件内容长度
 * @param content 文件内容
 * @returns 校验结果 { valid, error }
 */
export function validateFileContent(content: string): { valid: boolean; error?: string } {
  if (!content || typeof content !== 'string') {
    return { valid: true } // 空内容允许
  }
  
  if (content.length > SECURITY_CONFIG.FILE_CONTENT_MAX_LENGTH) {
    return { valid: false, error: `文件内容大小不能超过 ${SECURITY_CONFIG.FILE_CONTENT_MAX_LENGTH / 1024 / 1024}MB` }
  }
  
  return { valid: true }
}

/**
 * 构建安全的完整路径
 * @param baseDir 基础目录
 * @param relativePath 相对路径
 * @returns 安全的完整路径或 null（如果不安全）
 */
export function buildSafePath(baseDir: string, relativePath: string): string | null {
  if (!baseDir || !relativePath) return null
  
  // 先校验相对路径
  const validation = validateFilePath(relativePath)
  if (!validation.valid) return null
  
  // 构建完整路径
  const fullPath = path.join(baseDir, relativePath)
  
  // 校验完整路径是否在允许范围内
  if (!isPathSafe(fullPath, baseDir)) return null
  
  return fullPath
}

/**
 * 检查文件是否存在且可读
 * @param filePath 文件路径
 * @returns 是否存在且可读
 */
export function isFileAccessible(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false
    const stats = fs.statSync(filePath)
    return stats.isFile()
  } catch {
    return false
  }
}