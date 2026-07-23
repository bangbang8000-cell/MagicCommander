import { useState, useCallback } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { Edit3, Plus, Trash2, ChevronRight, FileText, FileCode, Folder, Table2, Upload } from 'lucide-react'
import { useProjectStore } from '@/stores/project.store'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { showError } from '@/components/ui/Toast'
import { ProjectStatusBadge } from '@/components/sidebar/project/ProjectStatusBadge'
import { Button } from '@/components/ui/Button'
import { getFileTypeFromPath } from '@/types/editor'
import type { TemplateInfo } from '@/types/project'

// --- 内联文件树（纯展示组件，无 hooks）---

interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

function getFileIcon(name: string, isDark: boolean) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const base = 'shrink-0'
  const size = 11
  if (['xls', 'xlsx'].includes(ext)) return <Table2 size={size} className={clsx(base, 'text-green-500')} />
  if (['j2', 'jinja', 'jinja2'].includes(ext)) return <FileCode size={size} className={clsx(base, 'text-blue-500')} />
  if (['md', 'markdown'].includes(ext)) return <FileText size={size} className={clsx(base, 'text-purple-500')} />
  if (ext === 'json') return <FileCode size={size} className={clsx(base, 'text-yellow-500')} />
  if (['yaml', 'yml'].includes(ext)) return <FileCode size={size} className={clsx(base, 'text-orange-500')} />
  return <FileText size={size} className={clsx(base, isDark ? 'text-gray-400' : 'text-gray-500')} />
}

function TemplateFileTree({
  files,
  depth,
  isDark,
  onFileClick,
}: {
  files: FileNode[]
  depth: number
  isDark: boolean
  onFileClick: (node: FileNode) => void
}) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  const toggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <>
      {files.map((node) =>
        node.isDirectory ? (
          <div key={node.path}>
            <div
              className={clsx(
                'flex items-center gap-1.5 py-0.5 cursor-pointer text-[11px] rounded',
                isDark ? 'text-gray-300 hover:bg-gray-700/50' : 'text-gray-600 hover:bg-gray-100',
              )}
              style={{ paddingLeft: `${depth * 12 + 4}px` }}
              onClick={() => toggleDir(node.path)}
            >
              <ChevronRight
                size={11}
                className={clsx('shrink-0 transition-transform', expandedDirs.has(node.path) && 'rotate-90')}
              />
              <Folder size={12} className="shrink-0 text-yellow-600 dark:text-yellow-500" />
              <span className="truncate font-medium">{node.name}</span>
              {node.children && (
                <span className={clsx('text-[11px] ml-auto', isDark ? 'text-gray-500' : 'text-gray-400')}>
                  {node.children.length}
                </span>
              )}
            </div>
            {expandedDirs.has(node.path) && node.children && (
              <TemplateFileTree files={node.children} depth={depth + 1} isDark={isDark} onFileClick={onFileClick} />
            )}
          </div>
        ) : (
          <div
            key={node.path}
            className={clsx(
              'flex items-center gap-1.5 py-0.5 cursor-pointer text-[11px] rounded',
              isDark ? 'text-gray-300 hover:bg-gray-700/50' : 'text-gray-600 hover:bg-gray-100',
            )}
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
            onClick={() => onFileClick(node)}
            title={node.path}
          >
            {getFileIcon(node.name, isDark)}
            <span className="truncate">{node.name}</span>
          </div>
        ),
      )}
    </>
  )
}

// --- 主卡片 ---

type TemplateCardProps = {
  template: TemplateInfo
  selected: boolean
  onSelect: () => void
  onCreateProject: () => void
  onEdit: () => void
  onDelete: () => void
  onPublish?: () => void
}

