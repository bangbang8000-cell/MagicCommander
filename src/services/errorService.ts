/**
 * 错误处理中间层
 * 统一捕获和转换错误，提供用户友好的错误提示
 */

// 错误类型定义
export enum ErrorType {
  // 文件相关错误
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_ACCESS_DENIED = 'FILE_ACCESS_DENIED',
  FILE_TYPE_NOT_ALLOWED = 'FILE_TYPE_NOT_ALLOWED',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  FILE_PATH_INVALID = 'FILE_PATH_INVALID',
  
  // 项目相关错误
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  PROJECT_ALREADY_EXISTS = 'PROJECT_ALREADY_EXISTS',
  PROJECT_NAME_INVALID = 'PROJECT_NAME_INVALID',
  
  // Python 相关错误
  PYTHON_NOT_FOUND = 'PYTHON_NOT_FOUND',
  PYTHON_EXECUTION_FAILED = 'PYTHON_EXECUTION_FAILED',
  PYTHON_SCRIPT_ERROR = 'PYTHON_SCRIPT_ERROR',
  
  // 渲染相关错误
  RENDER_FAILED = 'RENDER_FAILED',
  RENDER_TEMPLATE_ERROR = 'RENDER_TEMPLATE_ERROR',
  RENDER_EXCEL_ERROR = 'RENDER_EXCEL_ERROR',
  
  // 安全相关错误
  SECURITY_PATH_VIOLATION = 'SECURITY_PATH_VIOLATION',
  SECURITY_INPUT_INVALID = 'SECURITY_INPUT_INVALID',
  
