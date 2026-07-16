/**
 * 统一图标配置文件
 * 使用 lucide-react 图标库，确保视觉风格统一
 */

import {
  FolderOpen,
  Folder,
  Search,
  Settings,
  Tag,
  PlayCircle,
  FileOutput,
  FileSpreadsheet,
  FileCode,
  FileText,
  FileCheck,
  ClipboardList,
  RefreshCw,
  Plus,
  Trash2,
  Download,
  Play,
  X,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  PanelLeftClose,
  PanelLeft,
  SplitSquareVertical,
  Layout,
  RotateCcw,
  Terminal,
  ScrollText,
  FileWarning,
  Database,
  BarChart3,
  FolderPlus,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Copy,
  Save,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react'

// ========== 活动栏图标配置 ==========

export const ACTIVITY_ICONS = {
  explorer: FolderOpen, // 项目浏览器
  search: Search, // 搜索
  config: Settings, // 项目配置
  label: Tag, // 标签打印
  render: PlayCircle, // 渲染操作（改为 PlayCircle）
  output: FileOutput, // 输出结果（改为 FileOutput）
} as const

// ========== 文件类型图标配置 ==========

export const FILE_TYPE_ICONS = {
  excel: FileSpreadsheet, // Excel 文件
  yaml: FileCode, // YAML 文件
  template: FileText, // 模板文件
  output: FileCheck, // 输出文件
  word: FileText, // Word 文件
  text: FileText, // 文本文件
  markdown: FileText, // Markdown 文件
  config: Settings, // 配置文件
  unknown: FileText, // 未知文件
} as const

// ========== 输出目录类型图标配置 ==========

export const OUTPUT_DIR_ICONS = {
  output: Settings, // 配置输出
  'output-sn': Tag, // SN配置
  yaml: FileCode, // YAML输出
  'yaml-sn': FileCheck, // YAML+SN
} as const

// ========== 空状态图标配置 ==========

export const EMPTY_STATE_ICONS = {
  project: FolderOpen, // 项目空状态
  file: FileText, // 文件空状态
  search: Search, // 搜索空状态
  config: ClipboardList, // 配置空状态
  excel: FileSpreadsheet, // Excel空状态
  output: FileOutput, // 输出空状态
} as const

// ========== 操作图标配置 ==========

export const ACTION_ICONS = {
  refresh: RefreshCw,
  add: Plus,
  delete: Trash2,
  download: Download,
  play: Play,
  close: X,
  expand: ChevronRight,
  collapse: ChevronDown,
  expandUp: ChevronUp,
  loading: Loader2,
  undo: Undo,
  redo: Redo,
  copy: Copy,
  save: Save,
  view: Eye,
  hide: EyeOff,
  lock: Lock,
  unlock: Unlock,
  zoomIn: ZoomIn,
  zoomOut: ZoomOut,
  maximize: Maximize2,
  minimize: Minimize2,
  external: ExternalLink,
} as const

// ========== 状态图标配置 ==========

export const STATUS_ICONS = {
  error: XCircle,
  success: CheckCircle,
  warning: AlertTriangle,
  info: Info,
  loading: Loader2,
  alert: AlertCircle,
} as const

// ========== 面板图标配置 ==========

export const PANEL_ICONS = {
  sidebarClose: PanelLeftClose,
  sidebarOpen: PanelLeft,
  split: SplitSquareVertical,
  layout: Layout,
  reset: RotateCcw,
  terminal: Terminal,
  log: ScrollText,
  unsupported: FileWarning,
  database: Database,
} as const

// ========== 工具函数 ==========

/**
 * 获取文件类型图标组件
 */
export function getFileTypeIcon(fileType: string): LucideIcon {
  return FILE_TYPE_ICONS[fileType as keyof typeof FILE_TYPE_ICONS] || FileText
}

/**
 * 获取输出目录图标组件
 */
export function getOutputDirIcon(dirName: string): LucideIcon {
  return OUTPUT_DIR_ICONS[dirName as keyof typeof OUTPUT_DIR_ICONS] || Folder
}

/**
 * 获取活动栏图标组件
 */
export function getActivityIcon(activityType: string): LucideIcon {
  return ACTIVITY_ICONS[activityType as keyof typeof ACTIVITY_ICONS] || FolderOpen
}

/**
 * 获取空状态图标组件
 */
export function getEmptyStateIcon(type: string): LucideIcon {
  return EMPTY_STATE_ICONS[type as keyof typeof EMPTY_STATE_ICONS] || FileText
}

// ========== 导出所有图标组件（供直接使用） ==========

export {
  FolderOpen,
  Folder,
  Search,
  Settings,
  Tag,
  PlayCircle,
  FileOutput,
  FileSpreadsheet,
  FileCode,
  FileText,
  FileCheck,
  ClipboardList,
  RefreshCw,
  Plus,
  Trash2,
  Download,
  Play,
  X,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  PanelLeftClose,
  PanelLeft,
  SplitSquareVertical,
  Layout,
  RotateCcw,
  Terminal,
  ScrollText,
  FileWarning,
  Database,
  BarChart3,
  FolderPlus,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Copy,
  Save,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ExternalLink,
}
