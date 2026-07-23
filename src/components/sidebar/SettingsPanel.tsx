import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import { useUIStore } from '@/stores/ui.store'
import { usePlatformStore } from '@/stores/platform.store'
import { Settings, Cpu, Globe, Palette, Shield, Sun, Moon, Monitor, Check, Eye, EyeOff, Star, Play, RefreshCw, XCircle, FolderOpen, Wrench, Info } from 'lucide-react'
import clsx from 'clsx'
import { LOCALE_NAMES, LANGUAGE_ICON_CHARS } from '@/i18n/resources'
import type { SupportedLocale } from '@/i18n/resources'

// Provider 目录
const PROVIDER_CATALOG: Record<string, { name: string; baseUrl: string; models: string[]; defaultModel: string }> = {
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-v4-pro', 'deepseek-v4', 'deepseek-chat'], defaultModel: 'deepseek-v4-pro' },
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1'], defaultModel: 'gpt-5-mini' },
  claude: { name: 'Claude', baseUrl: 'https://api.anthropic.com/v1', models: ['claude-opus-4', 'claude-sonnet-4', 'claude-haiku-4'], defaultModel: 'claude-sonnet-4' },
  gemini: { name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-3.5-pro', 'gemini-3.5-flash'], defaultModel: 'gemini-3.5-pro' },
  qwen: { name: 'Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen3.7-max', 'qwen3.7-plus'], defaultModel: 'qwen3.7-max' },
  glm: { name: 'GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-5.2', 'glm-5.1'], defaultModel: 'glm-5.2' },
  grok: { name: 'Grok', baseUrl: 'https://api.x.ai/v1', models: ['grok-4.5'], defaultModel: 'grok-4.5' },
  ollama: { name: 'Ollama (本地)', baseUrl: 'http://localhost:11434/v1', models: ['qwen3:latest', 'llama4:latest', 'deepseek-v4:latest'], defaultModel: 'qwen3:latest' },
  custom: { name: '自定义', baseUrl: '', models: [], defaultModel: '' },
}

const PROVIDER_KEYS = Object.keys(PROVIDER_CATALOG)
type SettingsTab = 'general' | 'ai' | 'platform' | 'advanced' | 'about'

const TAB_CONFIG: { id: SettingsTab; icon: React.ReactNode; labelKey: string }[] = [
  { id: 'general', icon: <Globe size={14} />, labelKey: 'cloud:settings.general' },
  { id: 'ai', icon: <Cpu size={14} />, labelKey: 'cloud:settings.ai' },
  { id: 'platform', icon: <Globe size={14} />, labelKey: 'cloud:settings.platform' },
  { id: 'advanced', icon: <Wrench size={14} />, labelKey: 'cloud:settings.advanced' },
  { id: 'about', icon: <Info size={14} />, labelKey: 'cloud:settings.about' },
]

