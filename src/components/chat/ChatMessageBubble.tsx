import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'
import { User, Bot, Copy, Check, Save, X } from 'lucide-react'
import { useState, useCallback, useMemo } from 'react'
import type { ChatMessage } from '@/types/chat'
import { formatFileSize } from '@/types/chat'
import { AttachmentPreview } from './AttachmentPreview'
import { PlanDisplay } from './PlanDisplay'
import type { PlanStep } from './PlanDisplay'

interface ChatMessageBubbleProps {
  message: ChatMessage
  isDark: boolean
  fontSizeClass?: string
}

/** 从消息内容中解析 📋 执行计划 / Execution Plan */
function parsePlanSteps(content: string): { steps: PlanStep[]; cleanedContent: string } {
  const planHeaderRx = /📋\s*(?:执行计划|Execution Plan)[:：]?\s*/g
  const headerMatch = planHeaderRx.exec(content)
  if (!headerMatch) return { steps: [], cleanedContent: content }

  const afterHeader = content.slice(headerMatch.index + headerMatch[0].length)
  const lines = afterHeader.split('\n')
  const planLines: string[] = []
  let nonPlanStart = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 匹配 "1. xxx — 使用工具: tool" 或 "1. xxx - tool" 格式
    if (/^\d+[.、)]\s/.test(line.trim()) && /[—\-]\s*(?:使用工具[:：]?\s*)?\w+/.test(line)) {
      planLines.push(line)
    } else if (line.trim() === '') {
      continue // 跳过空行
    } else {
      nonPlanStart = i
      break
    }
  }

  if (planLines.length === 0) return { steps: [], cleanedContent: content }

  const steps: PlanStep[] = planLines.map((line) => {
    const stepMatch = line.match(/^(\d+)[.、)]\s*(.+?)\s*[—\-]\s*(?:使用工具[:：]?\s*)?(\S+)/)
    if (stepMatch) {
      return {
        step: parseInt(stepMatch[1], 10),
        description: stepMatch[2].trim(),
        tool: stepMatch[3].trim(),
        status: 'done' as const,
      }
    }
    const simpleMatch = line.match(/^(\d+)[.、)]\s*(.+)/)
    return {
      step: simpleMatch ? parseInt(simpleMatch[1], 10) : 0,
      description: simpleMatch ? simpleMatch[2].trim() : line.trim(),
      tool: '',
      status: 'done' as const,
    }
  })

  // 从原始内容中移除计划部分
  const beforePlan = content.slice(0, headerMatch.index)
  const afterPlan = nonPlanStart >= 0 ? lines.slice(nonPlanStart).join('\n') : ''
  return {
    steps,
    cleanedContent: (beforePlan + '\n\n' + afterPlan).trim(),
  }
}

