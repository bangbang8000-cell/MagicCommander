/**
 * 自动更新服务
 * 检测新版本并自动下载安装
 */

import { app, BrowserWindow } from 'electron'
import { autoUpdater, UpdateInfo } from 'electron-updater'
import { logger } from '../utils/logger'

export class UpdateService {
  private window: BrowserWindow | null = null
  private isChecking = false

  constructor(window?: BrowserWindow) {
    this.window = window || null
    this.setupAutoUpdater()
  }

  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  private setupAutoUpdater(): void {
    autoUpdater.autoDownload = false
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
    } catch (error: any) {
      logger.error('[UpdateService] 检查更新失败:', error.message)
      this.sendUpdateStatus({ status: 'error', error: error.message })
    } finally {
      this.isChecking = false
    }
  }

  async downloadUpdate(): Promise<void> {
    try {
      await autoUpdater.downloadUpdate()
    } catch (error: any) {
      logger.error('[UpdateService] 下载更新失败:', error.message)
      this.sendUpdateStatus({ status: 'error', error: error.message })
    }
  }

  quitAndInstall(): void {
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
}

export const updateService = new UpdateService()