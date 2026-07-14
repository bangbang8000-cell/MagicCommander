import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '@/stores/project.store'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { Search, FileText, ChevronDown, ChevronRight, RefreshCw, Loader2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { getFileTypeFromPath } from '@/types/editor'
import type { FileNode } from '@/types/project'
import type { FileType } from '@/types/editor'
import clsx from 'clsx'

const FILE_TYPE_FILTERS: { key: string; label: string; exts: string[] }[] = [
  { key: 'yaml', label: 'search.fileType.yaml', exts: ['yml', 'yaml'] },
  { key: 'template', label: 'search.fileType.template', exts: ['j2', 'jinja', 'jinja2'] },
  { key: 'excel', label: 'search.fileType.excel', exts: ['xlsx', 'xls'] },
  { key: 'txt', label: 'search.fileType.txt', exts: ['txt', 'csv', 'md', 'json', 'html', 'py', 'log', 'conf', 'cfg', 'ini'] },
]

function getNodeFileType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  for (const f of FILE_TYPE_FILTERS) {
    if (f.exts.includes(ext)) return f.key
  }
  return 'other'
}

type SearchTab = 'filename' | 'content'

interface FilenameMatch {
  file: FileNode
  relativePath: string
}

interface ContentMatch {
  file: FileNode
  relativePath: string
  lineNum: number
  lineText: string
  matches: [number, number][]
}

const TEXT_EXTENSIONS = new Set([
  'txt',
  'yml',
  'yaml',
  'jinja',
  'jinja2',
  'html',
  'json',
  'py',
  'log',
  'csv',
  'md',
  'j2',
  'js',
  'ts',
  'css',
  'xml',
  'conf',
  'cfg',
  'ini',
])

function isTextFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return TEXT_EXTENSIONS.has(ext)
}

function flattenFiles(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = []
  const walk = (arr: FileNode[]) => {
    for (const node of arr) {
      if (node.isDirectory) {
        if (node.children) walk(node.children)
      } else {
        result.push(node)
      }
    }
  }
  walk(nodes)
  return result
}

function getRelativePath(projectPath: string, filePath: string): string {
  if (!projectPath) return filePath
  const idx = filePath.indexOf(projectPath)
  if (idx === 0) {
    const rest = filePath.slice(projectPath.length)
    return rest.replace(/^[\\/]/, '')
  }
  return filePath
}

function getFileNodeName(node: FileNode): string {
  return node.name
}

function getSearchResultPath(project: ProjectInfo | null, node: FileNode): string {
  if (!project) return node.path
  return getRelativePath(project.name, node.path)
}

function findLineMatches(text: string, keywords: string[]): [number, number][] {
  const results: [number, number][] = []
  const lower = text.toLowerCase()
  for (const kw of keywords) {
    const kwLower = kw.toLowerCase()
    let idx = 0
    while (true) {
      const pos = lower.indexOf(kwLower, idx)
      if (pos === -1) break
      results.push([pos, pos + kw.length])
      idx = pos + kw.length
    }
  }
  results.sort((a, b) => a[0] - b[0])
  return results
}

function getTabFileType(node: FileNode): FileType {
  const ext = node.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'xlsx' || ext === 'xls') return 'excel'
  if (ext === 'yaml' || ext === 'yml') return 'yaml'
  if (ext === 'j2' || ext === 'jinja' || ext === 'jinja2') return 'template'
  if (ext === 'doc' || ext === 'docx') return 'word'
  return getFileTypeFromPath(node.path) === 'output' ? 'output' : 'text'
}

