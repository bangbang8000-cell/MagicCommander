import '@testing-library/jest-dom'
;(globalThis as any).window = globalThis
;(globalThis as any).window.electron = {
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
