import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import clsx from 'clsx'

export interface PlanStep {
  step: number
  description: string
  tool: string
  status: 'pending' | 'running' | 'done' | 'error'
}

interface PlanDisplayProps {
  steps: PlanStep[]
  isDark?: boolean
}

export function PlanDisplay({ steps, isDark }: PlanDisplayProps) {
  const { t } = useTranslation()
  if (!steps || steps.length === 0) return null

  return (
    <div className={clsx(
      'rounded-lg border p-3 my-2 text-sm',
      isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
    )}>
      <div className="font-medium mb-2 text-xs uppercase tracking-wide text-gray-500">
        📋 {t('chat:plan.title', '执行计划')}
      </div>
      <div className="space-y-1.5">
        {steps.map((step) => (
          <div key={step.step} className="flex items-center gap-2">
            {step.status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
            {step.status === 'running' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />}
            {step.status === 'error' && <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
            {step.status === 'pending' && <Circle className="w-4 h-4 text-gray-400 flex-shrink-0" />}
            <span className={clsx(
              step.status === 'done' && 'line-through text-gray-500',
              step.status === 'error' && 'text-red-500',
              isDark ? 'text-gray-300' : 'text-gray-700'
            )}>
              {step.step}. {step.description}
            </span>
            {step.tool && (
              <code className={clsx(
                'text-xs px-1.5 py-0.5 rounded',
                isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-600'
              )}>
                {step.tool}
              </code>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}