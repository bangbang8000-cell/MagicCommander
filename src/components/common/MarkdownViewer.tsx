import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useUIStore } from '@/stores/ui.store'
import { X, ChevronDown, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

interface MarkdownViewerProps {
  content: string
  title: string
  onClose: () => void
}

interface TocItem {
  level: number
  text: string
  id: string
}

export function MarkdownViewer({ content, title, onClose }: MarkdownViewerProps) {
  const isDark = useUIStore((s) => s.isDark)
  const [toc, setToc] = useState<TocItem[]>([])
  const [expanded, setExpanded] = useState(true)

  // 解析标题生成目录
  useEffect(() => {
    const headingRegex = /^(#{1,6})\s+(.+)$/gm
    const items: TocItem[] = []
    let match

    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length
      const text = match[2]
      const id = text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]+/g, '-')
      items.push({ level, text, id })
    }

    setToc(items)
  }, [content])

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className={clsx('fixed inset-0 z-50 flex', isDark ? 'bg-black/60' : 'bg-gray-900/40')} onClick={onClose}>
      <div
        className={clsx(
          'flex flex-col m-auto w-full max-w-5xl h-[85vh] rounded-lg shadow-2xl overflow-hidden',
          isDark ? 'bg-gray-800' : 'bg-white',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div
          className={clsx(
            'flex items-center justify-between px-4 py-3 border-b shrink-0',
            isDark ? 'border-gray-700' : 'border-gray-200',
          )}
        >
          <h2 className={clsx('text-base font-semibold', isDark ? 'text-gray-100' : 'text-gray-800')}>{title}</h2>
          <button
            onClick={onClose}
            className={clsx(
              'p-1.5 rounded transition-colors',
              isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500',
            )}
          >
            <X size={18} />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 目录侧边栏 */}
          {toc.length > 0 && (
            <div
              className={clsx(
                'w-56 shrink-0 border-e overflow-y-auto',
                isDark ? 'border-gray-700 bg-gray-900/30' : 'border-gray-200 bg-gray-50',
              )}
            >
              <div
                className={clsx(
                  'px-3 py-2 text-xs font-semibold uppercase tracking-wider cursor-pointer flex items-center gap-1',
                  isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700',
                )}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                目录
              </div>
              {expanded && (
                <nav className="px-2 pb-4">
                  {toc.map((item, index) => (
                    <button
                      key={index}
                      onClick={() => scrollToHeading(item.id)}
                      className={clsx(
                        'block w-full text-start text-xs py-1 px-2 rounded truncate transition-colors',
                        item.level === 1 ? 'font-semibold mt-1' : `ps-${(item.level - 1) * 3}`,
                        isDark
                          ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
                      )}
                      style={{ paddingLeft: `${item.level * 12}px` }}
                    >
                      {item.text}
                    </button>
                  ))}
                </nav>
              )}
            </div>
          )}

          {/* Markdown 内容 */}
          <div
            className={clsx(
              'flex-1 overflow-y-auto px-8 py-6 prose prose-sm max-w-none',
              isDark ? 'text-gray-300' : 'text-gray-700',
            )}
          >
            <style>{`
              .markdown-content h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid ${isDark ? '#374151' : '#e5e7eb'}; }
              .markdown-content h2 { font-size: 1.25rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.75rem; }
              .markdown-content h3 { font-size: 1.1rem; font-weight: 600; margin-top: 1.25rem; margin-bottom: 0.5rem; }
              .markdown-content h1, .markdown-content h2, .markdown-content h3 { ${isDark ? 'color: #f3f4f6;' : 'color: #111827;'} }
              .markdown-content p { margin-bottom: 0.75rem; line-height: 1.7; }
              .markdown-content ul, .markdown-content ol { margin-bottom: 0.75rem; padding-left: 1.5rem; }
              .markdown-content li { margin-bottom: 0.25rem; line-height: 1.6; }
              .markdown-content code { padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875em; }
              .markdown-content pre { padding: 1rem; border-radius: 0.5rem; overflow-x: auto; margin-bottom: 1rem; }
              .markdown-content pre code { padding: 0; background: transparent; }
              .markdown-content table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
              .markdown-content th, .markdown-content td { padding: 0.5rem 0.75rem; border: 1px solid ${isDark ? '#374151' : '#e5e7eb'}; }
              .markdown-content th { font-weight: 600; }
              .markdown-content hr { border: none; border-top: 1px solid ${isDark ? '#374151' : '#e5e7eb'}; margin: 1.5rem 0; }
              .markdown-content strong { font-weight: 600; }
              .markdown-content a { color: ${isDark ? '#60a5fa' : '#2563eb'}; text-decoration: underline; }
            `}</style>
            <div className="markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
