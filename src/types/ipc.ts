import type { TemplateInfo, TemplateMeta, WorkspaceIndex } from './project'
import type { ExcelSheet } from './editor'

// ============================================================
// IPC 协议类型 - 所有 IPC 消息的请求 / 响应 / 事件类型
// ============================================================

/** 项目文件树节点 */
export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileTreeNode[]
}

// ============================================================
// 通用类型
// ============================================================

/** 标准 IPC 错误响应 */
export interface IpcError {
  code: string
  message: string
  details?: string
}

/** 标准 IPC 成功响应 */
export interface IpcSuccess<T = unknown> {
  status: 'success'
  data?: T
  message?: string
}

/** IPC 操作结果（联合类型） */
export type IpcResult<T = unknown> = IpcSuccess<T> | IpcError

// ============================================================
// Electron 全局 API 类型声明
// ============================================================

export interface PlanIpcApi {
  import: (planJson: string, projectDir: string) => Promise<void>
  analyze: (projectDir: string) => Promise<unknown>
}

export interface ElectronAPI {
  project: ProjectIpcApi
  plan: PlanIpcApi
  render: RenderIpcApi
  delete: DeleteIpcApi
  feature: FeatureIpcApi
  guide: GuideIpcApi
  file: FileIpcApi
  dialog: DialogIpcApi
  app: AppIpcApi
  log: LogIpcApi
  shell: { showItemInFolder: (path: string) => Promise<void> }
  aihub: AIHubIpcApi
  window: WindowIpcApi
  platform: PlatformIpcApi
  onMenuNewProject: (callback: () => void) => () => void
  versions: {
    node: string
    electron: string
    chrome: string
    platform: string
    arch: string
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}

// ============================================================
// Project API
// ============================================================

export interface ProjectIpcApi {
  list: () => Promise<Array<{ id: number; name: string; index: number }>>
  listExamples: () => Promise<string[]>
  listTemplates: () => Promise<TemplateInfo[]>
  analyzeTemplate: (templateId: string) => Promise<unknown>
  getTemplate: (id: string) => Promise<TemplateInfo>
  create: (name: string, options?: { template?: string; empty?: boolean }) => Promise<void>
  saveAsExample: (projectName: string, exampleName: string) => Promise<void>
  saveAsTemplate: (projectName: string, templateName: string, meta: Partial<TemplateMeta>) => Promise<void>
  updateTemplateMeta: (id: string, meta: Partial<TemplateMeta>) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  readTemplateFile: (templateId: string, filePath: string) => Promise<string>
  readTemplateExcel: (
    templateId: string,
    filePath: string,
  ) => Promise<{ name: string; headers: string[]; rows: Record<string, unknown>[] }[]>
  getWorkspaceIndex: () => Promise<WorkspaceIndex>
  analyze: (id: string) => Promise<ProjectAnalysisReport>
  proofread: (id: string) => Promise<ProjectProofreadReport>
  listSnippets: () => Promise<SnippetInfo[]>
  getSnippet: (file: string) => Promise<string>
  saveSnippet: (data: {
    name: string
    content: string
    description?: string
    category?: string
  }) => Promise<{ file: string }>
  deleteSnippet: (file: string) => Promise<void>
  templatePreview: (
    projectId: string,
    templatePath: string,
  ) => Promise<{ results: Array<{ project: string; device: string; content: string }> }>
  templateHistory: (projectId: number, templatePath: string) => Promise<TemplateVersion[]>
  templateSnapshot: (projectId: number, templatePath: string, note?: string) => Promise<TemplateVersion[]>
  templateRestore: (projectId: number, templatePath: string, version: string) => Promise<void>
  delete: (ids: string[]) => Promise<void>
  getStructure: (name: string) => Promise<FileTreeNode[]>
  info: (id: string) => Promise<ProjectInfoDetail>
  parameters: (id: string) => Promise<Array<{ file: string; path: string }>>
  readExcel: (id: number, filePath: string, projectName?: string) => Promise<ExcelSheet[]>
  writeExcel: (id: number, filePath: string, sheets: ExcelSheet[], projectName?: string) => Promise<void>
  readFile: (id: number, filePath: string, projectName?: string) => Promise<string>
  writeFile: (id: number, filePath: string, content: string, projectName?: string) => Promise<void>
  readDocx: (id: number, filePath: string, projectName?: string) => Promise<string>
  readDocxBuffer: (id: number, filePath: string, projectName?: string) => Promise<ArrayBuffer>
  listFiles: (id: string, fileType?: string) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>
  installRemoteTemplate: (data: { name: string; zipData: string; owner: string }) => Promise<void>
  getLocalSha: (projectName: string) => Promise<string | null>
  collectProjectFiles: (projectName: string) => Promise<{ path: string; content: string }[]>
  installRemoteProject: (data: { name: string; zipData: string; owner: string }) => Promise<void>
  batchGetLocalSha: (projectNames: string[]) => Promise<Record<string, string | null>>
}

/** 项目信息详情（来自后端 project info 命令） */
export interface ProjectInfoDetail {
  id: number
  name: string
  path: string
  exists: boolean
  structure: {
    excel: boolean
    templates: boolean
    para: boolean
    output: boolean
    yaml: boolean
  }
}

/** 模板片段信息（workspace/snippets） */
export interface SnippetInfo {
  name: string
  file: string
  description: string
  category: string
}

/** 模板历史版本 */
export interface TemplateVersion {
  version: string
  timestamp: string
  note: string
  file: string
  templatePath: string
}

/** 项目智能校对报告（来自后端 proofread project） */
export interface ProjectProofreadReport {
  status: string
  project: string
  issues: Array<{
    level: 'error' | 'warning'
    type: 'syntax' | 'missing_column' | 'empty_value'
    template?: string
    column?: string
    sheet?: string
    device?: string
    message: string
  }>
  summary: { total: number; errors: number; warnings: number }
}

/** 项目依赖分析报告（来自后端 analyze project，模板 ↔ Excel 列反向索引） */
export interface ProjectAnalysisReport {
  status: string
  project: string
  templates: Array<{
    file: string
    variables: string[]
    unique_vars: number
    complexity: number
    suggestions: Array<{ level: 'warning' | 'info'; message: string }>
  }>
  excel_files: unknown[]
  dependencies: {
    /** 每个模板引用的列 */
    template_columns: Record<string, string[]>
    /** 每列被哪些模板引用（反向索引） */
    column_templates: Record<string, string[]>
    /** 模板引用列来自哪些 Excel 表 */
    template_excel_sheets: Record<string, string[]>
    /** 未被任何模板引用的列（按 文件 / sheet） */
    unused_columns_by_sheet: Record<string, string[]>
  }
  cross_reference?: {
    missing_by_template?: Record<string, string[]>
    template_vars_missing_in_excel?: string[]
    excel_columns_unused_in_templates?: Record<string, string[]>
  }
  summary: { total_suggestions: number; warnings: number; infos: number }
}

// ============================================================
// Render API
// ============================================================

export interface RenderIpcApi {
  project: (ids: string[]) => Promise<void>
  yaml: (ids: string[]) => Promise<void>
  projectSn: (ids: string[]) => Promise<void>
  yamlSn: (ids: string[]) => Promise<void>
  undo: (ids: string[]) => Promise<void>
  dryRun: (ids: string[], format?: 'device_name' | 'device_sn') => Promise<unknown>
  validateTemplate: (ids: string[]) => Promise<unknown>
  validateExcel: (ids: string[]) => Promise<unknown>
  diffCompare: (project: string, device: string, content: string, format: string) => Promise<unknown>
  onProgress: (callback: (data: unknown) => void) => () => void
}

// ============================================================
// Delete API
// ============================================================

export interface DeleteIpcApi {
  output: (ids: string[]) => Promise<void>
  outputSn: (ids: string[]) => Promise<void>
  yaml: (ids: string[]) => Promise<void>
  yamlSn: (ids: string[]) => Promise<void>
}

// ============================================================
// Feature API
// ============================================================

export interface FeatureIpcApi {
  labelPrint: (ids: string[], config?: unknown) => Promise<void>
  labelMarkdown: (ids: string[], config?: unknown) => Promise<void>
  labelPdf: (ids: string[], config?: unknown) => Promise<string[]>
  labelDelete: (ids: string[]) => Promise<void>
}

// ============================================================
// Guide API
// ============================================================

export interface GuideIpcApi {
  getContent: (lang: string) => Promise<string>
}

// ============================================================
// File API
// ============================================================

export interface FileIpcApi {
  read: (filePath: string) => Promise<string>
  write: (filePath: string, content: string) => Promise<void>
  readExcel: (filePath: string, sheet?: string) => Promise<unknown>
  readDocx: (filePath: string) => Promise<string>
  exists: (filePath: string) => Promise<boolean>
}

// ============================================================
// Dialog API
// ============================================================

export interface DialogIpcApi {
  openFile: (options?: unknown) => Promise<unknown>
  saveFile: (options?: unknown) => Promise<unknown>
  showMessage: (options: { type: 'info' | 'warning' | 'error'; title: string; message: string }) => Promise<void>
  showConfirm: (options: { title: string; message: string }) => Promise<boolean>
}

// ============================================================
// App API
// ============================================================

export type UpdateStatus =
  | { status: 'checking' }
  | { status: 'available'; version?: string; releaseNotes?: string | string[] }
  | { status: 'not-available' }
  | { status: 'downloading'; progress?: number; transferred?: number; total?: number }
  | { status: 'downloaded' }
  | { status: 'error'; error?: string }

export interface AppIpcApi {
  getVersion: () => Promise<string>
  getBuildInfo: () => Promise<{ version: string; build: string; displayVersion: string }>
  getPath: (name: 'home' | 'appData' | 'userData' | 'backend' | 'workspace') => Promise<string>
  checkUpdate: () => Promise<void>
  downloadUpdate: () => Promise<void>
  quitAndInstall: () => Promise<void>
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void
  getLanguage: () => Promise<string>
  setLanguage: (lang: string) => Promise<void>
  onLanguageChange: (callback: (lang: string) => void) => () => void
  /** 备份 AI 配置到 userData 目录 */
  backupAiConfig: (config: unknown) => Promise<void>
  /** 从 userData 目录恢复 AI 配置 */
  restoreAiConfig: () => Promise<unknown>
}

// ============================================================
// Log API
// ============================================================

export interface LogIpcApi {
  onOutput: (callback: (data: { level: string; message: string; source?: string }) => void) => () => void
  write: (level: string, message: string) => Promise<void>
}

// ============================================================
// Window API
// ============================================================

export interface WindowIpcApi {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximizeChange: (callback: (maximized: boolean) => void) => () => void
}

// ============================================================
// AI Hub API
// ============================================================

export interface AIHubStatus {
  running: boolean
  port: number
  lastError?: string
  startTime?: number
  installing?: boolean
}

export interface AIHubProvider {
  key: string
  name: string
  model: string
  models: string[]
  enabled: boolean
  is_default: boolean
}

export interface AIHubAttachment {
  id: string
  name: string
  type: string
  path: string
  size: number
}

export interface AIHubStreamData {
  sessionId: string
  chunk: string
}

export interface AIHubIpcApi {
  start: () => Promise<void>
  stop: () => Promise<void>
  status: () => Promise<AIHubStatus>
  health: () => Promise<boolean>
  chat: (
    sessionId: string,
    message: string,
    mode?: string,
    provider?: string,
    attachments?: AIHubAttachment[],
    autonomyMode?: 'advisor' | 'semi_auto' | 'full_auto',
    projectName?: string,
  ) => Promise<string>
  clearSession: (sessionId: string) => Promise<void>
  getProviders: () => Promise<AIHubProvider[]>
  configureProvider: (provider: string, apiKey: string, model?: string, baseUrl?: string) => Promise<void>
  setDefaultProvider: (provider: string) => Promise<void>
  testConnection: (
    provider: string,
    apiKey: string,
    baseUrl: string,
    model: string,
  ) => Promise<{ status: string; message: string }>
  fetchModels: (baseUrl: string, apiKey: string) => Promise<{ status: string; models: string[]; message?: string }>
  syncProviders: (
    configs: Array<{ provider: string; apiKey: string; model: string; baseUrl: string }>,
    defaultProvider: string,
  ) => Promise<void>
  resolveProvider: (
    message: string,
    routingRules: Array<{ taskType: string; provider: string }>,
    defaultProvider: string,
  ) => Promise<string>
  saveSkill: (name: string, content: string) => Promise<{ status: string; name: string }>
  onStream: (callback: (data: AIHubStreamData) => void) => () => void
}

// ============================================================
// Platform API (云服务)
// ============================================================

export interface PlatformIpcApi {
  saveToken: (token: string) => Promise<void>
  loadToken: () => Promise<string | null>
  clearToken: () => Promise<void>
}
