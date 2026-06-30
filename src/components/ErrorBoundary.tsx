import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('[ErrorBoundary] 捕获到未处理异常:', error, info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center bg-gray-50">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50">
            <AlertTriangle size={24} className="text-red-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">页面加载失败</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-md">渲染过程中发生错误，请尝试刷新页面</p>
            {this.state.error && (
              <details className="mt-3 text-left text-xs text-gray-500 bg-gray-50 rounded p-2 max-w-lg">
                <summary className="cursor-pointer hover:text-gray-700">错误详情</summary>
                <pre className="mt-2 whitespace-pre-wrap break-all">{this.state.error.message}</pre>
              </details>
            )}
          </div>
          <button
            onClick={this.handleReload}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          >
            <RefreshCw size={14} />
            刷新页面
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