  // 通用错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

// 用户友好的错误消息映射
const ERROR_MESSAGES: Record<ErrorType, string> = {
  [ErrorType.FILE_NOT_FOUND]: '文件不存在，请检查文件路径是否正确',
  [ErrorType.FILE_ACCESS_DENIED]: '无法访问该文件，请检查文件权限',
  [ErrorType.FILE_TYPE_NOT_ALLOWED]: '不支持该文件类型，仅支持文本、Excel、Word 等格式',
  [ErrorType.FILE_TOO_LARGE]: '文件过大，请选择较小的文件（最大 10MB）',
  [ErrorType.FILE_PATH_INVALID]: '文件路径无效，请使用正确的路径格式',
  
  [ErrorType.PROJECT_NOT_FOUND]: '项目不存在，请先创建项目',
  [ErrorType.PROJECT_ALREADY_EXISTS]: '项目已存在，请使用其他名称',
  [ErrorType.PROJECT_NAME_INVALID]: '项目名无效，请使用合法的名称（不含特殊字符）',
  
  [ErrorType.PYTHON_NOT_FOUND]: '未检测到 Python 环境，请先安装 Python 3.8+',
  [ErrorType.PYTHON_EXECUTION_FAILED]: 'Python 执行失败，请检查 Python 安装是否正确',
  [ErrorType.PYTHON_SCRIPT_ERROR]: '脚本执行出错，请检查模板和参数是否正确',
  
  [ErrorType.RENDER_FAILED]: '配置渲染失败，请检查模板和参数表',
  [ErrorType.RENDER_TEMPLATE_ERROR]: '模板解析错误，请检查 Jinja2 模板语法',
  [ErrorType.RENDER_EXCEL_ERROR]: '参数表读取错误，请检查 Excel 文件格式',
  
  [ErrorType.SECURITY_PATH_VIOLATION]: '访问路径不安全，请使用项目目录内的文件',
  [ErrorType.SECURITY_INPUT_INVALID]: '输入内容不合法，请检查输入格式',
  
  [ErrorType.UNKNOWN_ERROR]: '发生未知错误，请稍后重试',
  [ErrorType.NETWORK_ERROR]: '网络连接失败，请检查网络设置',
}

/**
 * 解析原始错误，转换为标准错误类型
 * @param error 原始错误对象或消息
 * @returns 标准错误类型
 */
export function parseError(error: Error | string | unknown): ErrorType {
  const message = typeof error === 'string' ? error : (error as Error)?.message || ''
  
  // 文件相关错误
  if (message.includes('文件不存在') || message.includes('ENOENT') || message.includes('not found')) {
    return ErrorType.FILE_NOT_FOUND
  }
  if (message.includes('无法访问') || message.includes('EACCES') || message.includes('permission denied')) {
    return ErrorType.FILE_ACCESS_DENIED
  }
  if (message.includes('不支持该文件类型') || message.includes('仅支持')) {
    return ErrorType.FILE_TYPE_NOT_ALLOWED
  }
  if (message.includes('文件过大') || message.includes('too large')) {
    return ErrorType.FILE_TOO_LARGE
  }
  if (message.includes('文件路径无效') || message.includes('路径不安全')) {
    return ErrorType.FILE_PATH_INVALID
  }
  
  // 项目相关错误
  if (message.includes('未找到项目') || message.includes('项目不存在')) {
    return ErrorType.PROJECT_NOT_FOUND
  }
  if (message.includes('项目已存在')) {
    return ErrorType.PROJECT_ALREADY_EXISTS
  }
  if (message.includes('项目名无效') || message.includes('项目名不能')) {
    return ErrorType.PROJECT_NAME_INVALID
  }
  
  // Python 相关错误
  if (message.includes('未检测到 Python') || message.includes('无法启动 Python') || message.includes('未找到 Python')) {
    return ErrorType.PYTHON_NOT_FOUND
  }
  if (message.includes('Python 执行失败') || message.includes('Python 环境检测失败')) {
    return ErrorType.PYTHON_EXECUTION_FAILED
  }
  if (message.includes('脚本执行出错') || message.includes('Python 脚本')) {
    return ErrorType.PYTHON_SCRIPT_ERROR
  }
  
  // 渲染相关错误
  if (message.includes('渲染失败') || message.includes('配置渲染')) {
    return ErrorType.RENDER_FAILED
  }
  if (message.includes('模板') || message.includes('Jinja2')) {
    return ErrorType.RENDER_TEMPLATE_ERROR
  }
  if (message.includes('Excel') || message.includes('参数表')) {
    return ErrorType.RENDER_EXCEL_ERROR
  }
  
  // 安全相关错误
  if (message.includes('不安全') || message.includes('路径不安全')) {
    return ErrorType.SECURITY_PATH_VIOLATION
  }
  if (message.includes('不合法') || message.includes('无效')) {
    return ErrorType.SECURITY_INPUT_INVALID
  }
  
  return ErrorType.UNKNOWN_ERROR
}

/**
 * 获取用户友好的错误消息
 * @param errorType 错误类型
 * @returns 用户友好的错误消息
 */
export function getFriendlyMessage(errorType: ErrorType): string {
  return ERROR_MESSAGES[errorType] || ERROR_MESSAGES[ErrorType.UNKNOWN_ERROR]
}

/**
 * 处理错误并返回用户友好的消息
 * @param error 原始错误
 * @returns 用户友好的错误消息
 */
export function handleFriendlyError(error: Error | string | unknown): string {
  const errorType = parseError(error)
  return getFriendlyMessage(errorType)
}

/**
 * 标准化 IPC 响应结构
 * @param success 是否成功
 * @param data 数据（成功时）
 * @param error 错误信息（失败时）
 */
export interface IpcResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  errorType?: ErrorType
}

/**
 * 创建成功的 IPC 响应
 * @param data 数据
 * @returns 成功响应
 */
export function successResponse<T>(data: T): IpcResponse<T> {
  return { success: true, data }
}

/**
 * 创建失败的 IPC 响应
 * @param error 原始错误
 * @returns 失败响应
 */
export function errorResponse(error: Error | string | unknown): IpcResponse {
  const errorType = parseError(error)
  const friendlyMessage = getFriendlyMessage(errorType)
  return { success: false, error: friendlyMessage, errorType }
}

/**
 * Toast 显示类型
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info'

/**
 * 显示 Toast 提示（供前端使用）
 * @param message 消息内容
 * @param type 提示类型
 */
export function showToast(message: string, type: ToastType = 'info'): void {
  // 通过 UI Store 显示 Toast
  // 实际实现需要在前端组件中调用
  console.log(`[Toast ${type}] ${message}`)
}

/**
 * 显示错误 Toast
 * @param error 原始错误
 */
export function showErrorToast(error: Error | string | unknown): void {
  const friendlyMessage = handleFriendlyError(error)
  showToast(friendlyMessage, 'error')
}