import '@testing-library/jest-dom'
// jsdom 未实现 scrollIntoView（CommandPalette 选中项滚动），提供无害 stub
if (typeof HTMLElement !== 'undefined') {
  HTMLElement.prototype.scrollIntoView = () => {}
}
;(globalThis as unknown as { window: typeof globalThis }).window = globalThis
;(globalThis as unknown as { window: { electron: Record<string, unknown> } }).window.electron = {
  project: {
    list: async () => [],
    create: async () => {},
    delete: async () => {},
    getStructure: async () => [],
    readFile: async () => '',
    writeExcel: async () => {},
  },
  file: {
    read: async () => '',
    exists: async () => true,
  },
  app: {
    getPath: async () => '/mock/path',
  },
}
