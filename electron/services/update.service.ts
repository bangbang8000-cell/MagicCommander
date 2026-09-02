/**
 * 自动更新服务（47-a：更新 fallback，对齐 AL 蓝本）
 * 检测新版本并自动下载安装。主路径 electron-updater 失败时，走以下兜底链：
 *  - checkLatestYmlFallback：net.request 直连 GitHub Releases latest.yml，解析 version/path 并缓存
 *  - downloadInstallerFile：手动处理 3xx 重定向，按 Content-Length 比对字节数，不一致判截断失败并清理
 *  - downloadInstallerDirectly：直接下载到系统 downloads 目录
 *  - openReleasesPage：下载不可用时打开 GitHub Releases 页面手动下载
 *  - quitAndInstall 兜底：fs.existsSync 校验安装包存在后 shell.openPath + 延迟退出
 */

import { app, BrowserWindow, net, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { autoUpdater, UpdateInfo } from 'electron-updater'
import { logger } from '../utils/logger'
import { isVersionNewer } from '../utils/version'

const PUBLISH_OWNER = 'bangbang8000-cell'
const PUBLISH_REPO = 'MagicCommander'
const RELEASES_PAGE_URL = `https://github.com/${PUBLISH_OWNER}/${PUBLISH_REPO}/releases/latest`

/** 当前平台对应的 latest yml 文件名 */
export function getPlatformYmlName(): string {
  switch (process.platform) {
    case 'darwin':
      return 'latest-mac.yml'
    case 'linux':
      return 'latest-linux.yml'
    default:
      return 'latest.yml'
  }
}

/** 缓存 fallback 通道检测到的下载信息，供 downloadUpdate 使用 */
interface FallbackDownloadInfo {
  version: string
  downloadUrl: string
  fileName: string
}

/**
 * 直接下载安装包到本地文件。
 * 使用 Electron net 模块，手动处理 3xx 重定向（GitHub Releases 会 302 到 objects.githubusercontent.com）。
 * 按 Content-Length 比对实收字节，不一致视为截断失败并 unlinkSync 清理残缺文件。
 */
function downloadInstallerFile(url: string, localPath: string, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const doRequest = (requestUrl: string, redirectCount: number) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'))
        return
      }
      const request = net.request(requestUrl)
      let fileStream: fs.WriteStream | null = null
      let totalBytes = 0
      let receivedBytes = 0
      let settled = false

      request.on('response', (response) => {
        const statusCode = response.statusCode || 0
        // 处理重定向
        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          const location = response.headers.location
          if (location) {
            // IncomingMessage 运行时继承自 stream.Readable，但类型定义未暴露 destroy
            ;(response as unknown as { destroy: () => void }).destroy()
            doRequest(Array.isArray(location) ? location[0] : location, redirectCount + 1)
            return
          }
        }
        if (statusCode !== 200) {
          if (!settled) {
            settled = true
            reject(new Error(`HTTP ${statusCode}`))
          }
          return
        }
        const contentLength = response.headers['content-length']
        totalBytes = parseInt(Array.isArray(contentLength) ? contentLength[0] : contentLength || '0', 10)
        fileStream = fs.createWriteStream(localPath)
        response.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length
          fileStream?.write(chunk)
          if (totalBytes > 0) {
            onProgress((receivedBytes / totalBytes) * 100)
          }
        })
        response.on('end', () => {
          if (fileStream) {
            fileStream.end(() => {
              if (!settled) {
                // 完整性校验：Content-Length 存在且已收字节不一致视为截断失败
                if (totalBytes > 0 && receivedBytes !== totalBytes) {
                  settled = true
                  try {
                    fs.unlinkSync(localPath)
                  } catch {
                    /* ignore */
                  }
                  reject(new Error(`Download incomplete: ${receivedBytes}/${totalBytes} bytes`))
                  return
                }
                settled = true
                resolve()
              }
            })
          } else if (!settled) {
            settled = true
            resolve()
          }
        })
      })

      request.on('error', (err) => {
        if (fileStream) fileStream.destroy()
        try {
          fs.unlinkSync(localPath)
        } catch {
          /* ignore */
        }
        if (!settled) {
          settled = true
          reject(err)
        }
      })

      request.end()
    }
    doRequest(url, 0)
  })
}

