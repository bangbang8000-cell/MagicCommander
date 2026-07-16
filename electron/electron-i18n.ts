// ============================================================
// Electron 主进程 i18n 配置
// 通过 i18next-fs-backend 从文件系统读取翻译文件
// ============================================================

import i18n from 'i18next'
import Backend from 'i18next-fs-backend'
import * as path from 'path'
import { isDev } from './config'

const localesPath = isDev
  ? path.join(__dirname, '..', 'src', 'i18n', 'locales')
  : path.join(process.resourcesPath, 'locales')

i18n.use(Backend).init({
  backend: {
    loadPath: path.join(localesPath, '{{lng}}', '{{ns}}.json'),
  },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  ns: ['common', 'editor', 'project', 'errors', 'welcome', 'terminal'],
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
