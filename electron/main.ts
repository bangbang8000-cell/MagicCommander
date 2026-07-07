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
    
    ipcMain.handle('app:get-version', () => {
      return app.getVersion()
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

  private createMainWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1100,
      minHeight: 700,
      title: 'MagicCommander',
      backgroundColor: '#f9fafb',
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
          { label: electronI18n.t('common:app.selectAll', '全选'), role: 'selectAll' }
        )
      } else if (params.selectionText) {
        template.push(
          { label: electronI18n.t('common:app.copy', '复制'), role: 'copy' }
        )
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
