import { contextBridge, ipcRenderer } from 'electron'

// 向渲染进程暴露安全的 API
const api = {
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    listExamples: () => ipcRenderer.invoke('project:listExamples'),
    create: (name: string, options?: { template?: string; empty?: boolean }) => ipcRenderer.invoke('project:create', name, options),
    saveAsExample: (projectName: string, exampleName: string) => ipcRenderer.invoke('project:saveAsExample', projectName, exampleName),
    delete: (ids: string[]) => ipcRenderer.invoke('project:delete', ids),
    getStructure: (name: string) => ipcRenderer.invoke('project:structure', name),
    parameters: (name: string) => ipcRenderer.invoke('project:parameters', name),
    readExcel: (id: number, filePath: string, projectName?: string) => ipcRenderer.invoke('project:readExcel', id, filePath, projectName),
    writeExcel: (id: number, filePath: string, sheets: { name: string; headers: string[]; rows: Record<string, any>[] }[], projectName?: string) => ipcRenderer.invoke('project:writeExcel', id, filePath, sheets, projectName),
    readFile: (id: number, filePath: string, projectName?: string) => ipcRenderer.invoke('project:readFile', id, filePath, projectName),
    writeFile: (id: number, filePath: string, content: string, projectName?: string) => ipcRenderer.invoke('project:writeFile', id, filePath, content, projectName),
    readDocx: (id: number, filePath: string, projectName?: string) => ipcRenderer.invoke('project:readDocx', id, filePath, projectName),
    readDocxBuffer: (id: number, filePath: string, projectName?: string) => ipcRenderer.invoke('project:readDocxBuffer', id, filePath, projectName),
    listFiles: (id: string, fileType?: string) => ipcRenderer.invoke('project:listFiles', id, fileType),
  },
  render: {
    project: (ids: string[]) => ipcRenderer.invoke('render:project', ids),
    yaml: (ids: string[]) => ipcRenderer.invoke('render:yaml', ids),
    projectSn: (ids: string[]) => ipcRenderer.invoke('render:project-sn', ids),
    yamlSn: (ids: string[]) => ipcRenderer.invoke('render:yaml-sn', ids),
    undo: (ids: string[]) => ipcRenderer.invoke('render:undo', ids),
    onProgress: (callback: (progress: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => callback(data)
      ipcRenderer.on('render:progress', handler)
      return () => ipcRenderer.removeListener('render:progress', handler)
    },
  },
  delete: {
    output: (ids: string[]) => ipcRenderer.invoke('delete:output', ids),
    outputSn: (ids: string[]) => ipcRenderer.invoke('delete:output-sn', ids),
    yaml: (ids: string[]) => ipcRenderer.invoke('delete:yaml', ids),
    yamlSn: (ids: string[]) => ipcRenderer.invoke('delete:yaml-sn', ids),
  },
  feature: {
    labelPrint: (ids: string[], config?: unknown) => ipcRenderer.invoke('feature:label-print', ids, config),
    labelDelete: (ids: string[]) => ipcRenderer.invoke('feature:label-delete', ids),
  },
  guide: {
    getContent: (lang: string) => ipcRenderer.invoke('guide:getContent', lang),
  },
  file: {
    read: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
    write: (filePath: string, content: string) => ipcRenderer.invoke('file:write', filePath, content),
    readExcel: (filePath: string, sheet?: string) => ipcRenderer.invoke('file:readExcel', filePath, sheet),
    readDocx: (filePath: string) => ipcRenderer.invoke('file:readDocx', filePath),
    exists: (filePath: string) => ipcRenderer.invoke('file:exists', filePath),
  },
  dialog: {
    openFile: (options?: Electron.OpenDialogOptions) => ipcRenderer.invoke('dialog:openFile', options),
    saveFile: (options?: Electron.SaveDialogOptions) => ipcRenderer.invoke('dialog:saveFile', options),
    showMessage: (options: { type: 'info' | 'warning' | 'error'; title: string; message: string }) =>
      ipcRenderer.invoke('dialog:showMessage', options),
    showConfirm: (options: { title: string; message: string }) => ipcRenderer.invoke('dialog:showConfirm', options),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPath: (name: 'home' | 'appData' | 'userData' | 'backend' | 'workspace') => ipcRenderer.invoke('app:getPath', name),
    checkUpdate: () => ipcRenderer.invoke('app:check-update'),
    downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
    quitAndInstall: () => ipcRenderer.invoke('app:quit-and-install'),
    onUpdateStatus: (callback: (status: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => callback(data)
      ipcRenderer.on('update-status', handler)
      return () => ipcRenderer.removeListener('update-status', handler)
    },
    getLanguage: () => ipcRenderer.invoke('app:getLanguage'),
    setLanguage: (lang: string) => ipcRenderer.invoke('app:setLanguage', lang),
    onLanguageChange: (callback: (lang: string) => void) => {
      const handler = (_e: unknown, lang: string) => callback(lang)
      ipcRenderer.on('language-changed', handler)
      return () => ipcRenderer.removeListener('language-changed', handler)
    },
  },
  log: {
    onOutput: (callback: (data: { level: string; message: string; source?: string }) => void) => {
      const handler = (_e: unknown, data: { level: string; message: string; source?: string }) => callback(data)
      ipcRenderer.on('log:output', handler)
      return () => ipcRenderer.removeListener('log:output', handler)
    },
    write: (level: string, message: string) => ipcRenderer.invoke('log:write', level, message),
  },
  shell: {
    showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),
  },
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: process.platform,
    arch: process.arch,
  },
}

contextBridge.exposeInMainWorld('electron', api)