export class UpdateService {
  private window: BrowserWindow | null = null
  private isChecking = false
  /** 上次检查更新是否走了 fallback 通道（fallback 通道需要用直接下载） */
  private lastCheckUsedFallback = false
  /** fallback 通道检测到的下载信息（缓存供 downloadUpdate/quitAndInstall 使用） */
  private cachedFallbackInfo: FallbackDownloadInfo | null = null

  constructor(window?: BrowserWindow) {
    this.window = window || null
    this.setupAutoUpdater()
  }

  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  private setupAutoUpdater(): void {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false

    autoUpdater.on('checking-for-update', () => {
      logger.info('[UpdateService] 正在检查更新...')
      this.sendUpdateStatus({ status: 'checking' })
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      logger.info('[UpdateService] 发现新版本:', info.version)
      this.sendUpdateStatus({
        status: 'available',
        version: info.version,
        releaseNotes: info.releaseNotes as string | string[] | undefined,
        channel: 'auto',
      })
    })

    autoUpdater.on('update-not-available', () => {
      logger.info('[UpdateService] 当前已是最新版本')
      this.sendUpdateStatus({ status: 'not-available' })
    })

    autoUpdater.on('error', (error: Error) => {
      logger.error('[UpdateService] 更新失败:', error.message)
      this.sendUpdateStatus({ status: 'error', error: error.message })
    })

    autoUpdater.on('download-progress', (progress: { percent: number; transferred: number; total: number }) => {
      logger.info(`[UpdateService] 下载进度: ${Math.round(progress.percent)}%`)
      this.sendUpdateStatus({
        status: 'downloading',
        progress: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
      })
    })

    autoUpdater.on('update-downloaded', () => {
      logger.info('[UpdateService] 更新下载完成')
      this.sendUpdateStatus({ status: 'downloaded' })
    })
  }

