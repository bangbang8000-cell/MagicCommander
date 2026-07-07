/**
 * Electron API mock for browser development mode.
 * Bridges window.electron.api to the FastAPI bridge server (port 8765).
 */
(function () {
  'use strict';

  const BASE = 'http://localhost:8765/api';

  async function post(channel, body) {
    const res = await fetch(BASE + '/' + channel, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    return res.json();
  }

  // ── SSE progress relay ──
  const progressListeners = new Set();
  let eventSource = null;

  function ensureSSE() {
    if (eventSource) return;
    eventSource = new EventSource(BASE.replace('/api', '/api/progress'));
    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'ping') return;
        progressListeners.forEach((cb) => cb(data));
      } catch (_) {}
    };
    eventSource.onerror = () => {
      // Reconnect after 2s
      eventSource.close();
      eventSource = null;
      setTimeout(ensureSSE, 2000);
    };
  }

  const api = {
    project: {
      list: () => post('project:list', {}),
      create: (name) => post('project:create', { name }),
      delete: (ids) => post('project:delete', { ids }),
      getStructure: (name) => post('project:structure', { name }),
      parameters: (id) => post('project:parameters', { id }),
      readExcel: (id, filePath) => post('project:readExcel', { id, filePath }),
      writeExcel: (id, filePath, sheets) =>
        post('project:writeExcel', { id, filePath, sheets }),
      readFile: (id, filePath) => post('project:readFile', { id, filePath }),
      writeFile: (id, filePath, content) =>
        post('project:writeFile', { id, filePath, content }),
      readDocx: (id, filePath) => post('project:readDocx', { id, filePath }),
      readDocxBuffer: (id, filePath) =>
        post('project:readDocxBuffer', { id, filePath }),
      listFiles: (id, fileType) =>
        post('project:listFiles', { id, fileType }),
    },
    render: {
      project: (ids) => post('render:project', { ids }),
      yaml: (ids) => post('render:yaml', { ids }),
      projectSn: (ids) => post('render:project-sn', { ids }),
      yamlSn: (ids) => post('render:yaml-sn', { ids }),
      onProgress: (callback) => {
        ensureSSE();
        progressListeners.add(callback);
        return () => progressListeners.delete(callback);
      },
    },
    delete: {
      output: (ids) => post('delete:output', { ids }),
      outputSn: (ids) => post('delete:output-sn', { ids }),
      yaml: (ids) => post('delete:yaml', { ids }),
      yamlSn: (ids) => post('delete:yaml-sn', { ids }),
    },
    feature: {
      labelPrint: (ids, config) =>
        post('feature:label-print', { ids, config }),
      labelDelete: (ids) => post('feature:label-delete', { ids }),
    },
    file: {
      read: (filePath) => post('file:read', { path: filePath }),
      write: (filePath, content) =>
        post('file:write', { path: filePath, content }),
      readExcel: (filePath, sheet) =>
        post('file:readExcel', { path: filePath, sheet }),
      readDocx: (filePath) => post('file:readDocx', { path: filePath }),
      exists: (filePath) => post('file:exists', { path: filePath }),
    },
    dialog: {
      openFile: () => Promise.reject(new Error('Not available in browser mode')),
      saveFile: () => Promise.reject(new Error('Not available in browser mode')),
      showMessage: () => Promise.resolve(),
      showConfirm: () => Promise.resolve(true),
    },
    app: {
      getVersion: () => post('app:getVersion', {}),
      getPath: (name) => post('app:getPath', { name }),
      checkUpdate: () => Promise.resolve(null),
      downloadUpdate: () => Promise.resolve(),
      quitAndInstall: () => {},
      onUpdateStatus: () => () => {},
      getLanguage: () => Promise.resolve('zh-CN'),
      setLanguage: () => Promise.resolve(),
      onLanguageChange: () => () => {},
    },
    log: {
      onOutput: () => () => {},
      write: () => Promise.resolve(),
    },
    shell: {
      showItemInFolder: () => Promise.resolve(),
    },
    versions: {
      node: '22.22.1',
      electron: '28.0.0 (mock)',
      chrome: '122.0.0.0',
      platform: 'linux',
      arch: 'x64',
    },
  };

  window.electron = api;
  console.log('[MC Bridge] window.electron mock initialized (bridge port 8765)');
})();
