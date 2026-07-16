import type { TemplateInfo, TemplateMeta, WorkspaceIndex } from './project'

// ============================================================
// IPC 协议类型 - 所有 IPC 消息的请求 / 响应 / 事件类型
// ============================================================

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

export interface ElectronAPI {
  project: ProjectIpcApi
  render: RenderIpcApi
  delete: DeleteIpcApi
  feature: FeatureIpcApi
  guide: GuideIpcApi
  file: FileIpcApi
  dialog: DialogIpcApi
  app: AppIpcApi
  log: LogIpcApi
  shell: { showItemInFolder: (path: string) => Promise<void> }
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
  list: () => Promise<unknown[]>
  listExamples: () => Promise<string[]>
  listTemplates: () => Promise<TemplateInfo[]>
  getTemplate: (id: string) => Promise<TemplateInfo>
  create: (name: string, options?: { template?: string; empty?: boolean }) => Promise<void>
  saveAsExample: (projectName: string, exampleName: string) => Promise<void>
  saveAsTemplate: (projectName: string, templateName: string, meta: Partial<TemplateMeta>) => Promise<void>
  updateTemplateMeta: (id: string, meta: Partial<TemplateMeta>) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  getWorkspaceIndex: () => Promise<WorkspaceIndex>
  delete: (ids: string[]) => Promise<void>
  getStructure: (name: string) => Promise<unknown[]>
  parameters: (id: string) => Promise<unknown>
  readExcel: (
    id: number,
    filePath: string,
    projectName?: string,
  ) => Promise<{ name: string; headers: string[]; rows: Record<string, any>[] }[]>
  writeExcel: (
    id: number,
    filePath: string,
    sheets: { name: string; headers: string[]; rows: Record<string, any>[] }[],
    projectName?: string,
  ) => Promise<void>
  readFile: (id: number, filePath: string, projectName?: string) => Promise<string>
  writeFile: (id: number, filePath: string, content: string, projectName?: string) => Promise<void>
  readDocx: (id: number, filePath: string, projectName?: string) => Promise<string>
  readDocxBuffer: (id: number, filePath: string, projectName?: string) => Promise<ArrayBuffer>
  listFiles: (id: string, fileType?: string) => Promise<unknown>
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
}

// ============================================================
// Log API
// ============================================================

export interface LogIpcApi {
  onOutput: (callback: (data: { level: string; message: string; source?: string }) => void) => () => void
  write: (level: string, message: string) => Promise<void>
}
