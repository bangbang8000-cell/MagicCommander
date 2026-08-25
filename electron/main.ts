import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import * as path from 'path'
import { setupIpcHandlers } from './ipc/handlers'
import { initializeAppDirs, initializeWorkspace, isDev } from './config'
import { updateService } from './services/update.service'
import { logger } from './utils/logger'
import { aiHubService } from './services/aiHub.service'

import electronI18n from './electron-i18n'

// 初始化应用目录
initializeAppDirs()

class MagicCommanderApp {
  private mainWindow: BrowserWindow | null = null

  async initialize(): Promise<void> {
    await app.whenReady()

    // 单实例锁：避免多开实例共享工作区、抢占 AI Hub 端口
    const gotLock = app.requestSingleInstanceLock()
    if (!gotLock) {
      logger.warn('已有实例在运行，退出当前进程')
      app.quit()
      return
    }
    app.on('second-instance', () => {
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore()
        this.mainWindow.focus()
      }
    })

    initializeWorkspace()
    this.createMainWindow()
    Menu.setApplicationMenu(null)
    setupIpcHandlers(this.mainWindow!)
    this.setupUpdateService()
    this.startupUpdateCheck()
    this.startupAIHub()
    this.registerAppEvents()
  }

  private setupUpdateService(): void {
    if (!this.mainWindow) return

    updateService.setWindow(this.mainWindow)

    ipcMain.handle('app:check-update', async () => {
      await updateService.checkForUpdates()
    })

    ipcMain.handle('app:download-update', async () => {
      await updateService.downloadUpdate()
    })

    ipcMain.handle('app:quit-and-install', () => {
      updateService.quitAndInstall()
    })

    // 窗口控制 IPC
    ipcMain.handle('window:minimize', () => {
      this.mainWindow?.minimize()
    })

    ipcMain.handle('window:maximize', () => {
      if (this.mainWindow?.isMaximized()) {
        this.mainWindow.unmaximize()
      } else {
        this.mainWindow?.maximize()
      }
    })

    ipcMain.handle('window:close', () => {
      this.mainWindow?.close()
    })

    ipcMain.handle('window:isMaximized', () => {
      return this.mainWindow?.isMaximized() ?? false
    })

    // 监听窗口最大化/还原，通知渲染进程
    this.mainWindow.on('maximize', () => {
      this.mainWindow?.webContents.send('window:maximizeChange', true)
    })
    this.mainWindow.on('unmaximize', () => {
      this.mainWindow?.webContents.send('window:maximizeChange', false)
    })

    // i18n 语言 IPC 处理器
    ipcMain.handle('app:getLanguage', () => {
      return electronI18n.language
    })

    // MC-I18-4 / MC-M1e: 仅允许 6 种官方语言，非法值 fallback 到 zh-CN（防任意字符串写入偏好）
    const SUPPORTED_LANGUAGES = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr']
    ipcMain.handle('app:setLanguage', (_event, lang: string) => {
      const safeLang = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'zh-CN'
      electronI18n.changeLanguage(safeLang)
      if (this.mainWindow) {
        this.mainWindow.webContents.send('language-changed', safeLang)
      }
    })
  }

  private startupUpdateCheck(): void {
    // 启动后延迟 3 秒自动静默检查更新
    setTimeout(() => {
      updateService.checkForUpdates().catch((err) => {
        logger.debug('Startup update check failed:', err.message)
      })
    }, 3000)
  }

  private startupAIHub(): void {
    // 启动后延迟 2 秒启动 AI Hub（不阻塞 UI 渲染）
    setTimeout(() => {
      aiHubService.start().catch((err) => {
        logger.warn('AI Hub startup failed:', err.message)
      })
    }, 2000)
  }

  private createMainWindow(): void {
    const isMac = process.platform === 'darwin'
    const isLinux = process.platform === 'linux'

    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1100,
      minHeight: 700,
      title: 'MagicCommander',
      icon: path.join(__dirname, '..', 'public', 'icons', 'icon.ico'),
      backgroundColor: '#f9fafb',
      frame: isLinux,
      titleBarStyle: isMac ? 'hidden' : 'default',
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        // 启用渲染进程沙箱：preload 仅使用 contextBridge/ipcRenderer，兼容沙箱
        sandbox: true,
      },
    })

    const indexHtml = path.join(__dirname, '../dist/index.html')

    if (isDev) {
      this.mainWindow.loadURL('http://localhost:5173')
      this.mainWindow.webContents.openDevTools({ mode: 'detach' })
    } else {
      this.mainWindow.loadFile(indexHtml)
    }

    this.mainWindow.webContents.on('console-message', (_event, _level, message) => {
      logger.debug(`[renderer] ${message}`)
    })

    this.mainWindow.show()

    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      // 仅允许 http/https 协议外链，防止 file://、ms-*、自定义协议被 markdown 链接触发
      if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url)
      }
      return { action: 'deny' }
    })

    // MC-S5 / MC-M1e: 阻止主窗口导航到应用来源之外的 URL（防 window.location / 恶意链接跳转）
    this.mainWindow.webContents.on('will-navigate', (event, url) => {
      const current = this.mainWindow?.webContents.getURL() || ''
      const isAppOrigin = url.startsWith('file://') || /^http:\/\/localhost:\d+/i.test(url)
      if (!isAppOrigin && url !== current) {
        event.preventDefault()
        if (/^https?:\/\//i.test(url)) shell.openExternal(url)
      }
    })

    // 渲染进程崩溃恢复：崩溃/无响应时自动重载，避免白屏
    this.mainWindow.webContents.on('render-process-gone', (_event, details) => {
      logger.error(`[Renderer] 渲染进程异常退出: ${details.reason}`, details)
      if (details.reason !== 'clean-exit') {
        setTimeout(() => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            logger.info('[Renderer] 自动重载渲染进程')
            this.mainWindow.webContents.reload()
          }
        }, 1000)
      }
    })
    this.mainWindow.webContents.on('unresponsive', () => {
      logger.warn('[Renderer] 渲染进程无响应，尝试重载')
      setTimeout(() => {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.reload()
        }
      }, 3000)
    })

    this.mainWindow.webContents.on('context-menu', (event, params) => {
      event.preventDefault()
      const template: Electron.MenuItemConstructorOptions[] = []

      if (params.isEditable) {
        template.push(
          { label: electronI18n.t('common:app.cut', '剪切'), role: 'cut' },
          { label: electronI18n.t('common:app.copy', '复制'), role: 'copy' },
          { label: electronI18n.t('common:app.paste', '粘贴'), role: 'paste' },
          { type: 'separator' },
          { label: electronI18n.t('common:app.selectAll', '全选'), role: 'selectAll' },
        )
      } else if (params.selectionText) {
        template.push({ label: electronI18n.t('common:app.copy', '复制'), role: 'copy' })
      }

      if (template.length > 0) {
        Menu.buildFromTemplate(template).popup({ window: this.mainWindow! })
      }
    })

    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })
  }

  private registerAppEvents(): void {
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow()
      }
    })

    // 应用退出时清理 AI Hub 子进程
    app.on('before-quit', () => {
      aiHubService.stop().catch(() => {})
    })
  }
}

const mcApp = new MagicCommanderApp()
mcApp.initialize().catch((err) => {
  logger.error('Failed to start application:', err)
  app.quit()
})
