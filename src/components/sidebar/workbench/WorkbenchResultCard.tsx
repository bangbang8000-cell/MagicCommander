import clsx from 'clsx'

type WorkbenchResultCardProps = {
  isRendering: boolean
  progress: number
  currentMessage: string
  errors: string[]
  isDark: boolean
}

export function WorkbenchResultCard({ isRendering, progress, currentMessage, errors, isDark }: WorkbenchResultCardProps) {
  if (!isRendering && errors.length === 0) return null

  return (
    <div className="space-y-2">
      {isRendering && (
        <div className="space-y-1.5">
          <div className={clsx('flex justify-between text-[10px]', isDark ? 'text-gray-400' : 'text-gray-600')}>
            <span className="truncate">{currentMessage || '处理中...'}</span>
            <span>{progress}%</span>
          </div>
          <div className={clsx('w-full rounded-full h-1.5', isDark ? 'bg-gray-700' : 'bg-gray-200')}>
            <div
              className="bg-primary-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
      {errors.length > 0 && (
        <div className="space-y-1">
          {errors.map((err, i) => (
            <div
              key={i}
              className={clsx(
                'text-[10px] px-2 py-1 rounded',
                isDark ? 'bg-red-900/40 text-red-300' : 'bg-red-50 text-red-600',
              )}
            >
              {err}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}