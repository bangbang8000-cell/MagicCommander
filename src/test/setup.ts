import '@testing-library/jest-dom'
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