export function SettingsPanel() {
  const { t } = useTranslation()
  const isDark = useUIStore((s) => s.isDark)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)

  const aiConfig = useUIStore((s) => s.aiConfig)
  const setAIConfig = useUIStore((s) => s.setAIConfig)
  const setProviderConfig = useUIStore((s) => s.setProviderConfig)

  const language = useUIStore((s) => s.language)
  const setLanguage = useUIStore((s) => s.setLanguage)
  const generalSettings = useUIStore((s) => s.generalSettings)
  const setGeneralSettings = useUIStore((s) => s.setGeneralSettings)
  const advancedSettings = useUIStore((s) => s.advancedSettings)
  const setAdvancedSettings = useUIStore((s) => s.setAdvancedSettings)
  const autonomyMode = useUIStore((s) => s.autonomyMode)
  const setAutonomyMode = useUIStore((s) => s.setAutonomyMode)

  // Tab state
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  // AI Provider state
  const [activeProvider, setActiveProvider] = useState('deepseek')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [fetchingModels, setFetchingModels] = useState(false)
  const [fetchedModels, setFetchedModels] = useState<string[]>([])

  // General state
  const [langDropdownOpen, setLangDropdownOpen] = useState(false)
  const [workspacePath, setWorkspacePath] = useState('')

  // Platform state
  const platformBaseUrl = usePlatformStore((s) => s.baseUrl)
  const setPlatformBaseUrl = usePlatformStore((s) => s.setBaseUrl)
  const platformLoggedIn = usePlatformStore((s) => s.loggedIn)
  const platformUsername = usePlatformStore((s) => s.username)
  const [platformUrl, setPlatformUrl] = useState(platformBaseUrl)
  const [testingPlatform, setTestingPlatform] = useState(false)
  const [platformTestResult, setPlatformTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Advanced state
  const [updateStatus, setUpdateStatus] = useState<string>('')
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  const BUILD = '26082301'
  const VERSION = '3.5.0'

  // 获取工作区路径
  useEffect(() => {
    const fetchWorkspacePath = async () => {
      try {
        const path = await window.electron.app.getPath('workspace')
        setWorkspacePath(path)
      } catch { /* ignore */ }
    }
    fetchWorkspacePath()
  }, [])

  const ensureAIHubReady = useCallback(async (): Promise<string | null> => {
    try {
      const status = await window.electron.aihub.status()
      if (!status.running && !status.installing) {
        await window.electron.aihub.start()
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 1000))
          const s = await window.electron.aihub.status()
          if (s.running) break
        }
      }
      const finalStatus = await window.electron.aihub.status()
      if (!finalStatus.running) {
        return finalStatus.lastError || t('common:settings.ai.hubTimeout')
      }
      const configs = Object.entries(aiConfig.providers)
        .filter(([, cfg]) => cfg.apiKey)
        .map(([key, cfg]) => ({ provider: key, apiKey: cfg.apiKey, model: cfg.model || '', baseUrl: cfg.baseUrl || '' }))
      if (configs.length > 0) {
        await window.electron.aihub.syncProviders(configs, aiConfig.defaultProvider)
      }
      return null
    } catch (e: any) {
      return e?.message || t('common:settings.ai.hubFailed')
    }
  }, [aiConfig.providers, aiConfig.defaultProvider])

  const catalog = PROVIDER_CATALOG[activeProvider]
  const isOllama = activeProvider === 'ollama'
  const isCustom = activeProvider === 'custom'
  const isDefault = aiConfig.defaultProvider === activeProvider

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

  const handleSave = useCallback(async () => {
    if (!apiKey.trim() && !isOllama && !isCustom) return
    setSaving(true)
    try {
      setProviderConfig(activeProvider, { apiKey: apiKey.trim(), model: model.trim() || catalog.defaultModel, baseUrl: baseUrl.trim() || catalog.baseUrl })
      try {
        const status = await window.electron.aihub.status()
        if (status.running) {
          await window.electron.aihub.configureProvider(activeProvider, apiKey.trim(), model.trim() || catalog.defaultModel, baseUrl.trim() || catalog.baseUrl)
        }
      } catch { /* AI Hub 未运行 */ }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      console.error('Save provider config failed:', e)
    } finally { setSaving(false) }
  }, [activeProvider, apiKey, model, baseUrl, catalog, isOllama, isCustom, setProviderConfig])

  const handleSetDefault = useCallback(async () => {
    try {
      setAIConfig({ defaultProvider: activeProvider })
      try { await window.electron.aihub.setDefaultProvider(activeProvider) } catch { /* ignore */ }
    } catch (e: any) { console.error('Set default provider failed:', e) }
  }, [activeProvider, setAIConfig])

  const handleTestConnection = useCallback(async () => {
    setTesting(true); setTestResult(null)
    try {
      const err = await ensureAIHubReady()
      if (err) { setTestResult({ ok: false, msg: err }); return }
      const result = await window.electron.aihub.testConnection(activeProvider, apiKey.trim(), baseUrl.trim() || catalog.baseUrl, model.trim() || catalog.defaultModel)
      setTestResult({ ok: result.status === 'ok', msg: result.message })
    } catch (e: any) { setTestResult({ ok: false, msg: e.message || t('common:settings.ai.testFailed') }) }
    finally { setTesting(false) }
  }, [activeProvider, apiKey, model, baseUrl, catalog, ensureAIHubReady])

  const handleFetchModels = useCallback(async () => {
    if (!baseUrl.trim() && !isOllama) return
    setFetchingModels(true); setFetchedModels([])
    try {
      const err = await ensureAIHubReady()
      if (err) { console.error('AI Hub not ready:', err); return }
      const result = await window.electron.aihub.fetchModels(baseUrl.trim() || catalog.baseUrl, apiKey.trim())
      if (result.status === 'ok' && result.models.length > 0) setFetchedModels(result.models)
    } catch (e: any) { console.error('Fetch models failed:', e) }
    finally { setFetchingModels(false) }
  }, [baseUrl, apiKey, catalog, isOllama, ensureAIHubReady])

  const handleLanguageChange = useCallback((locale: string) => { setLanguage(locale); setLangDropdownOpen(false) }, [setLanguage])

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true); setUpdateStatus('')
    try {
      await window.electron.app.checkUpdate()
      const unsub = window.electron.app.onUpdateStatus((status) => {
        setUpdateStatus(status.status === 'available' ? 'newVersion' : 'latest')
        setCheckingUpdate(false); unsub()
      })
    } catch { setUpdateStatus('latest'); setCheckingUpdate(false) }
  }, [])

  const handleTestPlatformConnection = useCallback(async () => {
    if (!platformUrl.trim()) return
    setTestingPlatform(true); setPlatformTestResult(null)
    try {
      const res = await fetch(`${platformUrl.replace(/\/+$/, '')}/api/v1/health`)
      if (res.ok) {
        const data = await res.json()
        setPlatformTestResult({ ok: true, msg: `连接成功 - ${data.service || 'MagicCommander Platform'} ${data.version || ''}` })
        setPlatformBaseUrl(platformUrl.trim())
      } else { setPlatformTestResult({ ok: false, msg: `服务器返回错误: ${res.status}` }) }
    } catch (e: any) { setPlatformTestResult({ ok: false, msg: `无法连接: ${e.message || '网络错误'}` }) }
    finally { setTestingPlatform(false) }
  }, [platformUrl, setPlatformBaseUrl])

  const handleOpenWorkspace = useCallback(async () => {
    try { await window.electron.shell.showItemInFolder(workspacePath) } catch { /* ignore */ }
  }, [workspacePath])

  const themeOptions: { value: 'light' | 'dark' | 'system'; icon: React.ReactNode; label: string }[] = [
    { value: 'light', icon: <Sun size={16} />, label: t('menu.lightMode') },
    { value: 'dark', icon: <Moon size={16} />, label: t('menu.darkMode') },
    { value: 'system', icon: <Monitor size={16} />, label: t('menu.systemMode') },
  ]

  // ===== 渲染各 Tab 内容 =====

  const renderGeneralTab = () => (
    <div className="space-y-3">
      {/* 外观 */}
      <div className={clsx('rounded-lg border p-3', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50')}>
        <div className="flex items-start gap-3">
          <div className={clsx('mt-0.5', isDark ? 'text-gray-400' : 'text-gray-500')}><Palette size={16} /></div>
          <div className="flex-1 min-w-0">
            <h4 className={clsx('text-sm font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>{t('common:settings.appearance.title')}</h4>
            <div className="flex gap-1.5 mt-2">
              {themeOptions.map((opt) => (
                <button key={opt.value} onClick={() => setTheme(opt.value)}
                  className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-colors',
                    theme === opt.value ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white') : (isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'))}>
                  {opt.icon}<span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 通用设置 */}
      <div className={clsx('rounded-lg border p-3', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50')}>
        <div className="flex items-start gap-3">
          <div className={clsx('mt-0.5', isDark ? 'text-gray-400' : 'text-gray-500')}><Globe size={16} /></div>
          <div className="flex-1 min-w-0 space-y-3">
            <h4 className={clsx('text-sm font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>{t('common:settings.general.title')}</h4>

            {/* 语言 */}
            <div className="flex items-center justify-between">
              <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>{t('common:settings.general.language')}</span>
              <div className="relative">
                <button onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                  className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border', isDark ? 'border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-100')}>
                  <span className="text-xs font-bold">{LANGUAGE_ICON_CHARS[language as keyof typeof LANGUAGE_ICON_CHARS] || 'A'}</span>
                  <span>{LOCALE_NAMES[language as keyof typeof LOCALE_NAMES] || language}</span>
                </button>
                {langDropdownOpen && (
                  <div className={clsx('absolute right-0 top-full mt-1 w-40 rounded-lg border shadow-lg z-50 max-h-60 overflow-y-auto', isDark ? 'border-gray-600 bg-gray-800' : 'border-gray-200 bg-white')}>
                    {Object.entries(LOCALE_NAMES).map(([locale, name]) => (
                      <button key={locale} onClick={() => handleLanguageChange(locale)}
                        className={clsx('w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2', locale === language ? (isDark ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-600') : (isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'))}>
                        <span className="text-xs font-bold w-5 text-center">{LANGUAGE_ICON_CHARS[locale as keyof typeof LANGUAGE_ICON_CHARS]}</span>
                        <span>{name}</span>
                        {locale === language && <Check size={12} className="ml-auto" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 字体大小 */}
            <div>
              <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>{t('common:settings.general.fontSize')}</span>
              <select value={generalSettings.fontSize || 'medium'} onChange={(e) => setGeneralSettings({ fontSize: e.target.value as 'small' | 'medium' | 'large' })}
                className={clsx('w-full mt-1 px-2 py-1 rounded text-xs border', isDark ? 'border-gray-600 bg-gray-700 text-gray-200' : 'border-gray-300 bg-white text-gray-700')}>
                <option value="small">{t('common:settings.general.fontSmall')}</option>
                <option value="medium">{t('common:settings.general.fontMedium')}</option>
                <option value="large">{t('common:settings.general.fontLarge')}</option>
              </select>
            </div>

            {/* 自动保存 */}
            <div className="flex items-center justify-between">
              <div>
                <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>{t('common:settings.general.autoSave')}</span>
                <p className={clsx('text-[11px]', isDark ? 'text-gray-600' : 'text-gray-400')}>{t('common:settings.general.autoSaveDesc')}</p>
              </div>
              <button onClick={() => setGeneralSettings({ autoSave: !generalSettings.autoSave })}
                className={clsx('w-9 h-5 rounded-full transition-colors relative', generalSettings.autoSave ? 'bg-blue-500' : (isDark ? 'bg-gray-600' : 'bg-gray-300'))}>
                <div className={clsx('w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform', generalSettings.autoSave ? 'translate-x-4' : 'translate-x-0.5')} />
              </button>
            </div>

            {generalSettings.autoSave && (
              <div className="flex items-center justify-between">
                <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>{t('common:settings.general.autoSaveInterval')}</span>
                <input type="number" min={5} max={300} value={generalSettings.autoSaveInterval} onChange={(e) => setGeneralSettings({ autoSaveInterval: Number(e.target.value) || 30 })}
                  className={clsx('w-16 px-2 py-1 rounded text-xs text-center border', isDark ? 'border-gray-600 bg-gray-700 text-gray-200' : 'border-gray-300 bg-white text-gray-700')} />
              </div>
            )}

            {/* 工作区路径 */}
            <div className="flex items-center justify-between">
              <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>{t('common:settings.general.workspacePath')}</span>
              <button onClick={handleOpenWorkspace}
                className={clsx('flex items-center gap-1 px-2 py-1 rounded text-xs', isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300')}>
                <FolderOpen size={12} />{t('common:settings.general.openWorkspace')}
              </button>
            </div>
            <p className={clsx('text-[11px] truncate', isDark ? 'text-gray-600' : 'text-gray-400')}>{workspacePath || '...'}</p>
          </div>
        </div>
      </div>
    </div>
  )

  const renderAITab = () => (
    <div className="space-y-3">
      {/* AI Provider 配置 */}
      <div className={clsx('rounded-lg border p-3', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50')}>
        <div className="flex items-start gap-3">
          <div className={clsx('mt-0.5', isDark ? 'text-gray-400' : 'text-gray-500')}><Cpu size={16} /></div>
          <div className="flex-1 min-w-0">
            <h4 className={clsx('text-sm font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>{t('common:settings.ai.title')}</h4>
            <p className={clsx('text-xs mt-0.5', isDark ? 'text-gray-500' : 'text-gray-400')}>{t('common:settings.ai.desc')}</p>

            {/* Provider 选择卡片 */}
            <div className="grid grid-cols-3 gap-1.5 mt-3">
              {PROVIDER_KEYS.map((key) => {
                const cat = PROVIDER_CATALOG[key]; const saved = aiConfig.providers[key]; const isActive = activeProvider === key; const isConfigured = saved?.apiKey || key === 'ollama'
                return (
                  <button key={key} onClick={() => setActiveProvider(key)}
                    className={clsx('flex flex-col items-center gap-0.5 px-1.5 py-2 rounded-lg text-xs transition-all', isActive ? (isDark ? 'bg-blue-600 text-white ring-1 ring-blue-400' : 'bg-blue-500 text-white ring-1 ring-blue-300') : (isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'))}>
                    <span className="font-medium text-[11px]">{cat.name}</span><span className="text-[11px] opacity-70">{isConfigured ? '✓' : '—'}</span>
                  </button>
                )
              })}
            </div>

            {/* Provider 配置表单 */}
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className={clsx('text-xs font-medium', isDark ? 'text-gray-300' : 'text-gray-600')}>{t('common:settings.ai.providerConfig', { name: catalog.name })}</span>
                {isDefault && <span className={clsx('text-[11px] px-1 py-0.5 rounded', isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700')}><Star size={10} className="inline mr-0.5" />{t('common:settings.ai.default')}</span>}
              </div>
              <div>
                <label className={clsx('block text-[11px] mb-0.5', isDark ? 'text-gray-500' : 'text-gray-400')}>{t('common:settings.ai.baseUrl')}</label>
                <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={catalog.baseUrl || 'https://api.openai.com/v1'}
                  className={clsx('w-full px-2.5 py-1.5 rounded text-xs outline-none', isDark ? 'bg-gray-900 text-gray-100 placeholder-gray-600 focus:ring-1 focus:ring-blue-500' : 'bg-white text-gray-900 placeholder-gray-400 focus:ring-1 focus:ring-blue-400 border border-gray-300')} />
              </div>
              {!isOllama && (
                <div>
                  <label className={clsx('block text-[11px] mb-0.5', isDark ? 'text-gray-500' : 'text-gray-400')}>{t('common:settings.ai.apiKey')}</label>
                  <div className="relative">
                    <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={t('common:settings.ai.apiKeyPlaceholder')}
                      className={clsx('w-full px-2.5 py-1.5 pr-8 rounded text-xs outline-none', isDark ? 'bg-gray-900 text-gray-100 placeholder-gray-600 focus:ring-1 focus:ring-blue-500' : 'bg-white text-gray-900 placeholder-gray-400 focus:ring-1 focus:ring-blue-400 border border-gray-300')} />
                    <button onClick={() => setShowKey(!showKey)} className={clsx('absolute right-1.5 top-1/2 -translate-y-1/2', isDark ? 'text-gray-500' : 'text-gray-400')}>{showKey ? <EyeOff size={12} /> : <Eye size={12} />}</button>
                  </div>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <label className={clsx('text-[11px]', isDark ? 'text-gray-500' : 'text-gray-400')}>{t('common:settings.ai.model')}</label>
                  <button onClick={handleFetchModels} disabled={fetchingModels || (!baseUrl.trim() && !isOllama)}
                    className={clsx('text-[11px] flex items-center gap-1 px-1.5 py-0.5 rounded', fetchingModels ? 'opacity-50 cursor-not-allowed' : (isDark ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-500 hover:bg-blue-50'))}>
                    <RefreshCw size={10} className={fetchingModels ? 'animate-spin' : ''} />{t('common:settings.ai.fetchModels')}
                  </button>
                </div>
                {isCustom ? (
                  <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o"
                    className={clsx('w-full px-2.5 py-1.5 rounded text-xs outline-none', isDark ? 'bg-gray-900 text-gray-100 focus:ring-1 focus:ring-blue-500' : 'bg-white text-gray-900 focus:ring-1 focus:ring-blue-400 border border-gray-300')} />
                ) : fetchedModels.length > 0 ? (
                  <select value={model} onChange={(e) => setModel(e.target.value)}
                    className={clsx('w-full px-2.5 py-1.5 rounded text-xs outline-none', isDark ? 'bg-gray-900 text-gray-100 focus:ring-1 focus:ring-blue-500' : 'bg-white text-gray-900 focus:ring-1 focus:ring-blue-400 border border-gray-300')}>
                    <option value="">{t('common:settings.ai.selectModel')}</option>
                    {fetchedModels.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : (
                  <select value={model} onChange={(e) => setModel(e.target.value)}
                    className={clsx('w-full px-2.5 py-1.5 rounded text-xs outline-none', isDark ? 'bg-gray-900 text-gray-100 focus:ring-1 focus:ring-blue-500' : 'bg-white text-gray-900 focus:ring-1 focus:ring-blue-400 border border-gray-300')}>
                    {catalog.models.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
              </div>
              {testResult && (
                <div className={clsx('flex items-start gap-1.5 text-[11px] p-2 rounded', testResult.ok ? (isDark ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700') : (isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'))}>
                  {testResult.ok ? <Check size={12} /> : <XCircle size={12} />}<span>{testResult.msg}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-1.5">
                <button onClick={handleSetDefault} disabled={isDefault}
                  className={clsx('text-[11px] px-2 py-1 rounded', isDefault ? 'opacity-40 cursor-not-allowed' : (isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'))}>
                  {isDefault ? t('common:settings.ai.isDefault') : t('common:settings.ai.setDefault')}
                </button>
                <button onClick={handleTestConnection} disabled={testing || (!apiKey.trim() && !isOllama)}
                  className={clsx('text-[11px] flex items-center gap-1 px-2 py-1 rounded', testing || (!apiKey.trim() && !isOllama) ? 'opacity-40 cursor-not-allowed' : (isDark ? 'bg-green-900/30 text-green-300 hover:bg-green-900/50' : 'bg-green-100 text-green-700 hover:bg-green-200'))}>
                  {testing ? <RefreshCw size={10} className="animate-spin" /> : <Play size={10} />}{t('common:settings.ai.testConnection')}
                </button>
              </div>
              <div className="flex items-center gap-2">
                {saved && <span className={clsx('text-[11px] flex items-center gap-0.5', isDark ? 'text-green-400' : 'text-green-600')}><Check size={10} />{t('common:settings.ai.saved')}</span>}
                <button onClick={handleSave} disabled={saving || (!apiKey.trim() && !isOllama)}
                  className={clsx('px-3 py-1 rounded text-xs font-medium', saving || (!apiKey.trim() && !isOllama) ? 'bg-blue-400 text-white cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600')}>
                  {saving ? '...' : t('common:settings.ai.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 策略路由 */}
      <div className={clsx('rounded-lg border p-3', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50')}>
        <div className="flex items-start gap-3">
          <div className={clsx('mt-0.5', isDark ? 'text-gray-400' : 'text-gray-500')}><Shield size={16} /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <h4 className={clsx('text-sm font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>{t('common:settings.ai.routing')}</h4>
                <p className={clsx('text-xs mt-0.5', isDark ? 'text-gray-500' : 'text-gray-400')}>{t('common:settings.ai.routingDesc')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={aiConfig.routingEnabled} onChange={(e) => setAIConfig({ routingEnabled: e.target.checked })} className="sr-only peer" />
                <div className={clsx('w-8 h-4 rounded-full peer transition-colors', aiConfig.routingEnabled ? 'bg-blue-500' : (isDark ? 'bg-gray-600' : 'bg-gray-300'))}>
                  <div className={clsx('w-3 h-3 rounded-full bg-white transition-transform mt-0.5', aiConfig.routingEnabled ? 'translate-x-4 ml-0.5' : 'translate-x-0.5')} />
                </div>
              </label>
            </div>
            {aiConfig.routingEnabled && (
              <div className="mt-3 space-y-2">
                {(['code', 'analysis', 'simple', 'complex'] as const).map((taskType) => {
                  const rule = aiConfig.routingRules.find((r) => r.taskType === taskType)
                  const provider = rule?.provider || aiConfig.defaultProvider
                  const labels: Record<string, string> = { code: t('common:settings.ai.routingCode'), analysis: t('common:settings.ai.routingAnalysis'), simple: t('common:settings.ai.routingSimple'), complex: t('common:settings.ai.routingComplex') }
                  const descs: Record<string, string> = { code: t('common:settings.ai.routingCodeDesc'), analysis: t('common:settings.ai.routingAnalysisDesc'), simple: t('common:settings.ai.routingSimpleDesc'), complex: t('common:settings.ai.routingComplexDesc') }
                  return (
                    <div key={taskType} className="flex items-center gap-2">
                      <div className="w-24 shrink-0">
                        <span className={clsx('text-[11px] font-medium', isDark ? 'text-gray-300' : 'text-gray-600')}>{labels[taskType]}</span>
                        <p className={clsx('text-[11px]', isDark ? 'text-gray-500' : 'text-gray-400')}>{descs[taskType]}</p>
                      </div>
                      <select value={provider} onChange={(e) => {
                        const newRules = aiConfig.routingRules.map((r) => r.taskType === taskType ? { ...r, provider: e.target.value } : r)
                        const allTypes = ['code', 'analysis', 'simple', 'complex']; const merged = allTypes.map((t) => newRules.find((r) => r.taskType === t) || { taskType: t as any, provider: aiConfig.defaultProvider })
                        setAIConfig({ routingRules: merged })
                      }}
                        className={clsx('flex-1 px-2 py-1 rounded text-xs outline-none', isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700 border border-gray-300')}>
                        {PROVIDER_KEYS.filter((k) => aiConfig.providers[k]?.apiKey || k === 'ollama').map((k) => <option key={k} value={k}>{PROVIDER_CATALOG[k].name}</option>)}
                        {PROVIDER_KEYS.filter((k) => !aiConfig.providers[k]?.apiKey && k !== 'ollama').map((k) => <option key={k} value={k} disabled>{PROVIDER_CATALOG[k].name} ({t('common:settings.ai.notConfigured')})</option>)}
                      </select>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 自主模式 */}
      <div className={clsx('rounded-lg border p-3', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50')}>
        <div className="flex items-start gap-3">
          <div className={clsx('mt-0.5', isDark ? 'text-gray-400' : 'text-gray-500')}><Shield size={16} /></div>
          <div className="flex-1 min-w-0">
            <h4 className={clsx('text-sm font-medium mb-2', isDark ? 'text-gray-200' : 'text-gray-700')}>{t('common:settings.advanced.autonomyMode')}</h4>
            <p className={clsx('text-[11px] mb-1.5', isDark ? 'text-gray-600' : 'text-gray-400')}>{t('common:settings.advanced.autonomyModeDesc')}</p>
            <select value={autonomyMode} onChange={(e) => setAutonomyMode(e.target.value as 'advisor' | 'semi_auto' | 'full_auto')}
              className={clsx('w-full px-2 py-1 rounded text-xs border', isDark ? 'border-gray-600 bg-gray-700 text-gray-200' : 'border-gray-300 bg-white text-gray-700')}>
              <option value="advisor">{t('chat:autonomy.advisor')}</option>
              <option value="semi_auto">{t('chat:autonomy.semiAuto')}</option>
              <option value="full_auto">{t('chat:autonomy.fullAuto')}</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )

  const renderPlatformTab = () => (
    <div className="space-y-3">
      <div className={clsx('rounded-lg border p-3', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50')}>
        <div className="flex items-start gap-3">
          <div className={clsx('mt-0.5', isDark ? 'text-gray-400' : 'text-gray-500')}><Globe size={16} /></div>
          <div className="flex-1 min-w-0">
            <h4 className={clsx('text-sm font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>{t('common:settings.platform.title') || '平台连接'}</h4>
            <p className={clsx('text-xs mt-0.5', isDark ? 'text-gray-500' : 'text-gray-400')}>{t('common:settings.platform.desc') || '连接 MagicCommander Platform'}</p>
            <div className="mt-3 space-y-2">
              <div>
                <label className={clsx('text-[11px]', isDark ? 'text-gray-500' : 'text-gray-400')}>{t('common:settings.platform.serverUrl') || '服务器地址'}</label>
                <div className="flex gap-1.5 mt-0.5">
                  <input type="text" value={platformUrl} onChange={(e) => { setPlatformUrl(e.target.value); setPlatformTestResult(null) }} placeholder="http://81.71.11.33"
                    className={clsx('flex-1 px-2.5 py-1.5 rounded text-xs outline-none', isDark ? 'bg-gray-900 text-gray-100 placeholder-gray-600 focus:ring-1 focus:ring-blue-500' : 'bg-white text-gray-900 placeholder-gray-400 focus:ring-1 focus:ring-blue-400 border border-gray-300')} />
                  <button onClick={handleTestPlatformConnection} disabled={testingPlatform || !platformUrl.trim()}
                    className={clsx('text-[11px] flex items-center gap-1 px-2.5 py-1.5 rounded whitespace-nowrap', testingPlatform || !platformUrl.trim() ? 'opacity-40 cursor-not-allowed' : (isDark ? 'bg-green-900/30 text-green-300 hover:bg-green-900/50' : 'bg-green-100 text-green-700 hover:bg-green-200'))}>
                    {testingPlatform ? <RefreshCw size={10} className="animate-spin" /> : <Play size={10} />}{t('common:settings.platform.testConnection') || '测试连接'}
                  </button>
                </div>
              </div>
              {platformTestResult && (
                <div className={clsx('flex items-start gap-1.5 text-[11px] p-2 rounded', platformTestResult.ok ? (isDark ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700') : (isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'))}>
                  {platformTestResult.ok ? <Check size={12} /> : <XCircle size={12} />}<span>{platformTestResult.msg}</span>
                </div>
              )}
              <div className="border-t pt-2 mt-2" style={{ borderColor: isDark ? 'rgb(75, 85, 99)' : 'rgb(229, 231, 235)' }}>
                <div className="flex items-center justify-between">
                  <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>{t('common:settings.platform.loginStatus') || '登录状态'}</span>
                  <span className={clsx('text-xs font-medium', platformLoggedIn ? 'text-green-400' : (isDark ? 'text-gray-400' : 'text-gray-500'))}>
                    {platformLoggedIn ? `${t('common:settings.platform.loggedIn') || '已登录'} — ${platformUsername || ''}` : t('common:settings.platform.notLoggedIn') || '未登录'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const renderAdvancedTab = () => (
    <div className="space-y-3">
      <div className={clsx('rounded-lg border p-3', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50')}>
        <div className="flex items-start gap-3">
          <div className={clsx('mt-0.5', isDark ? 'text-gray-400' : 'text-gray-500')}><Wrench size={16} /></div>
          <div className="flex-1 min-w-0 space-y-3">
            <h4 className={clsx('text-sm font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>{t('common:settings.advanced.title')}</h4>

            {/* Python 路径 */}
            <div>
              <div className="flex items-center justify-between">
                <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>{t('common:settings.advanced.pythonPath')}</span>
                <button onClick={async () => { try { const result = await window.electron.dialog.openFile(); if (result && typeof result === 'string') setAdvancedSettings({ pythonPath: result }) } catch { /* ignore */ } }}
                  className={clsx('px-2 py-0.5 rounded text-xs', isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300')}>{t('common:settings.advanced.browse')}</button>
              </div>
              <input type="text" value={advancedSettings.pythonPath} onChange={(e) => setAdvancedSettings({ pythonPath: e.target.value })} placeholder={t('common:settings.advanced.pythonPathHint')}
                className={clsx('w-full mt-1 px-2 py-1 rounded text-xs border', isDark ? 'border-gray-600 bg-gray-700 text-gray-200 placeholder-gray-500' : 'border-gray-300 bg-white text-gray-700 placeholder-gray-400')} />
            </div>

            {/* 调试模式 */}
            <div className="flex items-center justify-between">
              <div>
                <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>{t('common:settings.advanced.debugMode')}</span>
                <p className={clsx('text-[11px]', isDark ? 'text-gray-600' : 'text-gray-400')}>{t('common:settings.advanced.debugModeDesc')}</p>
              </div>
              <button onClick={() => setAdvancedSettings({ debugMode: !advancedSettings.debugMode })}
                className={clsx('w-9 h-5 rounded-full transition-colors relative', advancedSettings.debugMode ? 'bg-blue-500' : (isDark ? 'bg-gray-600' : 'bg-gray-300'))}>
                <div className={clsx('w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform', advancedSettings.debugMode ? 'translate-x-4' : 'translate-x-0.5')} />
              </button>
            </div>

            {/* 代理 */}
            <div>
              <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>{t('common:settings.advanced.proxy')}</span>
              <input type="text" value={advancedSettings.proxy} onChange={(e) => setAdvancedSettings({ proxy: e.target.value })} placeholder={t('common:settings.advanced.proxyHint')}
                className={clsx('w-full mt-1 px-2 py-1 rounded text-xs border', isDark ? 'border-gray-600 bg-gray-700 text-gray-200 placeholder-gray-500' : 'border-gray-300 bg-white text-gray-700 placeholder-gray-400')} />
            </div>

            {/* AI Hub 端口 */}
            <div className="flex items-center justify-between">
              <div>
                <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>{t('common:settings.advanced.aiHubPort')}</span>
                <p className={clsx('text-[11px]', isDark ? 'text-gray-600' : 'text-gray-400')}>{t('common:settings.advanced.aiHubPortDesc')}</p>
              </div>
              <input type="number" min={0} max={65535} value={advancedSettings.aiHubPort} onChange={(e) => setAdvancedSettings({ aiHubPort: Number(e.target.value) || 0 })}
                className={clsx('w-20 px-2 py-1 rounded text-xs text-center border', isDark ? 'border-gray-600 bg-gray-700 text-gray-200' : 'border-gray-300 bg-white text-gray-700')} />
            </div>

            {/* AI Hub 自动启动 */}
            <div className="flex items-center justify-between">
              <div>
                <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>{t('common:settings.advanced.aiHubAutoStart')}</span>
                <p className={clsx('text-[11px]', isDark ? 'text-gray-600' : 'text-gray-400')}>{t('common:settings.advanced.aiHubAutoStartDesc')}</p>
              </div>
              <button onClick={() => setAdvancedSettings({ aiHubAutoStart: !advancedSettings.aiHubAutoStart })}
                className={clsx('w-9 h-5 rounded-full transition-colors relative', advancedSettings.aiHubAutoStart ? 'bg-blue-500' : (isDark ? 'bg-gray-600' : 'bg-gray-300'))}>
                <div className={clsx('w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-transform', advancedSettings.aiHubAutoStart ? 'translate-x-4' : 'translate-x-0.5')} />
              </button>
            </div>

            {/* 软件更新 */}
            <div className="border-t pt-3 mt-1" style={{ borderColor: isDark ? 'rgb(75, 85, 99)' : 'rgb(229, 231, 235)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>{t('common:settings.updates.title')}</span>
                  <p className={clsx('text-[11px]', isDark ? 'text-gray-600' : 'text-gray-400')}>{updateStatus === 'newVersion' ? t('common:settings.general.newVersionAvailable') : updateStatus === 'latest' ? t('common:settings.general.latestVersion') : ''}</p>
                </div>
                <button onClick={handleCheckUpdate} disabled={checkingUpdate}
                  className={clsx('flex items-center gap-1 px-2.5 py-1 rounded text-xs', isDark ? 'bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50' : 'bg-blue-500 text-white hover:bg-blue-400 disabled:opacity-50')}>
                  <RefreshCw size={12} className={checkingUpdate ? 'animate-spin' : ''} />{t('common:settings.updates.checkButton')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const renderAboutTab = () => (
    <div className="space-y-3">
      <div className={clsx('rounded-lg border p-3', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50')}>
        <div className="flex items-start gap-3">
          <div className={clsx('mt-0.5', isDark ? 'text-gray-400' : 'text-gray-500')}><Info size={16} /></div>
          <div className="flex-1 min-w-0">
            <h4 className={clsx('text-sm font-medium', isDark ? 'text-gray-200' : 'text-gray-700')}>MagicCommander</h4>
            <p className={clsx('text-xs mt-0.5', isDark ? 'text-gray-500' : 'text-gray-400')}>{t('common:settings.about.desc') || '智能网络配置管理工具'}</p>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>{t('common:settings.about.version') || '版本'}</span>
                <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>V{VERSION} Build {BUILD}</span>
              </div>
              <div className="flex justify-between">
                <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>Electron</span>
                <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>28.x</span>
              </div>
              <div className="flex justify-between">
                <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>React</span>
                <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>18.x</span>
              </div>
            </div>
            <div className="border-t pt-3 mt-3" style={{ borderColor: isDark ? 'rgb(75, 85, 99)' : 'rgb(229, 231, 235)' }}>
              <button onClick={handleCheckUpdate} disabled={checkingUpdate}
                className={clsx('flex items-center gap-1 px-2.5 py-1 rounded text-xs', isDark ? 'bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50' : 'bg-blue-500 text-white hover:bg-blue-400 disabled:opacity-50')}>
                <RefreshCw size={12} className={checkingUpdate ? 'animate-spin' : ''} />{t('common:settings.updates.checkButton')}
              </button>
              {updateStatus && (
                <p className={clsx('text-[11px] mt-1.5', updateStatus === 'newVersion' ? 'text-green-400' : (isDark ? 'text-gray-500' : 'text-gray-400'))}>
                  {updateStatus === 'newVersion' ? t('common:settings.general.newVersionAvailable') : t('common:settings.general.latestVersion')}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Settings size={16} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
          <span className={clsx('text-sm font-semibold', isDark ? 'text-gray-200' : 'text-gray-700')}>{t('common:settings.title')}</span>
        </div>

        {/* Tab 导航 */}
        <div className={clsx('flex rounded-lg border p-0.5', isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-100')}>
          {TAB_CONFIG.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={clsx('flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs transition-colors',
                activeTab === tab.id ? (isDark ? 'bg-gray-700 text-gray-200' : 'bg-white text-gray-800 shadow-sm') : (isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'))}>
              {tab.icon}<span>{t(tab.labelKey)}</span>
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        {activeTab === 'general' && renderGeneralTab()}
        {activeTab === 'ai' && renderAITab()}
        {activeTab === 'platform' && renderPlatformTab()}
        {activeTab === 'advanced' && renderAdvancedTab()}
        {activeTab === 'about' && renderAboutTab()}
      </div>
    </div>
  )
}