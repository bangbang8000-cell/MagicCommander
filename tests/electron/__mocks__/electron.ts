export class BrowserWindow {
  webContents: any
  constructor() {
    this.webContents = {
      send: () => {},
    }
  }
  isDestroyed() { return false }
  static getAllWindows() { return [] }
}

export const app = {
  isPackaged: false,
  getPath: (name: string) => `/mock/${name}`,
  getAppPath: () => '/mock/app',
  setPath: () => {},
  on: () => {},
  whenReady: () => Promise.resolve(),
  quit: () => {},
}

export const ipcMain = {
  on: () => {},
  handle: () => {},
  removeHandler: () => {},
}

export const ipcRenderer = {
  on: () => {},
  send: () => {},
  invoke: async () => {},
  removeAllListeners: () => {},
}

export const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showSaveDialog: async () => ({ canceled: true, filePath: '' }),
  showMessageBox: async () => ({ response: 0 }),
}

export const shell = {
  openPath: async () => '',
  showItemInFolder: () => {},
}

export const Menu = {
  buildFromTemplate: () => ({ items: [] }),
  setApplicationMenu: () => {},
}

export const Tray = class {
  setToolTip() {}
  setContextMenu() {}
  destroy() {}
}

export const nativeImage = {
  createFromPath: () => ({ resize: () => ({}) }),
}

export const screen = {
  getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }),
}

export const Notification = class {
  static isSupported() { return false }
  show() {}
}