export const SearchPanel = React.memo(function SearchPanel() {
  const { t } = useTranslation('project')
  const [keyword, setKeyword] = useState('')
  const [activeTab, setActiveTab] = useState<SearchTab>('filename')
  const [loading, setLoading] = useState(false)
  const [filenameResults, setFilenameResults] = useState<FilenameMatch[]>([])
  const [contentResults, setContentResults] = useState<ContentMatch[]>([])
  const [searchTrigger, setSearchTrigger] = useState(0)
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const isDark = useUIStore((s) => s.isDark)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedProject = useProjectStore((s) => s.selectedProject)
  const projectStructure = useProjectStore((s) => s.projectStructure)
  const projects = useProjectStore((s) => s.projects)
  const loadStructure = useProjectStore((s) => s.loadStructure)

  const openFile = useEditorStore((s) => s.openFile)

  const keywords = useMemo(
    () => keyword.trim().split(/\s+/).filter(Boolean),
    [keyword],
  )

  // 文件名搜索：在 projectStructure 中查找
  const performFilenameSearch = useCallback(() => {
    if (!selectedProject || keywords.length === 0) {
      setFilenameResults([])
      return
    }
    const allFiles = flattenFiles(projectStructure)
    const matched: FilenameMatch[] = []
    for (const file of allFiles) {
      // 文件类型过滤
      if (selectedTypes.size > 0) {
        const nodeType = getNodeFileType(file.name)
        if (!selectedTypes.has(nodeType)) continue
      }
      const lower = getFileNodeName(file).toLowerCase()
      const ok = keywords.every((kw) => lower.includes(kw.toLowerCase()))
      if (ok) {
        matched.push({
          file,
          relativePath: getSearchResultPath(selectedProject, file),
        })
      }
    }
    setFilenameResults(matched)
  }, [projectStructure, keywords, selectedProject, selectedTypes])

  // 文件内容搜索：读取所有文本文件，逐行匹配
  const performContentSearch = useCallback(async () => {
    if (!selectedProject || keywords.length === 0) {
      setContentResults([])
      return
    }
    setLoading(true)
    try {
      const allFiles = flattenFiles(projectStructure)
      let textFiles = allFiles.filter((f) => isTextFile(f.name))
      // 文件类型过滤
      if (selectedTypes.size > 0) {
        textFiles = textFiles.filter((f) => selectedTypes.has(getNodeFileType(f.name)))
      }
      const matches: ContentMatch[] = []

      for (const file of textFiles) {
        try {
          const content = (await window.electron?.project?.readFile(
            Number(selectedProject.id),
            file.path,
          )) as unknown as string | undefined

          const text = typeof content === 'string' ? content : ''
          const lines = text.split(/\r?\n/)
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            const lineLower = line.toLowerCase()
            const matchAll = keywords.every((kw) => lineLower.includes(kw.toLowerCase()))
            if (matchAll) {
              const ranges = findLineMatches(line, keywords)
              if (ranges.length > 0) {
                matches.push({
                  file,
                  relativePath: getSearchResultPath(selectedProject, file),
                  lineNum: i + 1,
                  lineText: line,
                  matches: ranges,
                })
              }
            }
          }
        } catch {
          // 单个文件读取失败，跳过
          continue
        }
      }
      setContentResults(matches)
      setCollapsedGroups(new Set()) // 新搜索重置折叠状态
    } catch (err) {
      showError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [projectStructure, keywords, selectedProject, selectedTypes])

  // 执行搜索
  useEffect(() => {
    if (searchTrigger === 0) return
    if (activeTab === 'filename') {
      performFilenameSearch()
    } else {
      performContentSearch()
    }
  }, [searchTrigger, activeTab, performFilenameSearch, performContentSearch])

  // 切换 tab 时不立即触发搜索，让用户主动点击搜索按钮
  // 之前的自动触发会导致切换面板时看起来像"重新加载"
  // useEffect(() => {
  //   if (keywords.length > 0) {
  //     setSearchTrigger((n) => n + 1)
  //   }
  // }, [activeTab, keywords.length])

  const handleSearch = () => {
    if (keywords.length === 0) return
    setSearchTrigger((n) => n + 1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleFileClick = (file: FileNode) => {
    if (!selectedProject) return
    const fileType = getTabFileType(file)
    openFile({
      id: '',
      title: file.name,
      filePath: file.path,
      fileType,
      projectId: selectedProject.id,
      projectName: selectedProject.name,
      isDirty: false,
    })
  }

  // 文件类型过滤切换
  const toggleType = (key: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 内容搜索结果按文件分组
  const groupedContent = useMemo(() => {
    const map = new Map<string, { file: FileNode; relativePath: string; matches: ContentMatch[] }>()
    for (const item of contentResults) {
      const key = item.file.path
      if (!map.has(key)) {
        map.set(key, { file: item.file, relativePath: item.relativePath, matches: [] })
      }
      map.get(key)!.matches.push(item)
    }
    return Array.from(map.values())
  }, [contentResults])

  const renderHighlightedText = (text: string) => {
    if (keywords.length === 0) return text
    const ranges = findLineMatches(text, keywords)
    if (ranges.length === 0) return text

    const segments: React.ReactNode[] = []
    let cursor = 0
    let lastEnd = 0
    for (let i = 0; i < ranges.length; i++) {
      const [start, end] = ranges[i]
      if (start < lastEnd) continue
      if (start > cursor) {
        segments.push(
          <span key={`t-${i}`}>{text.slice(cursor, start)}</span>,
        )
      }
      segments.push(
        <span
          key={`h-${i}`}
          className={clsx(
            'rounded px-0.5 font-medium',
            isDark ? 'bg-yellow-900/40 text-yellow-200 border border-yellow-700/50' : 'bg-yellow-200 text-gray-900',
          )}
        >
          {text.slice(start, end)}
        </span>,
      )
      cursor = end
      lastEnd = end
    }
    if (cursor < text.length) {
      segments.push(<span key="tail">{text.slice(cursor)}</span>)
    }
    return segments
  }

  // 文件类型过滤的 chip 样式
  const typeChipClass = (key: string) => {
    const active = selectedTypes.has(key)
    return clsx(
      'px-2 py-0.5 text-[10px] rounded border transition-colors cursor-pointer',
      active
        ? isDark
          ? 'bg-primary-900/40 border-primary-700 text-primary-200'
          : 'bg-primary-50 border-primary-400 text-primary-700'
        : isDark
          ? 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
          : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400',
    )
  }

  return (
    <div className={clsx('flex flex-col h-full', isDark ? 'bg-gray-900' : 'bg-white')}>
      {/* 顶部搜索框 + 工具栏 */}
      <div className={clsx('px-3 py-2 border-b', isDark ? 'border-gray-700' : 'border-gray-200')}>
        <div className="flex items-center gap-1 mb-2">
          <div className="relative flex-1">
            <Search
              size={12}
              className={clsx('absolute start-2 top-1/2 -translate-y-1/2', isDark ? 'text-gray-500' : 'text-gray-400')}
            />
            <input
              ref={inputRef}
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                activeTab === 'filename'
                  ? t('search.filenamePlaceholder')
                  : t('search.contentPlaceholder')
              }
              className={clsx(
                'w-full ps-6 pe-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-primary-500',
                isDark
                  ? 'bg-gray-800 border-gray-600 text-gray-200 placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400',
              )}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={keywords.length === 0 || loading}
            className="px-2 py-1 text-xs rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            title={t('search.searchButtonTooltip')}
          >
            {loading ? <Loader2 size={10} className="animate-spin" /> : <Search size={10} />}
            {t('search.searchButton')}
          </button>
          <button
            onClick={() => selectedProject && loadStructure(selectedProject.name)}
            title={t('search.refreshTooltip')}
            className={clsx(
              'px-1.5 py-1 text-xs rounded border',
              isDark
                ? 'border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-400'
                : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-600',
            )}
          >
            <RefreshCw size={12} />
          </button>
        </div>

        {/* Tab 切换 + 文件类型过滤 */}
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('filename')}
              className={clsx(
                'flex-1 px-2 py-1 text-xs rounded border transition-colors',
                activeTab === 'filename'
                  ? isDark
                    ? 'bg-primary-900/40 border-primary-700 text-primary-200 font-medium'
                    : 'bg-primary-50 border-primary-400 text-primary-700 font-medium'
                  : isDark
                    ? 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
              )}
            >
              {t('search.filenameTab')}
            </button>
            <button
              onClick={() => setActiveTab('content')}
              className={clsx(
                'flex-1 px-2 py-1 text-xs rounded border transition-colors',
                activeTab === 'content'
                  ? isDark
                    ? 'bg-primary-900/40 border-primary-700 text-primary-200 font-medium'
                    : 'bg-primary-50 border-primary-400 text-primary-700 font-medium'
                  : isDark
                    ? 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50',
              )}
            >
              {t('search.contentTab')}
            </button>
          </div>
          {/* 文件类型过滤 chips */}
          {selectedProject && (
            <div className="flex flex-wrap gap-1 pt-1">
              {FILE_TYPE_FILTERS.map((f) => (
                <span key={f.key} onClick={() => toggleType(f.key)} className={typeChipClass(f.key)}>
                  {t(f.label)}
                </span>
              ))}
              {selectedTypes.size > 0 && (
                <span
                  onClick={() => setSelectedTypes(new Set())}
                  className={clsx(
                    'px-2 py-0.5 text-[10px] rounded border transition-colors cursor-pointer',
                    isDark
                      ? 'text-gray-500 border-gray-600 hover:text-gray-300'
                      : 'text-gray-500 border-gray-300 hover:text-gray-700',
                  )}
                >
                  {t('search.clearFilter')}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 搜索结果 */}
      <div className={clsx('flex-1 overflow-auto', isDark ? 'bg-gray-900' : 'bg-white')}>
        {!selectedProject ? (
          <EmptyState
            icon="search"
            title={t('search.noProjectSelected')}
            description={t('search.noProjectHint')}
          />
        ) : keywords.length === 0 ? (
          <EmptyState
            icon="search"
            title={t('search.enterKeyword')}
            description={
              activeTab === 'filename'
                ? t('search.searchByFilename')
                : t('search.searchByContent')
            }
          />
        ) : loading ? (
          <div className={clsx('flex flex-col items-center justify-center p-8 text-xs gap-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
            <Loader2 size={16} className="animate-spin" />
            <span>{t('search.searchingContent')}</span>
          </div>
        ) : activeTab === 'filename' ? (
          filenameResults.length === 0 ? (
            <EmptyState icon="search" title={t('search.noFilenameMatches')} description={t('search.noFilenameMatchesDesc', { keyword })} />
          ) : (
            <div className="py-1">
              <div
                className={clsx(
                  'px-3 py-1 text-xs border-b',
                  isDark
                    ? 'text-gray-400 bg-gray-800/60 border-gray-700'
                    : 'text-gray-500 bg-gray-50 border-gray-200',
                )}
              >
                {t('search.filenameMatchesCount', { count: filenameResults.length })}
              </div>
              {filenameResults.map((item) => (
                <button
                  key={item.file.path}
                  onClick={() => handleFileClick(item.file)}
                  className={clsx(
                    'w-full flex items-start gap-2 px-3 py-1.5 text-xs text-start',
                    isDark
                      ? 'text-gray-200 hover:bg-gray-800'
                      : 'text-gray-700 hover:bg-gray-100',
                  )}
                >
                  <FileText
                    size={12}
                    className={clsx('shrink-0 mt-0.5', isDark ? 'text-gray-500' : 'text-gray-400')}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{renderHighlightedText(item.file.name)}</div>
                    <div
                      className={clsx(
                        'truncate text-[10px] mt-0.5',
                        isDark ? 'text-gray-500' : 'text-gray-400',
                      )}
                    >
                      {item.relativePath || item.file.path}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : contentResults.length === 0 ? (
          <EmptyState icon="search" title={t('search.noContentMatches')} description={t('search.noContentMatchesDesc', { keyword })} />
        ) : (
          <div className="py-1">
            <div
              className={clsx(
                'px-3 py-1 text-xs border-b',
                isDark
                  ? 'text-gray-400 bg-gray-800/60 border-gray-700'
                  : 'text-gray-500 bg-gray-50 border-gray-200',
              )}
            >
              {t('search.contentMatchesCount', { count: contentResults.length, files: groupedContent.length })}
            </div>
            {groupedContent.map((group) => {
              const isCollapsed = collapsedGroups.has(group.file.path)
              return (
                <div
                  key={group.file.path}
                  className={clsx('border-b', isDark ? 'border-gray-800' : 'border-gray-100')}
                >
                  <button
                    onClick={() => {
                      const next = new Set(collapsedGroups)
                      if (isCollapsed) next.delete(group.file.path)
                      else next.add(group.file.path)
                      setCollapsedGroups(next)
                    }}
                    className={clsx(
                      'w-full flex items-center gap-1.5 px-3 py-1 text-xs text-start',
                      isDark ? 'text-gray-300 hover:bg-gray-800/70' : 'text-gray-700 hover:bg-gray-100',
                    )}
                  >
                    {isCollapsed ? (
                      <ChevronRight size={11} className="shrink-0" />
                    ) : (
                      <ChevronDown size={11} className="shrink-0" />
                    )}
                    <FileText
                      size={12}
                      className={clsx('shrink-0', isDark ? 'text-gray-500' : 'text-gray-400')}
                    />
                    <span className="flex-1 truncate font-medium">{group.file.name}</span>
                    <span className={clsx('shrink-0 text-[10px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
                      {group.matches.length} {t('search.matchCountSuffix')}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div>
                      <div
                        className={clsx(
                          'px-3 pb-1 text-[10px] truncate',
                          isDark ? 'text-gray-500' : 'text-gray-400',
                        )}
                      >
                        {group.relativePath || group.file.path}
                      </div>
                      {group.matches.map((item, idx) => (
                        <button
                          key={`${item.file.path}-${item.lineNum}-${idx}`}
                          onClick={() => handleFileClick(item.file)}
                          className={clsx(
                            'w-full flex items-start gap-2 ps-8 pe-3 py-1.5 text-xs text-start',
                            isDark ? 'text-gray-300 hover:bg-gray-800/70' : 'text-gray-600 hover:bg-gray-50',
                          )}
                        >
                          <span className={clsx('shrink-0 text-[10px] font-mono', isDark ? 'text-gray-500' : 'text-gray-400')}>
                            L{item.lineNum}
                          </span>
                          <div
                            className={clsx(
                              'flex-1 min-w-0 truncate font-mono text-[11px] rounded px-1.5 py-0.5',
                              isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-700',
                            )}
                          >
                            {renderHighlightedText(item.lineText)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
})
