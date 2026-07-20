import { contextBridge, ipcRenderer } from 'electron'

// 向渲染进程暴露安全的 API
const api = {
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    listExamples: () => ipcRenderer.invoke('project:listExamples'),
    listTemplates: () => ipcRenderer.invoke('project:listTemplates'),
    getTemplate: (id: string) => ipcRenderer.invoke('project:getTemplate', id),
    create: (name: string, options?: { template?: string; empty?: boolean }) =>
      ipcRenderer.invoke('project:create', name, options),
    saveAsExample: (projectName: string, exampleName: string) =>
      ipcRenderer.invoke('project:saveAsExample', projectName, exampleName),
    saveAsTemplate: (projectName: string, templateName: string, meta: unknown) =>
      ipcRenderer.invoke('project:saveAsTemplate', projectName, templateName, meta),
    updateTemplateMeta: (id: string, meta: unknown) => ipcRenderer.invoke('project:updateTemplateMeta', id, meta),
    deleteTemplate: (id: string) => ipcRenderer.invoke('project:deleteTemplate', id),
    getWorkspaceIndex: () => ipcRenderer.invoke('project:getWorkspaceIndex'),
    delete: (ids: string[]) => ipcRenderer.invoke('project:delete', ids),
    getStructure: (name: string) => ipcRenderer.invoke('project:structure', name),
    parameters: (name: string) => ipcRenderer.invoke('project:parameters', name),
    readExcel: (id: number, filePath: string, projectName?: string) =>
      ipcRenderer.invoke('project:readExcel', id, filePath, projectName),
    writeExcel: (
      id: number,
      filePath: string,
      sheets: { name: string; headers: string[]; rows: Record<string, any>[] }[],
      projectName?: string,
    ) => ipcRenderer.invoke('project:writeExcel', id, filePath, sheets, projectName),
    readFile: (id: number, filePath: string, projectName?: string) =>
      ipcRenderer.invoke('project:readFile', id, filePath, projectName),
    writeFile: (id: number, filePath: string, content: string, projectName?: string) =>
      ipcRenderer.invoke('project:writeFile', id, filePath, content, projectName),
    readDocx: (id: number, filePath: string, projectName?: string) =>
      ipcRenderer.invoke('project:readDocx', id, filePath, projectName),
    readDocxBuffer: (id: number, filePath: string, projectName?: string) =>
      ipcRenderer.invoke('project:readDocxBuffer', id, filePath, projectName),
    listFiles: (id: string, fileType?: string) => ipcRenderer.invoke('project:listFiles', id, fileType),
  },
  render: {
    project: (ids: string[]) => ipcRenderer.invoke('render:project', ids),
    yaml: (ids: string[]) => ipcRenderer.invoke('render:yaml', ids),
    projectSn: (ids: string[]) => ipcRenderer.invoke('render:project-sn', ids),
    yamlSn: (ids: string[]) => ipcRenderer.invoke('render:yaml-sn', ids),
    undo: (ids: string[]) => ipcRenderer.invoke('render:undo', ids),
    dryRun: (ids: string[], format?: 'device_name' | 'device_sn') =>
      ipcRenderer.invoke('render:dry-run', ids, format),
    onProgress: (callback: (progress: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => callback(data)
      ipcRenderer.on('render:progress', handler)
      return () => ipcRenderer.removeListener('render:progress', handler)
    },
    validateTemplate: (ids: string[]) => ipcRenderer.invoke('validate:template', ids),
    validateExcel: (ids: string[]) => ipcRenderer.invoke('validate:excel', ids),
    diffCompare: (project: string, device: string, content: string, format: string) =>
      ipcRenderer.invoke('diff:compare', project, device, content, format),
  },
  delete: {
    output: (ids: string[]) => ipcRenderer.invoke('delete:output', ids),
    outputSn: (ids: string[]) => ipcRenderer.invoke('delete:output-sn', ids),
    yaml: (ids: string[]) => ipcRenderer.invoke('delete:yaml', ids),
    yamlSn: (ids: string[]) => ipcRenderer.invoke('delete:yaml-sn', ids),
  },
  feature: {
    labelPrint: (ids: string[], config?: unknown) => ipcRenderer.invoke('feature:label-print', ids, config),
    labelMarkdown: (ids: string[], config?: unknown) => ipcRenderer.invoke('feature:label-markdown', ids, config),
    labelPdf: (ids: string[], config?: unknown) => ipcRenderer.invoke('feature:label-pdf', ids, config),
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
    getBuildInfo: () => ipcRenderer.invoke('app:getBuildInfo'),
    getPath: (name: 'home' | 'appData' | 'userData' | 'backend' | 'workspace') =>
      ipcRenderer.invoke('app:getPath', name),
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
  aihub: {
    start: () => ipcRenderer.invoke('aihub:start'),
    stop: () => ipcRenderer.invoke('aihub:stop'),
    status: () => ipcRenderer.invoke('aihub:status'),
    health: () => ipcRenderer.invoke('aihub:health'),
    chat: (
      sessionId: string,
      message: string,
      mode?: string,
      provider?: string,
      attachments?: Array<{ id: string; name: string; type: string; path: string; size: number }>,
    ) => ipcRenderer.invoke('aihub:chat', sessionId, message, mode, provider, attachments),
    clearSession: (sessionId: string) => ipcRenderer.invoke('aihub:clearSession', sessionId),
    getProviders: () => ipcRenderer.invoke('aihub:getProviders'),
    configureProvider: (provider: string, apiKey: string, model?: string, baseUrl?: string) =>
      ipcRenderer.invoke('aihub:configureProvider', provider, apiKey, model, baseUrl),
    setDefaultProvider: (provider: string) => ipcRenderer.invoke('aihub:setDefaultProvider', provider),
    testConnection: (provider: string, apiKey: string, baseUrl: string, model: string) =>
      ipcRenderer.invoke('aihub:testConnection', provider, apiKey, baseUrl, model),
    fetchModels: (baseUrl: string, apiKey: string) =>
      ipcRenderer.invoke('aihub:fetchModels', baseUrl, apiKey),
    onStream: (callback: (data: { sessionId: string; chunk: string }) => void) => {
      const handler = (_e: unknown, data: { sessionId: string; chunk: string }) => callback(data)
      ipcRenderer.on('aihub:stream', handler)
      return () => ipcRenderer.removeListener('aihub:stream', handler)
    },
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (callback: (maximized: boolean) => void) => {
      const handler = (_e: unknown, maximized: boolean) => callback(maximized)
      ipcRenderer.on('window:maximizeChange', handler)
      return () => ipcRenderer.removeListener('window:maximizeChange', handler)
    },
  },
  onMenuNewProject: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('menu:newProject', handler)
    return () => {
      ipcRenderer.removeListener('menu:newProject', handler)
    }
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
