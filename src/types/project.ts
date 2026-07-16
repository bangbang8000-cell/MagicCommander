// ============================================================
// 项目相关类型 - 所有与项目操作相关的共享类型定义
// ============================================================

/** 项目基本信息 */
export interface ProjectInfo {
  id: number
  name: string
  index: number
}

/** 文件树节点（Explorer / Output 共用） */
export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

/** 项目完整信息（从后端获取） */
export interface ProjectDetail {
  id: string
  name: string
  path: string
  createTime?: string
  updateTime?: string
  structure?: ProjectStructure
}

export interface ProjectStructure {
  excel?: boolean
  templates?: boolean
  para?: boolean
  output?: boolean
  yaml?: boolean
  [key: string]: boolean | undefined
}

/** 项目参数表信息 */
export interface ProjectParameters {
  name: string
  path: string
  structure?: ProjectStructure
}

/** 创建项目参数 */
export interface CreateProjectParams {
  name: string
}

/** 删除项目参数 */
export interface DeleteProjectParams {
  ids: string[]
}

/** 项目文件列表查询参数 */
export interface ListProjectFilesParams {
  id: string
  fileType?: string
}

/** 项目文件列表项 */
export interface ProjectFile {
  name: string
  path: string
  isDirectory: boolean
  children?: ProjectFile[]
}

export interface ProjectStatus {
  hasExcel: boolean
  hasTemplates: boolean
  hasPara: boolean
  hasOutput: boolean
  hasYaml: boolean
  hasLabelOutput: boolean
}

export interface WorkspaceProjectInfo extends ProjectInfo {
  path: string
  createdAt?: string
  updatedAt?: string
  lastOpenedAt?: string
  status: ProjectStatus
}

export interface TemplateStructureSummary extends ProjectStatus {}

export interface TemplateMeta {
  name: string
  description: string
  scenario: string
  sourceProject: string
  updatedAt: string
  inputRequirements: string[]
  outputDescription: string
}

export interface TemplateInfo extends TemplateMeta {
  id: string
  path: string
  structure: TemplateStructureSummary
  files: FileNode[]
}

export interface WorkspaceIndex {
  version: 1
  updatedAt: string
  projects: WorkspaceProjectInfo[]
  templates: TemplateInfo[]
}
