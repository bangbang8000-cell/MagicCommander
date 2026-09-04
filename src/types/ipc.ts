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

export interface PlanImportResult {
  ok: boolean
  name: string
  device_count: number
  connections: number
  terminals: number
  bridge?: { source?: string; projectType?: string; bridgeVersion?: string }
  mcpara_id?: number
  /** 契约 v1.2（M-3）：来源身份 + 匹配检测 */
  origin?: {
    projectId?: string
    projectName?: string
    site?: string
    planVersion?: number
    matched?: 'new' | 'update' | 'none' | 'skip'
  }
  /** 契约 v1.2（P2）：导入版本 + 变更记录 */
  mcPlanVersion?: number
  changed?: boolean
  changelog?: Array<{
    at?: string
    planVersion?: number
    mcPlanVersion?: number
    planHash?: string
    changed?: Array<{ field: string; from?: unknown; to?: unknown }>
    summary?: string
  }>
  project_dir?: string
  /** 契约 v1.2：身份缺失等 warn（不阻断） */
  warnings?: string[]
}

export interface PlanValidateResult {
  ok: boolean
  issue_count: number
  issues: string[]
}

/** P2（V-MC2）：渲染命令核对矩阵 */
export interface VerifyResult {
  ok: boolean
  error?: string
  rendered_at?: string
  checks: string[]
  devices: Array<{
    name: string
    role: string
    plane: string
    results: Array<{ check: string; applicable: boolean; hit: boolean | null }>
  }>
  summary: Record<string, { total: number; hit: number }>
}

export interface PlanIpcApi {
  import: (planJson: string, projectDir?: string) => Promise<PlanImportResult>
  importData: (plan: unknown, projectDir?: string) => Promise<PlanImportResult>
  verify: (projectDir: string) => Promise<VerifyResult>
  analyze: (projectDir: string) => Promise<unknown>
  validate: (planJson: string) => Promise<PlanValidateResult>
  validateData: (plan: unknown) => Promise<PlanValidateResult>
}

export interface ElectronAPI {
  project: ProjectIpcApi
  asset: AssetIpcApi
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
  output: {
    export: (projectName: string, format: 'zip' | 'dir') => Promise<string>
  }
  aihub: AIHubIpcApi
  window: WindowIpcApi
  platform: PlatformIpcApi
  cloud: CloudIpcApi
  deviceLibrary: DeviceLibraryIpcApi
  diag: DiagIpcApi
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
  /** 4.8.0（F8-1 / 48-a）：导出可移植项目包（zip + manifest） */
  exportPackage: (projectName: string) => Promise<ProjectPackageExportResult>
  /** 4.8.0（F8-1 / 48-a）：导入可移植项目包（按 manifest.projectId 匹配新建/更新/跳过） */
  importPackage: () => Promise<ProjectPackageImportResult>
  /** 4.8.0（F8-2 / 48-b）：项目历史快照导出为文件 */
  exportSnapshot: (projectName: string, scope?: 'history' | 'backup') => Promise<{ path: string; itemCount: number }>
  /** 4.8.0（F8-2 / 48-b）：从文件导入项目历史快照（合并去重） */
  importSnapshot: (projectName: string) => Promise<{ ok: boolean; total: number; added: number }>
  /** 4.8.0（F8-3 / 48-c）：模板包导出为文件 */
  exportTemplatePackage: (
    templateId: string,
  ) => Promise<{ status: string; data?: { path: string; name: string; file_count: number } }>
  /** 4.8.0（F8-3 / 48-c）：从文件导入模板包 */
  importTemplatePackage: () => Promise<{ status: string; data?: { name: string; path: string } }>
  /** 4.8.0（F8-5 / 48-e）：交付物清单校验（批次 manifest 缺失/漂移/哈希不符） */
  verifyManifest: (projectName: string) => Promise<{
    ok: boolean
    error?: string
    rendered_at?: string
    missing: string[]
    hash_mismatch: string[]
    drifted: string[]
    summary: Record<string, unknown>
  }>
  /** 4.8.0（F8-4 / 48-d）：导出项目评审包（zip） */
  exportReviewPackage: (projectName: string) => Promise<{ status: string; data?: { path: string; project: string } }>
  /** 4.8.0（F8-4 / 48-d）：导出项目评审 PDF */
  exportReviewPdf: (projectName: string) => Promise<{ status: string; data?: { path: string; project: string } }>
}

/** 4.8.0（F8-3 / 48-c）：跨端资产互灌（设备库可移植导入/导出） */
export interface AssetIpcApi {
  deviceLibraryExport: () => Promise<{ status: string; data?: { path: string; schema: string; count: number } }>
  deviceLibraryImport: () => Promise<{
    status: string
    data?: {
      ok: boolean
      total: number
      added: string[]
      updated: string[]
      skipped: string[]
      conflicts: string[]
    }
  }>
}