  private sendUpdateStatus(status: UpdateStatus): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('update-status', status)
    }
  }

  async checkForUpdates(): Promise<void> {
    if (this.isChecking) return
    this.isChecking = true

    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('[UpdateService] 检查更新失败，尝试 fallback:', message)
      await this.checkLatestYmlFallback()
    } finally {
      this.isChecking = false
    }
  }

  /**
   * 备用更新检查：直接用 Electron net 模块请求 latest.yml 并解析版本号 + 下载路径。
   * 当 electron-updater 网络异常 / 模块不可用时启用。
   * net 模块走 Chromium 网络栈，对国内网络更友好。
   */
  private async checkLatestYmlFallback(timeoutMs = 15000): Promise<void> {
    const ymlName = getPlatformYmlName()
    const ymlUrl = `https://github.com/${PUBLISH_OWNER}/${PUBLISH_REPO}/releases/latest/download/${ymlName}`
    return new Promise((resolve) => {
      const request = net.request(ymlUrl)
      const timeout = setTimeout(() => {
        request.abort()
        logger.warn('[UpdateService] Fallback check timeout')
        this.sendUpdateStatus({ status: 'error', error: 'Request timeout', channel: 'fallback' })
        resolve()
      }, timeoutMs)

      request.on('response', (response) => {
        let body = ''
        response.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        response.on('end', () => {
          clearTimeout(timeout)
          if (response.statusCode !== 200) {
            this.sendUpdateStatus({ status: 'error', error: `HTTP ${response.statusCode}`, channel: 'fallback' })
            resolve()
            return
          }
          // 解析 latest.yml 中的 version 字段
          const versionMatch = body.match(/^version:\s*(.+)$/m)
          if (!versionMatch) {
            this.sendUpdateStatus({ status: 'error', error: 'Failed to parse latest.yml', channel: 'fallback' })
            resolve()
            return
          }
          const latestVersion = versionMatch[1].trim()
          const currentVersion = app.getVersion()
          const isNewer = isVersionNewer(latestVersion, currentVersion)
          logger.info(
            `[UpdateService] Fallback check: latest=${latestVersion}, current=${currentVersion}, newer=${isNewer}`,
          )

          // 解析 path 字段（当前平台安装包文件名），构造下载 URL 并缓存（仅在有新版本时缓存）
          const pathMatch = body.match(/^path:\s*(.+)$/m)
          if (isNewer && pathMatch) {
            const fileName = pathMatch[1].trim()
            const downloadUrl = `https://github.com/${PUBLISH_OWNER}/${PUBLISH_REPO}/releases/latest/download/${encodeURIComponent(fileName)}`
            this.cachedFallbackInfo = { version: latestVersion, downloadUrl, fileName }
            logger.info('[UpdateService] Fallback cached download info:', fileName)
          }

          if (isNewer) {
            this.lastCheckUsedFallback = true
            this.sendUpdateStatus({ status: 'available', version: latestVersion, channel: 'fallback' })
          } else {
            this.sendUpdateStatus({ status: 'not-available' })
          }
          resolve()
        })
      })

      request.on('error', (err) => {
        clearTimeout(timeout)
        logger.error('[UpdateService] Fallback request error:', err.message)
        this.sendUpdateStatus({ status: 'error', error: err.message, channel: 'fallback' })
        resolve()
      })

      request.end()
    })
  }

  async downloadUpdate(): Promise<void> {
    // 如果上次检查走了 fallback 通道，优先用直接下载
    if (this.lastCheckUsedFallback && this.cachedFallbackInfo?.downloadUrl) {
      logger.info('[UpdateService] Using direct download (fallback mode)')
      await this.downloadInstallerDirectly()
      return
    }

    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('[UpdateService] electron-updater download failed, trying direct download:', message)
      // 直接下载兜底：先检查一次获取下载信息，再直接下载；仍失败则打开 Releases 页面
      try {
        if (!this.cachedFallbackInfo) {
          await this.checkLatestYmlFallback()
        }
        if (this.cachedFallbackInfo?.downloadUrl) {
          await this.downloadInstallerDirectly()
        } else {
          this.sendUpdateStatus({ status: 'error', error: message, channel: 'fallback' })
          this.openReleasesPage()
        }
      } catch (directErr) {
        const msg = directErr instanceof Error ? directErr.message : String(directErr)
        logger.warn('[UpdateService] Direct download also failed:', msg)
        this.sendUpdateStatus({ status: 'error', error: msg, channel: 'fallback' })
        this.openReleasesPage()
      }
    }
  }

  /**
   * 直接下载安装包到本地下载目录（fallback 通道）。
   * 下载完成后通知前端，用户点击「重启安装」时由 quitAndInstall 打开安装包。
   */
  private async downloadInstallerDirectly(): Promise<void> {
    if (!this.cachedFallbackInfo?.downloadUrl) {
      throw new Error('No download URL available')
    }
    const { downloadUrl, fileName } = this.cachedFallbackInfo
    const downloadsPath = app.getPath('downloads')
    // fileName 来自 yml path 字段，必须 basename 防本地路径拼接越界
    const localPath = path.join(downloadsPath, path.basename(fileName))

    logger.info(`[UpdateService] Direct downloading ${fileName} to ${localPath}`)
    this.sendUpdateStatus({ status: 'downloading', progress: 0, channel: 'fallback' })

    await downloadInstallerFile(downloadUrl, localPath, (percent) => {
      this.sendUpdateStatus({ status: 'downloading', progress: Math.round(percent), channel: 'fallback' })
    })

    logger.info('[UpdateService] Direct download completed:', localPath)
    this.sendUpdateStatus({ status: 'downloaded', channel: 'fallback', verified: true })
  }

  /** 打开 GitHub Releases 页面（用于手动下载） */
  openReleasesPage(): void {
    shell.openExternal(RELEASES_PAGE_URL).catch(() => {})
  }

  quitAndInstall(): void {
    // 直接下载场景：确认安装包真实存在后再打开，避免打开残缺/缺失文件
    if (this.cachedFallbackInfo) {
      const downloadsPath = app.getPath('downloads')
      const localPath = path.join(downloadsPath, path.basename(this.cachedFallbackInfo.fileName))
      logger.info('[UpdateService] Opening installer and quitting:', localPath)
      if (fs.existsSync(localPath)) {
        shell.openPath(localPath).then(() => {
          // 稍延迟退出，确保 shell.openPath 执行完成
          setTimeout(() => app.quit(), 500)
        })
      } else {
        logger.error('[UpdateService] Installer file missing, not quitting:', localPath)
      }
      return
    }
    // electron-updater 场景
    autoUpdater.quitAndInstall()
  }

  getCurrentVersion(): string {
    return app.getVersion()
  }
}

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  releaseNotes?: string | string[]
  progress?: number
  transferred?: number
  total?: number
  error?: string
  /** 47-a：本次结果来自哪条通道（auto=electron-updater，fallback=直接下载兜底） */
  channel?: 'auto' | 'fallback'
  /** 47-a：fallback 直接下载是否通过 Content-Length 完整性校验 */
  verified?: boolean
}

export const updateService = new UpdateService()
