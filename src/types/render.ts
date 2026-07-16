// ============================================================
// 渲染相关类型 - 所有与配置渲染、标签打印相关的共享类型定义
// ============================================================

/** 输出格式 */
export type OutputFormat = 'device_name' | 'device_sn'

/** 渲染类型 */
export type RenderType = 'project' | 'yaml'

/** 渲染配置 */
export interface RenderConfig {
  outputFormat: OutputFormat
  renderType: RenderType
}

/** 渲染进度事件 */
export interface RenderProgressEvent {
  status: RenderStatus
  message: string
  progress?: number
  data?: unknown
}

/** 渲染状态 */
export type RenderStatus =
  | 'start' // 开始
  | 'info' // 信息
  | 'log' // 日志
  | 'progress' // 进度
  | 'success' // 成功
  | 'complete' // 完成
  | 'error' // 错误

/** 标签打印配置 */
export interface LabelPrintConfig {
  format: 'A4' | 'A5' | 'custom'
  orientation: 'portrait' | 'landscape'
  labelsPerPage: number
  labelSize: {
    width: number
    height: number
  }
  margins: {
    top: number
    bottom: number
    left: number
    right: number
  }
}

/** 默认标签打印配置 */
export const DEFAULT_LABEL_CONFIG: LabelPrintConfig = {
  format: 'A4',
  orientation: 'portrait',
  labelsPerPage: 8,
  labelSize: { width: 90, height: 60 },
  margins: { top: 10, bottom: 10, left: 10, right: 10 },
}

/** 标签打印参数（透传给 Python 后端） */
export interface LabelPrintParams {
  ids: string[]
  config: LabelPrintConfig
}

/** 渲染结果摘要 */
export interface RenderSummary {
  success: boolean
  projectId: string
  outputPath?: string
  filesGenerated?: number
  duration?: number
  errors: string[]
}

/** 删除操作类型 */
export type DeleteTarget = 'output' | 'output-sn' | 'yaml' | 'yaml-sn'

/** 渲染错误分类 */

/** Dry-run 单设备结果 */
export interface DryRunDeviceResult {
  project: string
  device: string
  role: string
  filename: string
  content: string
}

/** Dry-run 响应 */
export interface DryRunResponse {
  results: DryRunDeviceResult[]
}

/** 校验结果 */
export interface ValidationError {
  file: string
  line: number
  message: string
}

export interface ValidationWarning {
  type: string
  file?: string
  sheet?: string
  message: string
}

export interface ValidationResult {
  project: string
  status: 'pass' | 'fail' | 'warn'
  message: string
  errors?: ValidationError[]
  warnings?: ValidationWarning[]
}

export interface RenderError {
  code: RenderErrorCode
  message: string
  details?: string
  line?: number // 模板行号
  column?: number // 模板列号
  file?: string // 出错文件
}

export type RenderErrorCode =
  | 'TEMPLATE_SYNTAX_ERROR' // Jinja2 模板语法错误
  | 'EXCEL_PARSE_ERROR' // Excel 解析错误
  | 'EXCEL_MISSING_SHEET' // Excel 缺少必要 Sheet
  | 'EXCEL_EMPTY_DATA' // Excel 数据为空
  | 'PYTHON_EXECUTION_ERROR' // Python 执行错误
  | 'FILE_WRITE_ERROR' // 文件写入错误
  | 'PROJECT_NOT_FOUND' // 项目不存在
  | 'UNKNOWN_ERROR' // 未知错误