/** 检测 AI 是否建议保存为 Skill */
function detectSkillSuggestion(content: string): { skillName: string; skillContent: string } | null {
  // 匹配 "建议保存为 Skill: xxx" 或 "Save as Skill: xxx"
  const suggestRx = /(?:建议保存为\s*Skill|Save\s+as\s+Skill)[:：]\s*(\S+)/i
  const match = content.match(suggestRx)
  if (match) {
    return { skillName: match[1], skillContent: content }
  }
  // 匹配 ```skill 代码块
  const codeBlockRx = /```skill\s*\n([\s\S]*?)```/
  const cbMatch = content.match(codeBlockRx)
  if (cbMatch) {
    const lines = cbMatch[1].trim().split('\n')
    const name = lines[0]?.replace(/^#\s*/, '').trim() || 'unnamed'
    return { skillName: name, skillContent: cbMatch[1].trim() }
  }
  return null
}

export function ChatMessageBubble({ message, isDark, fontSizeClass = 'text-sm' }: ChatMessageBubbleProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [skillSaved, setSkillSaved] = useState(false)
  const [skillDismissed, setSkillDismissed] = useState(false)
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  const { steps, cleanedContent } = useMemo(
    () => (isUser || isSystem ? { steps: [], cleanedContent: message.content } : parsePlanSteps(message.content)),
    [message.content, isUser, isSystem],
  )

  const skillSuggestion = useMemo(
    () => (isUser || isSystem ? null : detectSkillSuggestion(cleanedContent)),
    [cleanedContent, isUser, isSystem],
  )

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }, [message.content])

  const handleSaveSkill = useCallback(async () => {
    if (!skillSuggestion) return
    try {
      await window.electron.aihub.saveSkill(skillSuggestion.skillName, skillSuggestion.skillContent)
      setSkillSaved(true)
    } catch {
      // 静默失败
    }
  }, [skillSuggestion])

  if (isSystem) {
    return (
      <div
        className={clsx(
          'px-4 py-2 text-xs text-center italic',
          isDark ? 'text-gray-500' : 'text-gray-400',
        )}
      >
        {message.content}
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'flex gap-3 px-4 py-3 group',
        isUser ? (isDark ? 'bg-gray-800/50' : 'bg-gray-50') : '',
      )}
    >
      {/* 头像 */}
      <div
        className={clsx(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5',
          isUser
            ? (isDark ? 'bg-blue-600' : 'bg-blue-500')
            : (isDark ? 'bg-emerald-600' : 'bg-emerald-500'),
        )}
      >
        {isUser ? (
          <User size={16} className="text-white" />
        ) : (
          <Bot size={16} className="text-white" />
        )}
      </div>

      {/* 消息内容 */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {/* 角色标签 */}
        <div className="flex items-center gap-2 mb-1">
          <span className={clsx('text-xs font-semibold', isDark ? 'text-gray-300' : 'text-gray-700')}>
            {isUser ? t('chat:role.user') : t('chat:role.assistant')}
          </span>
          <span className={clsx('text-[11px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
        </div>

        {/* 附件 */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {message.attachments.map((att) => (
              <AttachmentPreview key={att.id} attachment={att} isDark={isDark} compact />
            ))}
          </div>
        )}

        {/* 📋 执行计划展示 */}
        {steps.length > 0 && <PlanDisplay steps={steps} isDark={isDark} />}

        {/* Markdown 内容 */}
        <div
          className={clsx(
            'prose max-w-none',
            isDark ? 'prose-invert' : '',
            fontSizeClass,
            'prose-pre:rounded-lg prose-pre:text-xs prose-code:text-xs',
            'prose-headings:mt-3 prose-headings:mb-1',
            'prose-p:my-1 prose-ul:my-1 prose-ol:my-1',
            'prose-table:text-xs',
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {steps.length > 0 ? cleanedContent : message.content}
          </ReactMarkdown>
        </div>

        {/* Skill 保存提示 */}
        {skillSuggestion && !skillSaved && !skillDismissed && (
          <div
            className={clsx(
              'mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs',
              isDark
                ? 'border-blue-800 bg-blue-900/30 text-blue-300'
                : 'border-blue-200 bg-blue-50 text-blue-700',
            )}
          >
            <span className="flex-1">{t('chat:skill.savePrompt')}</span>
            <button
              onClick={handleSaveSkill}
              className={clsx(
                'flex items-center gap-0.5 px-2 py-0.5 rounded text-xs transition-colors',
                isDark
                  ? 'bg-blue-700 hover:bg-blue-600 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white',
              )}
            >
              <Save size={10} />
              {t('chat:skill.save')}
            </button>
            <button
              onClick={() => setSkillDismissed(true)}
              className={clsx(
                'flex items-center gap-0.5 px-2 py-0.5 rounded text-xs transition-colors',
                isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200',
              )}
            >
              <X size={10} />
              {t('chat:skill.ignore')}
            </button>
          </div>
        )}
        {skillSaved && (
          <div
            className={clsx(
              'mt-2 px-2.5 py-1 rounded text-xs',
              isDark ? 'text-green-400' : 'text-green-600',
            )}
          >
            {t('chat:skill.saved')}
          </div>
        )}

        {/* 工具调用信息 */}
        {message.metadata?.tools && message.metadata.tools.length > 0 && (
          <div className={clsx('mt-2 flex flex-wrap gap-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
            {message.metadata.tools.map((tool) => (
              <span
                key={tool}
                className={clsx(
                  'text-[11px] px-1.5 py-0.5 rounded',
                  isDark ? 'bg-gray-700' : 'bg-gray-200',
                )}
              >
                {tool}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 复制按钮 */}
      <button
        onClick={handleCopy}
        className={clsx(
          'shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity',
          isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500',
        )}
        title={t('common:app.copy')}
      >
        {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
      </button>
    </div>
  )
}
