import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { getRandomQuote, resetQuoteIndex } from '@/config/networkQuotes'

interface LoadingScreenProps {
  isLoading: boolean
  stage?: number
}

const STAGE_LABELS = [
  '正在恢复状态...',
  '正在加载项目...',
  '正在恢复项目...',
  '正在恢复标签页...',
]

export function LoadingScreen({ isLoading, stage = 0 }: LoadingScreenProps) {
  // 组件挂载时立即可见，isLoading 控制是否淡出
  const [currentQuote, setCurrentQuote] = useState('')
  const [fadeQuote, setFadeQuote] = useState(false)

  // 重置名言索引（组件首次挂载时）
  useEffect(() => {
    resetQuoteIndex()
    // 挂载时立即获取第一句名言
    const { quote } = getRandomQuote()
    setCurrentQuote(quote)
  }, [])

  // 获取当前名言（随阶段变化）
  useEffect(() => {
    if (stage > 0) {
      const { quote } = getRandomQuote()
      setFadeQuote(true)
      setTimeout(() => {
        setCurrentQuote(quote)
        setFadeQuote(false)
      }, 300)
    }
  }, [stage])

  const progress = stage > 0 ? ((stage - 1) / 4) * 100 : 0

  return (
    <div className={clsx(
      'fixed inset-0 z-[9998] flex items-center justify-center transition-opacity duration-300',
      isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'
    )}>
      {/* 背景渐变 */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-gray-100 to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900" />

      <div className="relative flex flex-col items-center gap-6 max-w-md px-8">
        {/* Logo */}
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-xl shadow-primary-500/30 animate-pulse">
            <span className="text-3xl font-bold text-white">M</span>
          </div>
          {/* 呼吸光环 */}
          <div className="absolute inset-0 rounded-2xl bg-primary-500/20 animate-ping" />
        </div>

        {/* 标题 */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">MagicCommander</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">网络设备配置管理工具</p>
        </div>

        {/* 进度条 */}
        <div className="w-64 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 via-primary-400 to-primary-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: isLoading ? `${Math.min(progress + 10, 90)}%` : '100%' }}
          />
        </div>

        {/* 进度阶段文字 */}
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {isLoading ? STAGE_LABELS[stage - 1] || '正在启动...' : '准备就绪'}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {stage}/4
          </p>
        </div>

        {/* 分隔线 */}
        <div className="w-48 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />

        {/* 名言区域 */}
        <div className={clsx(
          'text-center max-w-sm transition-all duration-300',
          fadeQuote ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
        )}>
          <div className="relative px-4 py-3">
            {/* 引号装饰 */}
            <span className="absolute -top-2 -left-1 text-4xl text-primary-300 dark:text-primary-700 opacity-50 font-serif">"</span>

            <p className="text-sm text-gray-600 dark:text-gray-400 italic leading-relaxed px-4">
              {currentQuote || '网络的世界里，没有到达不了的远方...'}
            </p>

            <span className="absolute -bottom-4 -right-1 text-4xl text-primary-300 dark:text-primary-700 opacity-50 font-serif rotate-180">"</span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
            — 网络工程师箴言
          </p>
        </div>

        {/* 底部加载指示 */}
        <div className="flex items-center gap-2 mt-4">
          <div className="w-2 h-2 rounded-full bg-primary-500 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary-300 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}
