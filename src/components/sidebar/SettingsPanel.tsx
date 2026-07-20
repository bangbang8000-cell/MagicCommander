import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { Settings, Cpu, Globe, Palette, Shield, Sun, Moon, Monitor, Check, Eye, EyeOff, Star, Play, RefreshCw, XCircle, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'

// Provider 目录（与后端 PROVIDER_CATALOG 保持一致）
const PROVIDER_CATALOG: Record<string, { name: string; baseUrl: string; models: string[]; defaultModel: string }> = {
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-v4-pro', 'deepseek-v4', 'deepseek-chat'],
    defaultModel: 'deepseek-v4-pro',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1'],
    defaultModel: 'gpt-5-mini',
  },
  claude: {
    name: 'Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-opus-4', 'claude-sonnet-4', 'claude-haiku-4'],
    defaultModel: 'claude-sonnet-4',
  },
  gemini: {
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-3.5-pro', 'gemini-3.5-flash'],
    defaultModel: 'gemini-3.5-pro',
  },
  qwen: {
    name: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen3.7-max', 'qwen3.7-plus'],
    defaultModel: 'qwen3.7-max',
  },
  glm: {
    name: 'GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-5.2', 'glm-5.1'],
    defaultModel: 'glm-5.2',
  },
  grok: {
    name: 'Grok',
    baseUrl: 'https://api.x.ai/v1',
    models: ['grok-4.5'],
    defaultModel: 'grok-4.5',
  },
  ollama: {
    name: 'Ollama (本地)',
    baseUrl: 'http://localhost:11434/v1',
    models: ['qwen3:latest', 'llama4:latest', 'deepseek-v4:latest'],
    defaultModel: 'qwen3:latest',
  },
  custom: {
    name: '自定义',
    baseUrl: '',
    models: [],
    defaultModel: '',
  },
}

const PROVIDER_KEYS = Object.keys(PROVIDER_CATALOG)

/**
 * 设置面板
 */
