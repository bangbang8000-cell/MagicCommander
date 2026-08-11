import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './i18n'
// 本地打包 Monaco（替代 CDN 加载，规避 CSP 拦截导致编辑器永久"加载中"）
import './editor/monaco'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
