import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import * as path from 'path'
import { setupIpcHandlers } from './ipc/handlers'
import { initializeAppDirs, initializeWorkspace, isDev } from './config'
import { updateService } from './services/update.service'
import { logger } from './utils/logger'
import { aiHubService } from './services/aiHub.service'
import { initCrashReporting, registerProcessGuards, watchRendererCrashes, getCrashInfo } from './utils/crash'
import { telemetryService } from './services/telemetry.service'

import electronI18n from './electron-i18n'

// 初始化应用目录
initializeAppDirs()

// V4.2.0-42-a: 崩溃上报接线 —— 本地转储 + 主进程异常兜底（脱敏 errors.log）
initCrashReporting()
registerProcessGuards()

// V4.2.0-42-a: 启动摘要 —— 上次会话遗留崩溃记录数（诊断入口预留，4.7 诊断中心使用）
{
  const crashInfo = getCrashInfo()
  if (crashInfo.errorCount > 0) {
    logger.warn('[crash] 检测到上次会话遗留崩溃记录:', crashInfo.errorCount)
    for (const line of crashInfo.lastLines) {
      logger.debug('[crash] ' + line)
    }
  }
}

class MagicCommanderApp {
  private mainWindow: BrowserWindow | null = null

  // 47-d：应用启动时间戳（退出遥测计算 uptime）
  private appStartTime = Date.now()

  // 47-a：启动自动检查更新开关（默认开启；渲染进程持久化的 ui.store generalSettings.checkUpdateOnStart 经 IPC 同步）
  private checkUpdateOnStart = true

  async initialize(): Promise<void> {
    await app.whenReady()

    // 47-d：应用启动遥测（本地仅落盘，启用时记录版本/平台）
    telemetryService.record('app.start', { version: app.getVersion(), platform: process.platform, arch: process.arch })

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

    // 47-a：渲染进程同步 ui.store 的 checkUpdateOnStart（Zustand localStorage 持久化，主进程经 IPC 读取）
    ipcMain.handle('app:set-auto-update-check', (_event, enabled: boolean) => {
      this.checkUpdateOnStart = enabled !== false
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
    // 启动后延迟 3 秒自动静默检查更新（47-a：受 ui.store 的 checkUpdateOnStart 设置控制）
    setTimeout(() => {
      if (!this.checkUpdateOnStart) {
        logger.debug('Auto update check disabled by setting')
        return
      }
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

    // 渲染进程崩溃恢复：V4.2.0-42-a 统一走 crash.ts（脱敏 errors.log + 非 clean-exit 自动重载），避免白屏
    watchRendererCrashes(this.mainWindow)
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
      // 47-d：应用退出遥测（本地仅落盘）
      telemetryService.record('app.quit', { uptimeMs: Date.now() - this.appStartTime })
      aiHubService.stop().catch(() => {})
    })
  }
}

const mcApp = new MagicCommanderApp()
mcApp.initialize().catch((err) => {
  logger.error('Failed to start application:', err)
  app.quit()
})
