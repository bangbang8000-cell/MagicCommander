import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

/**
 * 本地打包 Monaco，替代 @monaco-editor/react 默认的 CDN 加载。
 *
 * 背景：@monaco-editor/react（底层 @monaco-editor/loader）默认从 jsDelivr CDN
 * （https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs）动态注入 <script> 拉取
 * monaco-editor。v3.6.0 新增的 CSP（script-src 'self'）会拦截该外部脚本，导致所有依赖
 * Monaco 的文本 / .j2 / .yaml 编辑器永久停留在"加载中"，而 Excel 表格（独立组件）不受影响。
 *
 * 本模块将 monaco-editor 直接打包进本地 bundle 并通过 loader.config() 注入：
 * - 离线可用（无需网络访问 CDN）
 * - 符合 CSP（同源脚本与 worker 均允许）
 * - worker 通过 Vite `?worker` 打包，保证语法高亮 / 补全 / JSON 编辑正常
 */
const monacoEnv = self as unknown as { MonacoEnvironment?: monaco.Environment }

monacoEnv.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    // JSON 使用专用 worker；其余语言（plaintext/yaml/jinja/ini/markdown 等）走通用编辑器 worker
    if (label === 'json') return new jsonWorker()
    return new editorWorker()
  },
}

loader.config({ monaco })
