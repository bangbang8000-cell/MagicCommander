// ============================================================
// 编辑器相关类型 - 所有与编辑器、Tab 操作相关的共享类型定义
// ============================================================

/** 编辑器文件类型 */
export type FileType = 'excel' | 'yaml' | 'template' | 'output' | 'word' | 'text'

/** 编辑器 Tab 持久化元信息（不含内容与脏状态） */
export interface EditorTabMeta {
  tabId: string
  filePath: string
  fileType: FileType
  projectId: number
  title: string
  projectName: string
}

/** 编辑器 Tab 信息 */
export interface EditorTab {
  id: string
  title: string
  filePath: string
  fileType: FileType
  projectId: number
  projectName: string
  isDirty: boolean
  content?: unknown
}

/** Excel 工作表 */
export interface ExcelSheet {
  name: string
  headers: string[]
  rows: Record<string, unknown>[]
}

/** Excel 文件数据 */
export interface ExcelData {
  sheets: ExcelSheet[]
  filePath: string
}

/** 分屏模式 */
export type SplitMode = 'none' | 'horizontal' | 'vertical'

/** Monaco 编辑器语言类型 */
export type MonacoLanguage =
  | 'yaml'
  | 'jinja2'
  | 'plaintext'
  | 'ini'
  | 'json'
  | 'javascript'
  | 'python'
  | 'xml'
  | 'html'
  | 'css'
  | 'text'
  | 'markdown'

/** 根据文件扩展名获取语言 */
export function getLanguageFromExt(ext: string): MonacoLanguage {
  const map: Record<string, MonacoLanguage> = {
    yaml: 'yaml',
    yml: 'yaml',
    j2: 'jinja2',
    md: 'markdown',
    markdown: 'markdown',
    conf: 'ini',
    cfg: 'ini',
    json: 'json',
    js: 'javascript',
    ts: 'javascript',
    py: 'python',
    xml: 'xml',
    html: 'html',
    css: 'css',
    txt: 'plaintext',
    doc: 'plaintext',
    docx: 'plaintext',
    xls: 'plaintext',
    xlsx: 'plaintext',
  }
  return map[ext.toLowerCase()] ?? 'plaintext'
}

/** 根据文件路径获取编辑器类型 */
export function getFileTypeFromPath(filePath: string): FileType {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const typeMap: Record<string, FileType> = {
    yaml: 'yaml',
    yml: 'yaml',
    j2: 'template',
    md: 'text',
    markdown: 'text',
    doc: 'word',
    docx: 'word',
    xls: 'excel',
    xlsx: 'excel',
    txt: 'text',
    cfg: 'text',
    conf: 'text',
    json: 'text',
    js: 'text',
    ts: 'text',
    py: 'text',
    xml: 'text',
    html: 'text',
    css: 'text',
  }
  return typeMap[ext] ?? 'output'
}

/** 根据文件类型获取 Monaco 语言（不包含 word/excel，返回 plaintext） */
export function getMonacoLanguage(fileType: FileType): MonacoLanguage {
  if (fileType === 'yaml') return 'yaml'
  if (fileType === 'template') return 'jinja2'
  return 'plaintext'
}