/** 4.8.0（F8-3 / 48-c）：技能库文件级导入/导出结果 */
export interface SkillsTransferResult {
  ok?: boolean
  schema?: string
  count?: number
  total?: number
  added?: string[]
  updated?: string[]
  skipped?: string[]
  target?: string
}

/** 4.8.0（F8-1 / 48-a）：项目包导出结果 */
export interface ProjectPackageExportResult {
  status: string
  message?: string
  data?: {
    path: string
    projectId: string
    projectName: string
    file_count: number
  }
}

/** 4.8.0（F8-1 / 48-a）：项目包导入结果（matched: skip/update/new） */
export interface ProjectPackageImportResult {
  ok: boolean
  matched: 'skip' | 'update' | 'new'
  name: string
  project_dir?: string
  projectId?: string
  file_count?: number
  changed?: boolean
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

export interface GuideContent {
  content: string
  /** 是否回退到了英文/中文（渲染层据此显示"本语言暂无引导"提示条） */
  usedFallback: boolean
  requestedLang: string
}

export interface GuideIpcApi {
  getContent: (lang: string) => Promise<GuideContent>
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
  openFile: (options?: {
    title?: string
    filters?: { name: string; extensions: string[] }[]
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>
  }) => Promise<string | null>
  saveFile: (options?: unknown) => Promise<unknown>
  showMessage: (options: { type: 'info' | 'warning' | 'error'; title: string; message: string }) => Promise<void>
  showConfirm: (options: { title: string; message: string }) => Promise<boolean>
}

// ============================================================
// App API
// ============================================================

export type UpdateStatus =
  | { status: 'checking' }
  | { status: 'available'; version?: string; releaseNotes?: string | string[]; channel?: 'auto' | 'fallback' }
  | { status: 'not-available' }
  | { status: 'downloading'; progress?: number; transferred?: number; total?: number; channel?: 'auto' | 'fallback' }
  | { status: 'downloaded'; channel?: 'auto' | 'fallback'; verified?: boolean }
  | { status: 'error'; error?: string; channel?: 'auto' | 'fallback' }

export interface AppIpcApi {
  getVersion: () => Promise<string>
  getBuildInfo: () => Promise<{ version: string; build: string; displayVersion: string }>
  getPath: (name: 'home' | 'appData' | 'userData' | 'backend' | 'workspace') => Promise<string>
  checkUpdate: () => Promise<void>
  downloadUpdate: () => Promise<void>
  quitAndInstall: () => Promise<void>
  setCheckUpdateOnStart: (enabled: boolean) => Promise<void>
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

/** 5.0.2-F502-2：AI 引擎配置与可用性（own/hermes/auto） */
export interface AIEngineInfo {
  /** 当前配置的引擎模式（own/hermes/auto） */
  engine: string
  /** 实际解析的引擎（auto 的实际路由：hermes 可用则 hermes，否则 own） */
  resolved: string
  /** 各引擎可用性（own 恒可用；hermes 需运行时已安装） */
  available: Record<string, boolean>
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
    engine?: string,
    // 5.0.3-503-a：多步任务编排 workflow 模式（on/off，缺省 off；仅自有引擎生效）
    workflow?: string,
  ) => Promise<string>
  clearSession: (sessionId: string) => Promise<void>
  getEngine: () => Promise<AIEngineInfo>
  setEngine: (engine: string) => Promise<AIEngineInfo>
  getProviders: () => Promise<AIHubProvider[]>
  configureProvider: (
    provider: string,
    apiKey: string,
    model?: string,
    baseUrl?: string,
    models?: string[],
  ) => Promise<void>
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
  /** 4.8.0（F8-3 / 48-c）：技能库导出为文件 */
  exportSkills: () => Promise<SkillsTransferResult>
  /** 4.8.0（F8-3 / 48-c）：技能库从文件导入 */
  importSkills: () => Promise<SkillsTransferResult>
  /** 5.0.3-503-c：MCP server 管理（列表/新增/移除/启动/停止/工具清单） */
  mcpList: () => Promise<{ status: string; servers: MCPServerInfo[] }>
  mcpAdd: (
    name: string,
    command: string,
    args?: string[],
    env?: Record<string, string>,
  ) => Promise<{ status: string; name?: string; error?: string }>
  mcpRemove: (name: string) => Promise<{ status: string; error?: string }>
  mcpStart: (name: string) => Promise<{ status: string; server?: MCPServerInfo; error?: string }>
  mcpStop: (name: string) => Promise<{ status: string; name?: string; error?: string }>
  mcpTools: (name: string) => Promise<{ status: string; server: string; tools: MCPToolInfo[] }>
  onStream: (callback: (data: AIHubStreamData) => void) => () => void
}

/** 5.0.3-503-c：MCP server 配置与状态 */
export interface MCPServerInfo {
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  status: string
  tool_count: number
  tools: string[]
}

/** 5.0.3-503-c：MCP 工具定义（命名空间 mcp:<server>:<tool>） */
export interface MCPToolInfo {
  name: string
  description: string
  server: string
  inputSchema?: Record<string, unknown>
}

// ============================================================
// Platform API (云服务)
// ============================================================

export interface PlatformIpcApi {
  saveToken: (token: string) => Promise<void>
  loadToken: () => Promise<string | null>
  clearToken: () => Promise<void>
}

// ============================================================
// 5.0.4（504-a）：协作分享 IPC（生成快照 → POST /shares → 预览 URL）
// ============================================================

/** 我的分享条目 */
export interface CloudShareItem {
  token: string
  project_name: string
  description: string
  expires_at: string
  created_at: string
  url: string
}

export interface CloudShareCreateResult {
  token: string
  project_name: string
  url: string
  expires_at: string
  fullUrl: string
}

export interface CloudIpcApi {
  shareCreate: (payload: {
    projectName: string
    baseUrl: string
    description?: string
    expireDays?: number
  }) => Promise<CloudShareCreateResult>
  shareList: (baseUrl: string) => Promise<{ shares: CloudShareItem[] }>
  shareRevoke: (baseUrl: string, token: string) => Promise<{ deleted: boolean }>
}

// ============================================================
// 5.0.4（504-c）：设备库云同步 IPC（拉取合并 / 上传发布）
// ============================================================

export interface DeviceLibrarySyncResult {
  ok: boolean
  remoteCount: number
  localCount: number
  added: string[]
  updated: string[]
  skipped: string[]
  lastSync: string
}

export interface DeviceLibraryPublishResult {
  uploaded: number
  localCount: number
  lastSync: string
}

export interface DeviceLibraryIpcApi {
  sync: (baseUrl: string) => Promise<DeviceLibrarySyncResult>
  publish: (baseUrl: string) => Promise<DeviceLibraryPublishResult>
}

// ============================================================
// Diagnostics API (47-b/47-c/47-d：诊断中心 / 健康检查 / 本地遥测)
// ============================================================

/** 渲染层性能快照（对齐 src/utils/perf.ts 数据结构） */
export interface PerfSnapshotDto {
  ops: Array<{ id: string; category: string; label: string; durationMs: number; startedAt: number }>
  renderLongTasks: Array<{ startTime: number; durationMs: number; name?: string }>
  memory?: {
    available: boolean
    usedJsHeapMB: number | null
    totalJsHeapMB: number | null
    jsHeapLimitMB: number | null
    jsHeapUsedPct: number | null
    deviceMemoryGB: number | null
  } | null
}

export interface DiagnosticsReport {
  generatedAt: string
  app: { name: string; version: string; build: string; platform: string; arch: string; release: string }
  versions: { electron: string; node: string; chrome: string }
  paths: Record<string, string>
  disk: { path: string; freeBytes: number | null; freeGB: string | null }
  mainLog: string
  crash: { errorCount: number; lastLines: string[]; crashDumpsDir: string; errorsLog: string }
  audit: Array<{ ts: string; action: string; detail?: string; durationMs?: number }>
  telemetry: { enabled: boolean; events: Array<Record<string, unknown>> }
  perf: PerfSnapshotDto | null
}

export interface HealthCheckItem {
  name: string
  ok: boolean
  detail: string
}

export interface HealthReport {
  generatedAt: string
  environment: HealthCheckItem[]
  engine: HealthCheckItem[]
  network: HealthCheckItem[]
  dependencies: HealthCheckItem[]
  summary: { total: number; ok: number; failed: number }
}

export interface DiagIpcApi {
  collect: (perfSnapshot?: PerfSnapshotDto) => Promise<DiagnosticsReport>
  reportPerf: (perfSnapshot: PerfSnapshotDto) => Promise<boolean>
  export: () => Promise<{ ok: boolean; path?: string; error?: string }>
  health: (platformUrl?: string) => Promise<HealthReport>
  telemetryRead: () => Promise<string>
  telemetrySetEnabled: (enabled: boolean) => Promise<boolean>
  telemetryClear: () => Promise<boolean>
  telemetryExport: () => Promise<{ ok: boolean; path?: string; error?: string }>
}
