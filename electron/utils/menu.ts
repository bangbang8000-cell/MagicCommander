import { Menu, BrowserWindow, shell, app } from 'electron'

export function createApplicationMenu(mainWindow: BrowserWindow): Menu {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建项目',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu:newProject'),
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '操作',
      submenu: [
        {
          label: '渲染项目配置',
          click: () => mainWindow.webContents.send('menu:render', 'project'),
        },
        {
          label: '输出 YAML',
          click: () => mainWindow.webContents.send('menu:render', 'yaml'),
        },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            mainWindow.webContents.send('menu:about')
          },
        },
        {
          label: '访问项目主页',
          click: () => shell.openExternal('https://github.com/magiccommander'),
        },
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}
