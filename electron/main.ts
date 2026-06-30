import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { setupIpcHandlers } from './ipc/handlers'
import { PythonService } from './services/python.service'
import { initializeAppDirs, isDev } from './config'
import { updateService } from './services/update.service'
import { logger } from './utils/logger'

// 初始化应用目录
initializeAppDirs()

class MagicCommanderApp {
  private mainWindow: BrowserWindow | null = null
  private pythonService: PythonService

  constructor() {
    this.pythonService = new PythonService()
  }

  async initialize(): Promise<void> {
    await app.whenReady()
    this.createMainWindow()
    Menu.setApplicationMenu(null)
    setupIpcHandlers(this.pythonService, this.mainWindow!)
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

    this.mainWindow.on('closed', () => {
      this.mainWindow = null
    })
  }

  private registerAppEvents(): void {
    app.on('window-all-closed', () => {
      this.pythonService.destroy()
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow()
      }
    })

    app.on('before-quit', () => {
      this.pythonService.destroy()
    })
  }
}

const mcApp = new MagicCommanderApp()
mcApp.initialize().catch((err) => {
  logger.error('Failed to start application:', err)
  app.quit()
})
