import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link2, Copy, Trash2, Loader2, Share2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { showError, showSuccess } from '@/components/ui/Toast'
import { usePlatformStore } from '@/stores/platform.store'
import clsx from 'clsx'
import type { CloudShareItem } from '@/types/ipc'

type ShareDialogProps = {
  open: boolean
  projectName?: string
  onClose: () => void
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function ShareDialog({ open, projectName, onClose }: ShareDialogProps) {
  const { t } = useTranslation()
  const loggedIn = usePlatformStore((s) => s.loggedIn)
  const createShare = usePlatformStore((s) => s.createShare)
  const fetchMyShares = usePlatformStore((s) => s.fetchMyShares)
  const revokeShare = usePlatformStore((s) => s.revokeShare)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdUrl, setCreatedUrl] = useState('')
  const [shares, setShares] = useState<CloudShareItem[]>([])
  const [loadingShares, setLoadingShares] = useState(false)
  const [revoking, setRevoking] = useState('')

  useEffect(() => {
    if (open) {
      setName(projectName || '')
      setCreatedUrl('')
      if (loggedIn) {
        setLoadingShares(true)
        fetchMyShares()
          .then(setShares)
          .catch(() => setShares([]))
          .finally(() => setLoadingShares(false))
      }
    }
  }, [open, projectName, loggedIn, fetchMyShares])

  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      showError('请输入项目名称')
      return
    }
    setCreating(true)
    try {
      const res = await createShare(name.trim(), description.trim() || undefined)
      setCreatedUrl(res.fullUrl)
      const copied = await copyText(res.fullUrl)
      showSuccess(copied ? `分享链接已生成并复制:\n${res.fullUrl}` : `分享链接已生成:\n${res.fullUrl}`)
      const list = await fetchMyShares().catch(() => [])
      setShares(list)
    } catch (err) {
      showError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }, [name, description, createShare, fetchMyShares])

  const handleCopy = useCallback(async (url: string) => {
    const copied = await copyText(url)
    showSuccess(copied ? '链接已复制到剪贴板' : '链接复制失败，请手动复制')
  }, [])

  const handleRevoke = useCallback(
    async (token: string) => {
      if (!window.confirm('确定撤销该分享链接吗？撤销后链接将立即失效。')) return
      setRevoking(token)
      try {
        await revokeShare(token)
        setShares((prev) => prev.filter((s) => s.token !== token))
        if (createdUrl.includes(token)) setCreatedUrl('')
        showSuccess('分享已撤销')
      } catch (err) {
        showError((err as Error).message)
      } finally {
        setRevoking('')
      }
    },
    [revokeShare, createdUrl],
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('cloud:share.title') || '分享链接'}
      width="480px"
      footer={
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          {t('common:close', '关闭') || '关闭'}
        </button>
      }
    >
      <div className="space-y-4">
        {!loggedIn && <div className="text-sm text-gray-500">请先登录云平台，才能创建分享链接</div>}

        {loggedIn && (
          <>
            {/* 生成分享链接 */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">项目名称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入本地项目名称（生成只读快照）"
                className="w-full px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none focus:border-primary-400"
              />
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">分享说明（可选）</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="接收方可查看的说明"
                className="w-full px-3 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 outline-none focus:border-primary-400"
              />
              <button
                onClick={() => void handleCreate()}
                disabled={creating || !name.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded bg-primary-500 hover:bg-primary-600 text-white disabled:opacity-50 transition-colors"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                生成分享链接
              </button>
            </div>

            {createdUrl && (
              <div
                className={clsx(
                  'rounded-lg border p-2.5 text-xs break-all',
                  'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300',
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Link2 size={12} />
                  <span className="font-medium">预览链接</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="flex-1 min-w-0 truncate">{createdUrl}</span>
                  <button
                    onClick={() => void handleCopy(createdUrl)}
                    className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                    title="复制链接"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              </div>
            )}

            {/* 我的分享 */}
            <div>
              <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">我的分享</div>
              {loadingShares && <div className="text-xs text-gray-400">加载中...</div>}
              {!loadingShares && shares.length === 0 && <div className="text-xs text-gray-400">暂无分享链接</div>}
              <div className="space-y-1.5 max-h-52 overflow-auto">
                {shares.map((s) => (
                  <div
                    key={s.token}
                    className={clsx(
                      'flex items-center gap-2 rounded border p-2 text-xs',
                      'border-gray-200 dark:border-gray-700',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{s.project_name}</div>
                      <div className="text-gray-400 truncate">{s.description || (s.url ? `${s.url}` : '')}</div>
                    </div>
                    <button
                      onClick={() => void handleCopy(s.url)}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                      title="复制链接"
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      onClick={() => void handleRevoke(s.token)}
                      disabled={revoking === s.token}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-400 transition-colors"
                      title="撤销分享"
                    >
                      {revoking === s.token ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
