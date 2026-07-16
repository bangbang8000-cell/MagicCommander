import { useState } from 'react'
import { Eye, ChevronDown, ChevronRight, FileText, X, GitCompare } from 'lucide-react'
import type { DryRunDeviceResult } from '@/types/render'
import clsx from 'clsx'

type WorkbenchDryRunResultsProps = {
  results: DryRunDeviceResult[]
  isDark: boolean
  onClear: () => void
}

export function WorkbenchDryRunResults({ results, isDark, onClear }: WorkbenchDryRunResultsProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [diffResults, setDiffResults] = useState<Record<string, string[]>>({})
  const [diffLoading, setDiffLoading] = useState<Set<string>>(new Set())

  const grouped = results.reduce<Record<string, DryRunDeviceResult[]>>((acc, r) => {
    const key = r.project
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDiff = async (project: string, device: string, content: string, format: string) => {
    const key = `${project}/${device}`
    if (diffResults[key]) {
      const next = { ...diffResults }
      delete next[key]
      setDiffResults(next)
      return
    }
    setDiffLoading((prev) => new Set(prev).add(key))
    try {
      const data = await window.electron.render.diffCompare(project, device, content, format) as any
      const lines = (data?.diff ?? ['(无法获取差异)']) as string[]
      setDiffResults((prev) => ({ ...prev, [key]: lines }))
    } catch {
      setDiffResults((prev) => ({ ...prev, [key]: ['(对比失败)'] }))
    } finally {
      setDiffLoading((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  if (results.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className={clsx('text-xs font-semibold flex items-center gap-1', isDark ? 'text-gray-200' : 'text-gray-700')}>
          <Eye size={12} /> 渲染预览 ({results.length})
        </h4>
        <button
          onClick={onClear}
          className={clsx('p-0.5 rounded', isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500')}
        >
          <X size={14} />
        </button>
      </div>

      {Object.entries(grouped).map(([project, devices]) => (
        <div key={project} className="space-y-1">
          <div className={clsx('text-[10px] font-medium px-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
            {project} ({devices.length})
          </div>
          {devices.map((d) => {
            const id = `${project}/${d.device}`
            const isExpanded = expanded.has(id)
            const diff = diffResults[id]
            const isLoadingDiff = diffLoading.has(id)
            const format = d.filename.endsWith('.cfg') ? 'device_sn' : 'device_name'
            return (
              <div key={id}>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => toggleExpand(id)}
                    className={clsx(
                      'flex items-center gap-1 flex-1 px-2 py-1 text-[11px] rounded transition-colors',
                      isExpanded
                        ? isDark
                          ? 'bg-primary-900/30 text-primary-200'
                          : 'bg-primary-50 text-primary-700'
                        : isDark
                          ? 'text-gray-300 hover:bg-gray-800'
                          : 'text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <FileText size={12} />
                    <span className="truncate">{d.device}</span>
                    <span className={clsx('text-[10px] ml-auto', isDark ? 'text-gray-500' : 'text-gray-400')}>
                      {d.role} / {d.filename}
                    </span>
                  </button>
                  <button
                    onClick={() => handleDiff(d.project, d.device, d.content, format)}
                    disabled={isLoadingDiff}
                    className={clsx(
                      'p-1 rounded text-[10px] transition-colors',
                      diff
                        ? isDark ? 'text-yellow-400 hover:bg-gray-700' : 'text-yellow-600 hover:bg-gray-100'
                        : isDark ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
                    )}
                    title="对比已有输出"
                  >
                    <GitCompare size={12} />
                  </button>
                </div>
                {isExpanded && (
                  <div className="mx-3 mb-1">
                    <pre
                      className={clsx(
                        'text-[10px] p-2 rounded overflow-auto max-h-64 whitespace-pre-wrap font-mono',
                        isDark ? 'bg-gray-800 text-gray-200 border border-gray-700' : 'bg-gray-50 text-gray-700 border border-gray-200',
                      )}
                    >
                      {d.content}
                    </pre>
                  </div>
                )}
                {diff && (
                  <div className="mx-3 mb-1">
                    <pre
                      className={clsx(
                        'text-[10px] p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap font-mono',
                        isDark ? 'bg-gray-800 text-gray-200 border border-gray-700' : 'bg-gray-50 text-gray-700 border border-gray-200',
                      )}
                    >
                      {diff.map((line, i) => {
                        let lineClass = ''
                        if (line.startsWith('+')) lineClass = isDark ? 'text-green-400' : 'text-green-600'
                        else if (line.startsWith('-')) lineClass = isDark ? 'text-red-400' : 'text-red-600'
                        else if (line.startsWith('@@')) lineClass = isDark ? 'text-blue-400' : 'text-blue-600'
                        return (
                          <span key={i} className={lineClass}>{line}{'\n'}</span>
                        )
                      })}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}