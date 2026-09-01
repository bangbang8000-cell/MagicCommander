import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/ui.store'
import { HotkeyKeys } from '@/components/ui/Kbd'
import clsx from 'clsx'

export interface CommandItem {
  id: string
  label: string
  category: string
  shortcut?: string
  action: () => void
  /** 4.3 F3-1b：可选终端命令文本——存在且提供了 onTerminalCommand 时交终端批量执行 */
  terminal?: string
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  commands: CommandItem[]
  /** 4.3 F3-1b：批量命令终端执行回调（命令执行有反馈由终端负责） */
  onTerminalCommand?: (cmd: string) => void
}

// ===== 4.3 F3-1b：批量 AI 操作命令构建器（供命令面板接入）=====

export function createBatchCommand(
  id: string,
  label: string,
  category: string,
  terminal: string,
  shortcut?: string,
): CommandItem {
  return { id, label, category, shortcut, terminal, action: () => {} }
}

export function buildBatchRenderCommands(ids: string[]): CommandItem[] {
  if (ids.length === 0) return []
  const idsArg = ids.join(',')
  return [
    createBatchCommand('batchRender', `批量渲染 ${ids.length} 个项目`, '批量操作', `render project ${idsArg}`),
    createBatchCommand('batchRenderYaml', `批量渲染 YAML ${ids.length} 个项目`, '批量操作', `render yaml ${idsArg}`),
  ]
}

export function buildBatchExportCommands(ids: string[]): CommandItem[] {
  if (ids.length === 0) return []
  const idsArg = ids.join(',')
  return [createBatchCommand('batchExport', `批量导出 ${ids.length} 个项目`, '批量操作', `export projects ${idsArg}`)]
}

export function buildProjectCommands(): CommandItem[] {
  return [
    createBatchCommand('projectCreate', '新建项目（可指定模板）', '项目操作', 'create <项目名> --template <模板名>'),
    createBatchCommand('projectList', '列出项目', '项目操作', 'list projects'),
    createBatchCommand('projectDelete', '删除项目', '项目操作', 'delete project <id>'),
  ]
}

export function buildTemplateCommands(): CommandItem[] {
  return [
    createBatchCommand('templatePreview', '预览模板', '模板操作', 'template preview <项目ID> <模板路径>'),
    createBatchCommand(
      'templateCreate',
      '基于模板创建项目',
      '模板操作',
      'template create <项目名> --template <模板名>',
    ),
    createBatchCommand('templateList', '列出模板', '模板操作', 'template list'),
  ]
}

// ===== 4.4 F4-5：命令面板命令全集（覆盖项目/模板/渲染/导出/批量/管线/最近收藏/设置/终端） =====

export function createCommand(
  id: string,
  label: string,
  category: string,
  shortcut: string | undefined,
  action: () => void,
): CommandItem {
  return { id, label, category, shortcut, action }
}

/** 渲染命令：当前项目 + 所选批量（kind: project | yaml | sn） */
export function buildRenderCommands(
  onRender: (kind: 'project' | 'yaml' | 'sn') => void,
  batchCount = 0,
): CommandItem[] {
  const items: CommandItem[] = [
    createCommand('renderCurrent', '渲染当前项目', '渲染', 'Ctrl+Enter', () => onRender('project')),
    createCommand('renderCurrentYaml', 'YAML 输出当前项目', '渲染', undefined, () => onRender('yaml')),
    createCommand('renderCurrentSn', 'SN 模式渲染当前项目', '渲染', undefined, () => onRender('sn')),
  ]
  if (batchCount > 0) {
    items.unshift(
      createCommand('renderBatch', `批量渲染所选 ${batchCount} 个项目`, '渲染', undefined, () => onRender('project')),
      createCommand('renderBatchYaml', `批量 YAML 输出所选 ${batchCount} 个项目`, '渲染', undefined, () =>
        onRender('yaml'),
      ),
    )
  }
  return items
}

/** 导出命令：当前项目 + 所选批量 */
export function buildExportCommands(onExport: () => void, batchCount = 0): CommandItem[] {
  const items: CommandItem[] = [createCommand('exportCurrent', '导出当前项目', '导出', 'Ctrl+E', onExport)]
  if (batchCount > 0) {
    items.unshift(createCommand('exportBatch', `批量导出所选 ${batchCount} 个项目`, '导出', undefined, onExport))
  }
  return items
}

/** 最近使用命令 */
export function buildRecentCommands(recent: string[], onOpen: (name: string) => void): CommandItem[] {
  return recent
    .slice(0, 5)
    .map((name) => createCommand(`recent:${name}`, name, '最近使用', undefined, () => onOpen(name)))
}

