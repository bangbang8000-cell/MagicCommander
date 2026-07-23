import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlatformStore } from '@/stores/platform.store'
import { Modal } from '@/components/ui/Modal'
import { showError, showSuccess } from '@/components/ui/Toast'
import { auth, type LoginPlatform, type AuthHealth } from '@/api/platform'
import QRCode from 'qrcode'

interface LoginDialogProps {
  open: boolean
  onClose: () => void
}

const PLATFORM_LABELS: Record<LoginPlatform, string> = {
  feishu: 'cloud:loginDialog.feishu',
  qq: 'cloud:loginDialog.qq',
  wechat: 'cloud:loginDialog.wechat',
}

const PLATFORM_ICONS: Record<LoginPlatform, string> = {
  feishu: '🕊️',
  qq: '🐧',
  wechat: '💬',
}

export function LoginDialog({ open, onClose }: LoginDialogProps) {
  const { t } = useTranslation('common')
  const { t: tc } = useTranslation('cloud')
  const startLogin = usePlatformStore((s) => s.startLogin)
  const pollLogin = usePlatformStore((s) => s.pollLogin)
  const cancelLogin = usePlatformStore((s) => s.cancelLogin)
  const loggedIn = usePlatformStore((s) => s.loggedIn)

  const [stage, setStage] = useState<'choose' | 'loading' | 'scanning' | 'done' | 'error'>('choose')
  const [platform, setPlatform] = useState<LoginPlatform>('feishu')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [authHealth, setAuthHealth] = useState<AuthHealth | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch auth health on open
  useEffect(() => {
    if (open) {
      setStage('choose')
      setErrorMsg('')
      setQrDataUrl(null)
      auth.health().then(setAuthHealth).catch(() => setAuthHealth(null))
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [open])

  const isPlatformAvailable = (p: LoginPlatform): boolean => {
    if (!authHealth) return false
    return authHealth[p]?.configured === true
  }

  const beginLogin = async (selectedPlatform: LoginPlatform) => {
    setPlatform(selectedPlatform)
    setStage('loading')
    setErrorMsg('')
    setQrDataUrl(null)

    try {
      const { authUrl } = await startLogin(selectedPlatform)
      const dataUrl = await QRCode.toDataURL(authUrl, {
        width: 256,
        margin: 1,
        color: { dark: '#111827', light: '#ffffff' },
      })
      setQrDataUrl(dataUrl)
      setStage('scanning')

      pollingRef.current = setInterval(async () => {
        try {
          const result = await pollLogin()
          if (result === 'confirmed') {
            setStage('done')
            if (pollingRef.current) clearInterval(pollingRef.current)
            showSuccess(t('auth.loginSuccess') || '登录成功')
            setTimeout(() => onClose(), 1000)
          } else if (result === 'expired') {
            setStage('error')
            setErrorMsg(t('auth.qrExpired') || '二维码已过期')
            if (pollingRef.current) clearInterval(pollingRef.current)
          }
        } catch (err) {
          setStage('error')
          setErrorMsg((err as Error).message)
          if (pollingRef.current) clearInterval(pollingRef.current)
        }
      }, 2000)
    } catch (err) {
      setStage('error')
      setErrorMsg((err as Error).message)
    }
  }

  const handleClose = () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    cancelLogin()
    onClose()
  }

  const handleRetry = () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    beginLogin(platform)
  }

  const handleBack = () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    cancelLogin()
    setStage('choose')
    setQrDataUrl(null)
    setErrorMsg('')
  }

  return (
    <Modal open={open} onClose={handleClose} title={t('auth.platformLogin') || '平台登录'}>
      <div className="flex flex-col items-center gap-4 p-4 min-w-[300px]">
        {stage === 'choose' && (
          <div className="flex flex-col gap-3 w-full">
            <p className="text-sm text-gray-300 text-center">
              {t('auth.selectPlatform') || '选择登录方式'}
            </p>
            {(Object.keys(PLATFORM_LABELS) as LoginPlatform[]).map((p) => {
                const available = isPlatformAvailable(p)
                return (
                  <button
                    key={p}
                    onClick={() => available && beginLogin(p)}
                    disabled={!available}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left ${
                      available
                        ? 'border-gray-600 hover:border-indigo-400 hover:bg-indigo-500/10'
                        : 'border-gray-700 opacity-40 cursor-not-allowed'
                    }`}
                    title={!available ? tc('cloud:loginDialog.unavailable') : undefined}
                  >
                    <span className="text-xl">{PLATFORM_ICONS[p]}</span>
                    <div>
                      <div className="text-sm font-medium text-gray-200">
                        {tc(PLATFORM_LABELS[p])}
                        {!available && (
                          <span className="text-[10px] text-gray-500 ml-1">({tc('cloud:loginDialog.unavailable')})</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {available
                          ? tc('cloud:loginDialog.scanHint', { platform: tc(PLATFORM_LABELS[p]) })
                          : tc('cloud:loginDialog.unavailable')}
                      </div>
                    </div>
                  </button>
                )
              })}
          </div>
        )}

        {stage === 'loading' && (
          <div className="text-sm text-gray-400">{t('app.loading')}</div>
        )}

        {stage === 'scanning' && qrDataUrl && (
          <>
            <img src={qrDataUrl} alt="QR Code" className="rounded-lg border border-gray-700" />
            <p className="text-sm text-gray-300 text-center">
              {t('auth.scanHint')?.replace('{platform}', tc(PLATFORM_LABELS[platform])) || tc('cloud:loginDialog.scanHint', { platform: tc(PLATFORM_LABELS[platform]) })}
            </p>
            <p className="text-xs text-gray-500">{t('auth.qrExpiresIn') || '二维码 10 分钟内有效'}</p>
            <button
              onClick={handleBack}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              {t('app.back')}
            </button>
          </>
        )}

        {stage === 'done' && (
          <div className="text-center">
            <div className="text-green-400 text-4xl mb-2">✓</div>
            <p className="text-sm text-gray-300">{t('auth.loginDone') || '登录成功'}</p>
          </div>
        )}

        {stage === 'error' && (
          <div className="text-center">
            <div className="text-red-400 text-lg mb-2">{errorMsg}</div>
            <div className="flex gap-2 justify-center">
              <button
                onClick={handleBack}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm transition-colors"
              >
                {t('app.back')}
              </button>
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm transition-colors"
              >
                {t('app.retry')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
