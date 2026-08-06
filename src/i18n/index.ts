// ============================================================
// i18n 渲染进程配置
// 使用 react-i18next + i18next，通过 Vite 静态 import JSON 加载翻译
// ============================================================

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import commonZh from './locales/zh-CN/common.json'
import chatZh from './locales/zh-CN/chat.json'
import cloudZh from './locales/zh-CN/cloud.json'
import editorZh from './locales/zh-CN/editor.json'
import projectZh from './locales/zh-CN/project.json'
import errorsZh from './locales/zh-CN/errors.json'
import welcomeZh from './locales/zh-CN/welcome.json'
import terminalZh from './locales/zh-CN/terminal.json'

import commonZhTw from './locales/zh-TW/common.json'
import editorZhTw from './locales/zh-TW/editor.json'
import projectZhTw from './locales/zh-TW/project.json'
import errorsZhTw from './locales/zh-TW/errors.json'
import welcomeZhTw from './locales/zh-TW/welcome.json'
import terminalZhTw from './locales/zh-TW/terminal.json'

import commonEn from './locales/en/common.json'
import chatEn from './locales/en/chat.json'
import cloudEn from './locales/en/cloud.json'
import editorEn from './locales/en/editor.json'
import projectEn from './locales/en/project.json'
import errorsEn from './locales/en/errors.json'
import welcomeEn from './locales/en/welcome.json'
import terminalEn from './locales/en/terminal.json'

import commonJa from './locales/ja/common.json'
import editorJa from './locales/ja/editor.json'
import projectJa from './locales/ja/project.json'
import errorsJa from './locales/ja/errors.json'
import welcomeJa from './locales/ja/welcome.json'
import terminalJa from './locales/ja/terminal.json'

import commonKo from './locales/ko/common.json'
import editorKo from './locales/ko/editor.json'
import projectKo from './locales/ko/project.json'
import errorsKo from './locales/ko/errors.json'
import welcomeKo from './locales/ko/welcome.json'
import terminalKo from './locales/ko/terminal.json'

import commonFr from './locales/fr/common.json'
import editorFr from './locales/fr/editor.json'
import projectFr from './locales/fr/project.json'
import errorsFr from './locales/fr/errors.json'
import welcomeFr from './locales/fr/welcome.json'
import terminalFr from './locales/fr/terminal.json'

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': {
      common: commonZh,
      chat: chatZh,
      cloud: cloudZh,
      editor: editorZh,
      project: projectZh,
      errors: errorsZh,
      welcome: welcomeZh,
      terminal: terminalZh,
    },
    'zh-TW': {
      common: commonZhTw,
      editor: editorZhTw,
      project: projectZhTw,
      errors: errorsZhTw,
      welcome: welcomeZhTw,
      terminal: terminalZhTw,
    },
    en: {
      common: commonEn,
      chat: chatEn,
      cloud: cloudEn,
      editor: editorEn,
      project: projectEn,
      errors: errorsEn,
      welcome: welcomeEn,
      terminal: terminalEn,
    },
    ja: {
      common: commonJa,
      editor: editorJa,
      project: projectJa,
      errors: errorsJa,
      welcome: welcomeJa,
      terminal: terminalJa,
    },
    ko: {
      common: commonKo,
      editor: editorKo,
      project: projectKo,
      errors: errorsKo,
      welcome: welcomeKo,
      terminal: terminalKo,
    },
    fr: {
      common: commonFr,
      editor: editorFr,
      project: projectFr,
      errors: errorsFr,
      welcome: welcomeFr,
      terminal: terminalFr,
    },
  },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  ns: ['common', 'chat', 'cloud', 'editor', 'project', 'errors', 'welcome', 'terminal'],
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
  detection: {
    order: ['localStorage', 'navigator'],
    caches: ['localStorage'],
  },
})

export default i18n
