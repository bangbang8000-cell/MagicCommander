/**
 * Chat 类型定义
 * Phase 1-C: UI 框架 + 数据结构预留
 * Phase 2: Agent Tool 对接、真实 LLM 流式响应
 */

// 附件类型
export type AttachmentType = 'template' | 'excel' | 'yaml' | 'config' | 'document' | 'other'

// 附件图标映射
export const ATTACHMENT_TYPE_ICONS: Record<AttachmentType, string> = {
  template: 'FileText',
  excel: 'FileSpreadsheet',
  yaml: 'FileCode',
  config: 'Settings',
  document: 'FileText',
  other: 'Paperclip',
}

// 附件大小标签
export const ATTACHMENT_TYPE_LABELS: Record<AttachmentType, string> = {
  template: 'chat:attachment.template',
  excel: 'chat:attachment.excel',
  yaml: 'chat:attachment.yaml',
  config: 'chat:attachment.config',
  document: 'chat:attachment.document',
  other: 'chat:attachment.other',
}

// 聊天模式
export type ChatMode = 'template' | 'config' | 'general'

// 自主模式
export type AutonomyMode = 'advisor' | 'semi_auto' | 'full_auto'

export const AUTONOMY_MODE_CONFIG: Record<AutonomyMode, { labelKey: string; icon: string }> = {
  advisor: { labelKey: 'chat:autonomy.advisor', icon: '🛡️' },
  semi_auto: { labelKey: 'chat:autonomy.semiAuto', icon: '⚡' },
  full_auto: { labelKey: 'chat:autonomy.fullAuto', icon: '🚀' },
}

// 模式配置
export const CHAT_MODE_CONFIG: Record<ChatMode, { labelKey: string; descKey: string; icon: string }> = {
  template: {
    labelKey: 'chat:mode.template',
    descKey: 'chat:mode.templateDesc',
    icon: 'LayoutTemplate',
  },
  config: {
    labelKey: 'chat:mode.config',
    descKey: 'chat:mode.configDesc',
    icon: 'FileCode',
  },
  general: {
    labelKey: 'chat:mode.general',
    descKey: 'chat:mode.generalDesc',
    icon: 'MessageSquare',
  },
}

// Phase 2 预留：Agent Tool 调用结果
export interface ToolResult {
  toolName: string
  success: boolean
  result?: unknown
  error?: string
}

// Skill 保存提示
export interface SkillSavePrompt {
  taskDescription: string
  skillName: string
  skillContent: string
  messageId: string
}

// 聊天附件
export interface ChatAttachment {
  id: string
  name: string
  type: AttachmentType
  path: string
  size: number
  preview?: string // Phase 2: 文件内容预览
}

// 聊天消息
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string // Markdown 格式
  attachments?: ChatAttachment[]
  timestamp: number
  mode: ChatMode
  metadata?: {
    tools?: string[] // Phase 2: Agent 调用的工具列表
    toolResults?: ToolResult[] // Phase 2: 工具执行结果
  }
}

// 聊天会话
export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  mode: ChatMode
  createdAt: number
  updatedAt: number
}

// Phase 2 预留：Agent Tool 接口定义
export interface AgentTool {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required: string[]
  }
}

// 预置工具集（Phase 2 实现，Phase 1-C 定义接口）
export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'create_project',
    description: '创建新的配置项目，指定项目名称和模板来源',
    parameters: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '项目名称' },
        templateName: { type: 'string', description: '模板名称（可选）' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'create_template',
    description: '将现有项目或配置保存为可复用模板',
    parameters: {
      type: 'object',
      properties: {
        sourceProject: { type: 'string', description: '源项目名称' },
        templateName: { type: 'string', description: '新模板名称' },
      },
      required: ['sourceProject', 'templateName'],
    },
  },
  {
    name: 'update_template',
    description: '修改模板文件内容',
    parameters: {
      type: 'object',
      properties: {
        templateName: { type: 'string', description: '模板名称' },
        filePath: { type: 'string', description: '文件相对路径' },
        content: { type: 'string', description: '新内容' },
      },
      required: ['templateName', 'filePath', 'content'],
    },
  },
  {
    name: 'render_config',
    description: '执行配置渲染，生成设备配置文件',
    parameters: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '项目名称' },
        format: { type: 'string', description: '输出格式 (config/yaml/both)' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'dry_run',
    description: '预演渲染，预览结果但不写入文件',
    parameters: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '项目名称' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'validate_template',
    description: '校验 Jinja2 模板语法',
    parameters: {
      type: 'object',
      properties: {
        templateName: { type: 'string', description: '模板名称' },
      },
      required: ['templateName'],
    },
  },
  {
    name: 'validate_excel',
    description: '校验 Excel 参数文件',
    parameters: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '项目名称' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'diff_compare',
    description: '对比渲染结果与已有输出差异',
    parameters: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '项目名称' },
      },
      required: ['projectName'],
    },
  },
  {
    name: 'read_file',
    description: '读取项目中的文件内容',
    parameters: {
      type: 'object',
      properties: {
        projectName: { type: 'string', description: '项目名称' },
        filePath: { type: 'string', description: '文件相对路径' },
      },
      required: ['projectName', 'filePath'],
    },
  },
  {
    name: 'search_files',
    description: '按名称或内容搜索项目文件',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        projectName: { type: 'string', description: '限定项目（可选）' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_projects',
    description: '列出所有项目及其结构',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
]

// 工具函数
export function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getAttachmentTypeFromPath(filePath: string): AttachmentType {
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'xlsx':
    case 'xls':
      return 'excel'
    case 'yaml':
    case 'yml':
      return 'yaml'
    case 'j2':
    case 'jinja2':
      return 'template'
    case 'json':
    case 'toml':
    case 'ini':
    case 'cfg':
      return 'config'
    case 'md':
    case 'txt':
    case 'pdf':
      return 'document'
    default:
      return 'other'
  }
}