/** 收藏项目命令 */
export function buildFavoriteCommands(favorites: string[], onOpen: (name: string) => void): CommandItem[] {
  return favorites.map((name) => createCommand(`favorite:${name}`, name, '收藏', undefined, () => onOpen(name)))
}

/** 一键管线命令（规划管线 + 模板批处理） */
export function buildPipelineCommands(onPlan: () => void, onTemplate: () => void): CommandItem[] {
  return [
    createCommand('pipelinePlan', '一键管线：导入 AutoLink 规划 → 渲染 → 导出', '一键管线', undefined, onPlan),
    createCommand('pipelineTemplate', '模板批处理：多模板一键渲染导出', '一键管线', undefined, onTemplate),
  ]
}

/** 设置命令全集 */
export function buildSettingsCommands(onOpen: () => void): CommandItem[] {
  return [
    createCommand('settings', '打开设置', '设置', 'Ctrl+,', onOpen),
    createCommand('settingsAi', 'AI 配置', '设置', undefined, onOpen),
    createCommand('settingsGeneral', '通用设置', '设置', undefined, onOpen),
    createCommand('settingsAdvanced', '高级设置', '设置', undefined, onOpen),
  ]
}

/** 终端命令全集（交终端/命令注册表执行） */
export function buildTerminalCommands(): CommandItem[] {
  return [
    createBatchCommand('t-help', '终端帮助', '终端', 'help'),
    createBatchCommand('t-list', '列出项目', '终端', 'list projects'),
    createBatchCommand('t-list-templates', '列出模板', '终端', 'list templates'),
    createBatchCommand('t-create', '新建项目（可指定模板）', '终端', 'create <项目名> --template <模板名>'),
    createBatchCommand('t-render', '渲染项目', '终端', 'render project <ids>'),
    createBatchCommand('t-render-yaml', 'YAML 输出项目', '终端', 'render yaml <ids>'),
    createBatchCommand('t-export', '批量导出项目包', '终端', 'export projects <ids>'),
    createBatchCommand('t-batch-render', '批量渲染', '终端', 'batch render <ids>'),
    createBatchCommand('t-batch-export', '批量导出', '终端', 'batch export <ids>'),
    createBatchCommand('t-validate', '模板校验', '终端', 'validate template <ids>'),
    createBatchCommand('t-template-list', '模板管理', '终端', 'template list'),
    createBatchCommand('t-label', '标签打印', '终端', 'label print <ids>'),
    createBatchCommand('t-clear', '清屏', '终端', 'clear'),
  ]
}

export function CommandPalette({ open, onClose, commands, onTerminalCommand }: CommandPaletteProps) {
  const { t } = useTranslation()
  const isDark = useUIStore((s) => s.isDark)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = query
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) || c.category.toLowerCase().includes(query.toLowerCase()),
      )
    : commands

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Clamp selectedIndex
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1))
    }
  }, [filtered.length, selectedIndex])

  const execute = useCallback(
    (index: number) => {
      const item = filtered[index]
      if (item) {
        // 4.3 F3-1b：带 terminal 文本的批量命令交终端执行（命令执行有反馈）
        if (item.terminal && onTerminalCommand) {
          onTerminalCommand(item.terminal)
        } else {
          item.action()
        }
        onClose()
      }
    },
    [filtered, onClose, onTerminalCommand],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        execute(selectedIndex)
        break
      case 'Escape':
        onClose()
        break
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined
      selected?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div
        className={clsx(
          'w-[560px] max-h-[400px] rounded-lg shadow-2xl border overflow-hidden flex flex-col',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={clsx('px-4 py-3 border-b', isDark ? 'border-gray-700' : 'border-gray-200')}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('common:commandPalette.placeholder')}
            className={clsx(
              'w-full bg-transparent text-sm outline-none',
              isDark ? 'text-gray-100 placeholder:text-gray-500' : 'text-gray-900 placeholder:text-gray-400',
            )}
          />
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className={clsx('px-4 py-8 text-center text-sm', isDark ? 'text-gray-500' : 'text-gray-400')}>
              {t('common:commandPalette.noResults')}
            </div>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.id}
                onClick={() => execute(i)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors',
                  i === selectedIndex
                    ? isDark
                      ? 'bg-blue-900/30 text-blue-300'
                      : 'bg-blue-50 text-blue-700'
                    : isDark
                      ? 'text-gray-200 hover:bg-gray-700'
                      : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                <span className="flex-1 truncate">{item.label}</span>
                <span className={clsx('text-xs shrink-0', isDark ? 'text-gray-500' : 'text-gray-400')}>
                  {item.category}
                </span>
                {item.shortcut && <HotkeyKeys combo={item.shortcut} />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