export function TemplateCard({ template, selected, onSelect, onCreateProject, onEdit, onDelete, onPublish }: TemplateCardProps) {
  const { t } = useTranslation('project')
  const isDark = useUIStore((s) => s.isDark)
  const projects = useProjectStore((s) => s.projects)
  const selectProject = useProjectStore((s) => s.selectProject)
  const openFile = useEditorStore((s) => s.openFile)
  const [expanded, setExpanded] = useState(false)

  const handleHeaderClick = () => {
    onSelect()
    setExpanded((prev) => !prev)
  }

  const handleFileClick = useCallback(
    async (node: FileNode) => {
      const fileType = getFileTypeFromPath(node.name)

      // 优先从源项目读取
      if (template.sourceProject) {
        const sourceProject = projects.find((p) => p.name === template.sourceProject)
        if (sourceProject) {
          selectProject(sourceProject)
          openFile({
            id: '',
            title: node.name,
            filePath: node.path,
            fileType,
            projectId: sourceProject.id,
            projectName: sourceProject.name,
            isDirty: false,
          })
          return
        }
      }

      // 回退：从模板目录直接读取文件内容
      try {
        const isExcel = fileType === 'excel'
        if (isExcel) {
          const sheets = await window.electron.project.readTemplateExcel(template.id, node.path)
          openFile({
            id: `template-${template.id}-${node.path}`,
            title: `${node.name} (模板)`,
            filePath: `template:${template.id}/${node.path}`,
            fileType,
            projectId: 0,
            projectName: template.name,
            isDirty: false,
            content: sheets,
          } as any)
        } else {
          const content = await window.electron.project.readTemplateFile(template.id, node.path)
          openFile({
            id: `template-${template.id}-${node.path}`,
            title: `${node.name} (模板)`,
            filePath: `template:${template.id}/${node.path}`,
            fileType,
            projectId: 0,
            projectName: template.name,
            isDirty: false,
            content,
          } as any)
        }
      } catch (err) {
        showError(`无法读取模板文件: ${(err as Error).message}`)
      }
    },
    [template.sourceProject, template.id, template.name, projects, selectProject, openFile],
  )

  return (
    <div
      className={clsx(
        'rounded border text-xs transition-colors relative group',
        selected
          ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50',
      )}
    >
      {/* 左侧选中指示条 */}
      {selected && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l bg-primary-500 dark:bg-primary-400" />
      )}

      {/* 卡片头部 — 点击展开/收起 */}
      <div className="flex items-center gap-1.5 p-2 cursor-pointer" onClick={handleHeaderClick}>
        <ChevronRight
          size={12}
          className={clsx('shrink-0 text-gray-400 transition-transform', expanded && 'rotate-90')}
        />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{template.name}</div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
            {template.scenario || t('template.card.noScenario')}
          </div>
        </div>

        {/* 操作按钮 — hover 显示 */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onCreateProject() }}
            className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30 text-primary-600 dark:text-primary-400"
            title={t('template.card.createProject')}
          >
            <Plus size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            title={t('template.card.editInfo')}
          >
            <Edit3 size={12} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
            title={t('template.card.deleteTemplate')}
          >
            <Trash2 size={12} />
          </button>
          {onPublish && (
            <button
              onClick={(e) => { e.stopPropagation(); onPublish() }}
              className="p-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-500"
              title={t('template.publish') || '发布到市场'}
            >
              <Upload size={12} />
            </button>
          )}
        </div>
      </div>

      {/* 内联展开详情 — 点击不收起 */}
      {expanded && (
        <div className="px-2 pb-2 border-t border-gray-100 dark:border-gray-700/50 space-y-2">
          {/* 描述 + 源项目 + 结构 */}
          <div className="pt-2 space-y-1 text-xs">
            {template.description && (
              <div className="text-gray-600 dark:text-gray-300 line-clamp-3">{template.description}</div>
            )}
            <div className="text-gray-500 dark:text-gray-400">
              {t('template.card.sourceProject', { name: template.sourceProject || t('template.card.unknown') })}
            </div>
            <ProjectStatusBadge status={template.structure} />
          </div>

          {/* 输入要求 */}
          {template.inputRequirements.length > 0 && (
            <div>
              <div className="text-[11px] text-gray-400 mb-0.5">{t('template.detail.inputRequirements')}</div>
              <ul className="list-disc pl-4 space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
                {template.inputRequirements.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}

          {/* 输出描述 */}
          {template.outputDescription && (
            <div>
              <div className="text-[11px] text-gray-400 mb-0.5">{t('template.detail.outputDescription')}</div>
              <div className="text-xs text-gray-600 dark:text-gray-300">{template.outputDescription}</div>
            </div>
          )}

          {/* 文件结构 — 内联可点击文件树 */}
          {template.files && template.files.length > 0 && (
            <div>
              <div className="text-[11px] text-gray-400 mb-0.5">{t('template.detail.fileStructure')}</div>
              <div className={clsx('rounded py-0.5', isDark ? 'bg-gray-800/40' : 'bg-gray-50')}>
                <TemplateFileTree files={template.files} depth={0} isDark={isDark} onFileClick={handleFileClick} />
              </div>
            </div>
          )}

          {/* 创建项目按钮 */}
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={12} />}
            onClick={(e) => { e.stopPropagation(); onCreateProject() }}
            className="w-full justify-start mt-1"
          >
            {t('template.card.createProject')}
          </Button>
        </div>
      )}
    </div>
  )
}