export function SettingsPanel() {
  const { t } = useTranslation()
  const isDark = useUIStore((s) => s.isDark)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)

  const aiConfig = useUIStore((s) => s.aiConfig)
  const setAIConfig = useUIStore((s) => s.setAIConfig)
  const setProviderConfig = useUIStore((s) => s.setProviderConfig)

  const [activeProvider, setActiveProvider] = useState('deepseek')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 测试连接
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // 获取模型
  const [fetchingModels, setFetchingModels] = useState(false)
  const [fetchedModels, setFetchedModels] = useState<string[]>([])

  const catalog = PROVIDER_CATALOG[activeProvider]
  const isOllama = activeProvider === 'ollama'
  const isCustom = activeProvider === 'custom'
  const isDefault = aiConfig.defaultProvider === activeProvider

  // 切换 Provider 时加载已有配置
  useEffect(() => {
    const saved = aiConfig.providers[activeProvider]
    setApiKey(saved?.apiKey || '')
    setModel(saved?.model || catalog.defaultModel)
    setBaseUrl(saved?.baseUrl || catalog.baseUrl)
    setShowKey(false)
    setSaved(false)
    setTestResult(null)
    setFetchedModels([])
  }, [activeProvider, aiConfig.providers, catalog.defaultModel, catalog.baseUrl])

  // 保存配置
  const handleSave = useCallback(async () => {
    if (!apiKey.trim() && !isOllama && !isCustom) return

    setSaving(true)
    try {
      // 1. 先保存到 ui.store (localStorage)，立即可用
      setProviderConfig(activeProvider, {
        apiKey: apiKey.trim(),
        model: model.trim() || catalog.defaultModel,
        baseUrl: baseUrl.trim() || catalog.baseUrl,
      })

      // 2. 尝试同步到 AI Hub 后端（如果 AI Hub 在运行）
      try {
        const status = await window.electron.aihub.status()
        if (status.running) {
          await window.electron.aihub.configureProvider(
            activeProvider,
            apiKey.trim(),
            model.trim() || catalog.defaultModel,
            baseUrl.trim() || catalog.baseUrl,
          )
        }
      } catch {
        // AI Hub 未运行，仅本地保存，不影响用户体验
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      console.error('Save provider config failed:', e)
    } finally {
      setSaving(false)
    }
  }, [activeProvider, apiKey, model, baseUrl, catalog, isOllama, isCustom, setProviderConfig])

  // 设置默认 Provider
  const handleSetDefault = useCallback(async () => {
    try {
      setAIConfig({ defaultProvider: activeProvider })
      try {
        await window.electron.aihub.setDefaultProvider(activeProvider)
      } catch {
        // AI Hub 未运行，仅本地保存
      }
    } catch (e: any) {
      console.error('Set default provider failed:', e)
    }
  }, [activeProvider, setAIConfig])

  // 测试连接
  const handleTestConnection = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.electron.aihub.testConnection(
        activeProvider,
        apiKey.trim(),
        baseUrl.trim() || catalog.baseUrl,
        model.trim() || catalog.defaultModel,
      )
      setTestResult({ ok: result.status === 'ok', msg: result.message })
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || '测试失败' })
    } finally {
      setTesting(false)
    }
  }, [activeProvider, apiKey, model, baseUrl, catalog])

  // 获取模型列表
  const handleFetchModels = useCallback(async () => {
    if (!baseUrl.trim() && !isOllama) return
    setFetchingModels(true)
    setFetchedModels([])
    try {
      const result = await window.electron.aihub.fetchModels(
        baseUrl.trim() || catalog.baseUrl,
        apiKey.trim(),
      )
      if (result.status === 'ok' && result.models.length > 0) {
        setFetchedModels(result.models)
      }
    } catch (e: any) {
      console.error('Fetch models failed:', e)
    } finally {
      setFetchingModels(false)
    }
  }, [baseUrl, apiKey, catalog, isOllama])

  const themeOptions: { value: 'light' | 'dark' | 'system'; icon: React.ReactNode; label: string }[] = [
    { value: 'light', icon: <Sun size={16} />, label: t('menu.lightMode') },
    { value: 'dark', icon: <Moon size={16} />, label: t('menu.darkMode') },
    { value: 'system', icon: <Monitor size={16} />, label: t('menu.systemMode') },
  ]

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Settings size={16} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
          <span className={clsx('text-sm font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>
            {t('common:settings.title')}
          </span>
        </div>

        {/* ===== AI 配置 ===== */}
        <div className={clsx('rounded-lg border', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50')}>
          <div className="flex items-start gap-3 p-3">
            <div className={clsx('mt-0.5', isDark ? 'text-gray-400' : 'text-gray-500')}>
              <Cpu size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className={clsx('text-sm font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>
                {t('common:settings.ai.title')}
              </h4>
              <p className={clsx('text-xs mt-0.5', isDark ? 'text-gray-500' : 'text-gray-400')}>
                {t('common:settings.ai.desc')}
              </p>

              {/* Provider 选择卡片 */}
              <div className="grid grid-cols-3 gap-1.5 mt-3">
                {PROVIDER_KEYS.map((key) => {
                  const cat = PROVIDER_CATALOG[key]
                  const saved = aiConfig.providers[key]
                  const isActive = activeProvider === key
                  const isConfigured = saved?.apiKey || key === 'ollama'
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveProvider(key)}
                      className={clsx(
                        'flex flex-col items-center gap-0.5 px-1.5 py-2 rounded-lg text-xs transition-all',
                        isActive
                          ? (isDark ? 'bg-blue-600 text-white ring-1 ring-blue-400' : 'bg-blue-500 text-white ring-1 ring-blue-300')
                          : isDark
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                      )}
                    >
                      <span className="font-medium text-[11px]">{cat.name}</span>
                      <span className="text-[10px] opacity-70">
                        {isConfigured ? '✓' : '—'}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* 当前 Provider 配置表单 */}
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={clsx('text-xs font-medium', isDark ? 'text-gray-300' : 'text-gray-600')}>
                    {catalog.name} 配置
                  </span>
                  {isDefault && (
                    <span className={clsx('text-[10px] px-1 py-0.5 rounded', isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700')}>
                      <Star size={10} className="inline mr-0.5" />
                      {t('common:settings.ai.default')}
                    </span>
                  )}
                </div>

                {/* 1. Base URL */}
                <div>
                  <label className={clsx('block text-[10px] mb-0.5', isDark ? 'text-gray-500' : 'text-gray-400')}>
                    {t('common:settings.ai.baseUrl')}
                  </label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={catalog.baseUrl || 'https://api.openai.com/v1'}
                    className={clsx(
                      'w-full px-2.5 py-1.5 rounded text-xs outline-none',
                      isDark
                        ? 'bg-gray-900 text-gray-100 placeholder-gray-600 focus:ring-1 focus:ring-blue-500'
                        : 'bg-white text-gray-900 placeholder-gray-400 focus:ring-1 focus:ring-blue-400 border border-gray-300',
                    )}
                  />
                </div>

                {/* 2. API Key */}
                {!isOllama && (
                  <div>
                    <label className={clsx('block text-[10px] mb-0.5', isDark ? 'text-gray-500' : 'text-gray-400')}>
                      {t('common:settings.ai.apiKey')}
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={t('common:settings.ai.apiKeyPlaceholder')}
                        className={clsx(
                          'w-full px-2.5 py-1.5 pr-8 rounded text-xs outline-none',
                          isDark
                            ? 'bg-gray-900 text-gray-100 placeholder-gray-600 focus:ring-1 focus:ring-blue-500'
                            : 'bg-white text-gray-900 placeholder-gray-400 focus:ring-1 focus:ring-blue-400 border border-gray-300',
                        )}
                      />
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className={clsx('absolute right-1.5 top-1/2 -translate-y-1/2', isDark ? 'text-gray-500' : 'text-gray-400')}
                      >
                        {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. Model */}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className={clsx('text-[10px]', isDark ? 'text-gray-500' : 'text-gray-400')}>
                      {t('common:settings.ai.model')}
                    </label>
                    <button
                      onClick={handleFetchModels}
                      disabled={fetchingModels || (!baseUrl.trim() && !isOllama)}
                      className={clsx(
                        'text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors',
                        fetchingModels
                          ? 'opacity-50 cursor-not-allowed'
                          : isDark
                            ? 'text-blue-400 hover:bg-gray-700'
                            : 'text-blue-500 hover:bg-blue-50',
                      )}
                      title={t('common:settings.ai.fetchModels')}
                    >
                      <RefreshCw size={10} className={fetchingModels ? 'animate-spin' : ''} />
                      {t('common:settings.ai.fetchModels')}
                    </button>
                  </div>
                  {isCustom ? (
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="gpt-4o"
                      className={clsx(
                        'w-full px-2.5 py-1.5 rounded text-xs outline-none',
                        isDark
                          ? 'bg-gray-900 text-gray-100 focus:ring-1 focus:ring-blue-500'
                          : 'bg-white text-gray-900 focus:ring-1 focus:ring-blue-400 border border-gray-300',
                      )}
                    />
                  ) : fetchedModels.length > 0 ? (
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className={clsx(
                        'w-full px-2.5 py-1.5 rounded text-xs outline-none',
                        isDark
                          ? 'bg-gray-900 text-gray-100 focus:ring-1 focus:ring-blue-500'
                          : 'bg-white text-gray-900 focus:ring-1 focus:ring-blue-400 border border-gray-300',
                      )}
                    >
                      <option value="">{t('common:settings.ai.selectModel')}</option>
                      {fetchedModels.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className={clsx(
                        'w-full px-2.5 py-1.5 rounded text-xs outline-none',
                        isDark
                          ? 'bg-gray-900 text-gray-100 focus:ring-1 focus:ring-blue-500'
                          : 'bg-white text-gray-900 focus:ring-1 focus:ring-blue-400 border border-gray-300',
                      )}
                    >
                      {catalog.models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 测试连接结果 */}
                {testResult && (
                  <div className={clsx(
                    'flex items-start gap-1.5 text-[10px] p-2 rounded',
                    testResult.ok
                      ? isDark ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700'
                      : isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700',
                  )}>
                    {testResult.ok ? <Check size={12} /> : <XCircle size={12} />}
                    <span>{testResult.msg}</span>
                  </div>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleSetDefault}
                    disabled={isDefault}
                    className={clsx(
                      'text-[10px] px-2 py-1 rounded transition-colors',
                      isDefault
                        ? 'opacity-40 cursor-not-allowed'
                        : isDark
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          : 'bg-gray-200 text-gray-600 hover:bg-gray-300',
                    )}
                  >
                    {isDefault ? t('common:settings.ai.isDefault') : t('common:settings.ai.setDefault')}
                  </button>

                  <button
                    onClick={handleTestConnection}
                    disabled={testing || (!apiKey.trim() && !isOllama)}
                    className={clsx(
                      'text-[10px] flex items-center gap-1 px-2 py-1 rounded transition-colors',
                      testing || (!apiKey.trim() && !isOllama)
                        ? 'opacity-40 cursor-not-allowed'
                        : isDark
                          ? 'bg-green-900/30 text-green-300 hover:bg-green-900/50'
                          : 'bg-green-100 text-green-700 hover:bg-green-200',
                    )}
                  >
                    {testing ? <RefreshCw size={10} className="animate-spin" /> : <Play size={10} />}
                    {t('common:settings.ai.testConnection')}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {saved && (
                    <span className={clsx('text-[10px] flex items-center gap-0.5', isDark ? 'text-green-400' : 'text-green-600')}>
                      <Check size={10} />
                      {t('common:settings.ai.saved')}
                    </span>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={saving || (!apiKey.trim() && !isOllama)}
                    className={clsx(
                      'px-3 py-1 rounded text-xs font-medium transition-colors',
                      saving || (!apiKey.trim() && !isOllama)
                        ? 'bg-blue-400 text-white cursor-not-allowed'
                        : 'bg-blue-500 text-white hover:bg-blue-600',
                    )}
                  >
                    {saving ? '...' : t('common:settings.ai.save')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== 外观 ===== */}
        <div className={clsx('rounded-lg border p-3', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50')}>
          <div className="flex items-start gap-3">
            <div className={clsx('mt-0.5', isDark ? 'text-gray-400' : 'text-gray-500')}>
              <Palette size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className={clsx('text-sm font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>
                {t('common:settings.appearance.title')}
              </h4>
              <p className={clsx('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-400')}>
                {t('common:settings.appearance.desc')}
              </p>
              <div className="flex gap-1.5 mt-3">
                {themeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={clsx(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-colors',
                      theme === opt.value
                        ? isDark
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-500 text-white'
                        : isDark
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          : 'bg-gray-200 text-gray-600 hover:bg-gray-300',
                    )}
                  >
                    {opt.icon}
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ===== 通用设置（即将推出）===== */}
        <div className={clsx('rounded-lg border p-3 opacity-60', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50')}>
          <div className="flex items-start gap-3">
            <div className={clsx('mt-0.5', isDark ? 'text-gray-400' : 'text-gray-500')}>
              <Globe size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className={clsx('text-sm font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>
                  {t('common:settings.general.title')}
                </h4>
                <span className={clsx(
                  'text-[10px] px-1.5 py-0.5 rounded',
                  isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-600',
                )}>
                  {t('common:settings.comingSoon')}
                </span>
              </div>
              <p className={clsx('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-400')}>
                {t('common:settings.general.desc')}
              </p>
            </div>
          </div>
        </div>

        {/* ===== 高级设置（即将推出）===== */}
        <div className={clsx('rounded-lg border p-3 opacity-60', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50')}>
          <div className="flex items-start gap-3">
            <div className={clsx('mt-0.5', isDark ? 'text-gray-400' : 'text-gray-500')}>
              <Shield size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className={clsx('text-sm font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>
                  {t('common:settings.advanced.title')}
                </h4>
                <span className={clsx(
                  'text-[10px] px-1.5 py-0.5 rounded',
                  isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-600',
                )}>
                  {t('common:settings.comingSoon')}
                </span>
              </div>
              <p className={clsx('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-400')}>
                {t('common:settings.advanced.desc')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}