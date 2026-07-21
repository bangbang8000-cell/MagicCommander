import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlatformStore } from '@/stores/platform.store'
import { Modal } from '@/components/ui/Modal'
import { showError, showSuccess } from '@/components/ui/Toast'
import QRCode from 'qrcode'

interface LoginDialogProps {
  open: boolean
  onClose: () => void
}

export function LoginDialog({ open, onClose }: LoginDialogProps) {
  const { t } = useTranslation('common')
  const startLogin = usePlatformStore((s) => s.startLogin)
  const pollLogin = usePlatformStore((s) => s.pollLogin)
  const loggedIn = usePlatformStore((s) => s.loggedIn)

  const [stage, setStage] = useState<'idle' | 'loading' | 'scanning' | 'done' | 'error'>('idle')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Start login flow
  useEffect(() => {
    if (!open) return
    setStage('loading')
    setErrorMsg('')
    setQrDataUrl(null)

    startLogin()
      .then(async ({ authUrl, sessionId }) => {
        // Generate QR code as data URL
        const dataUrl = await QRCode.toDataURL(authUrl, {
          width: 256,
          margin: 1,
          color: { dark: '#111827', light: '#ffffff' },
        })
        setQrDataUrl(dataUrl)
        setStage('scanning')

        // Start polling
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
      })
      .catch((err) => {
        setStage('error')
        setErrorMsg((err as Error).message)
      })

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [open])

  const handleClose = () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    if (loggedIn) setStage('done')
    onClose()
  }

  const handleRetry = () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    setStage('loading')
    setErrorMsg('')
    setQrDataUrl(null)
    startLogin()
      .then(async ({ authUrl, sessionId }) => {
        const dataUrl = await QRCode.toDataURL(authUrl, {
          width: 256, margin: 1,
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
      })
      .catch((err) => setErrorMsg((err as Error).message))
  }

  return (
    <Modal open={open} onClose={handleClose} title={t('auth.platformLogin') || '平台登录'}>
      <div className="flex flex-col items-center gap-4 p-4 min-w-[300px]">
        {stage === 'loading' && (
          <div className="text-sm text-gray-400">{t('common.loading')}</div>
        )}

        {stage === 'scanning' && qrDataUrl && (
          <>
            <img src={qrDataUrl} alt="QR Code" className="rounded-lg border border-gray-700" />
            <p className="text-sm text-gray-300 text-center">
              {t('auth.scanWithFeishu') || '请使用飞书 App 扫码登录'}
            </p>
            <p className="text-xs text-gray-500">{t('auth.qrExpiresIn') || '二维码 10 分钟内有效'}</p>
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
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm transition-colors"
            >
              {t('common.retry') || '重试'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
