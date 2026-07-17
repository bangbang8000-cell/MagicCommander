import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { setupIpcHandlers } from './ipc/handlers'
import { initializeAppDirs, initializeWorkspace, isDev } from './config'
import { updateService } from './services/update.service'
import { logger } from './utils/logger'

import electronI18n from './electron-i18n'

// 初始化应用目录
initializeAppDirs()

class MagicCommanderApp {
  private mainWindow: BrowserWindow | null = null

  async initialize(): Promise<void> {
    await app.whenReady()
    initializeWorkspace()
    this.createMainWindow()
    Menu.setApplicationMenu(null)
    setupIpcHandlers(this.mainWindow!)
    this.setupUpdateService()
    this.startupUpdateCheck()
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

    ipcMain.handle('app:setLanguage', (_event, lang: string) => {
      electronI18n.changeLanguage(lang)
      if (this.mainWindow) {
        this.mainWindow.webContents.send('language-changed', lang)
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

  private createMainWindow(): void {
    const isWin = process.platform === 'win32'
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
        sandbox: false,
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
      shell.openExternal(url)
      return { action: 'deny' }
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
  }
}

const mcApp = new MagicCommanderApp()
mcApp.initialize().catch((err) => {
  logger.error('Failed to start application:', err)
  app.quit()
})
