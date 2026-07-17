// ============================================================
// i18n 渲染进程配置
// 使用 react-i18next + i18next，通过 Vite 静态 import JSON 加载翻译
// ============================================================

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import commonZh from './locales/zh-CN/common.json'
import chatZh from './locales/zh-CN/chat.json'
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

import commonDe from './locales/de/common.json'
import editorDe from './locales/de/editor.json'
import projectDe from './locales/de/project.json'
import errorsDe from './locales/de/errors.json'
import welcomeDe from './locales/de/welcome.json'
import terminalDe from './locales/de/terminal.json'

import commonEs from './locales/es/common.json'
import editorEs from './locales/es/editor.json'
import projectEs from './locales/es/project.json'
import errorsEs from './locales/es/errors.json'
import welcomeEs from './locales/es/welcome.json'
import terminalEs from './locales/es/terminal.json'

import commonPt from './locales/pt/common.json'
import editorPt from './locales/pt/editor.json'
import projectPt from './locales/pt/project.json'
import errorsPt from './locales/pt/errors.json'
import welcomePt from './locales/pt/welcome.json'
import terminalPt from './locales/pt/terminal.json'

import commonRu from './locales/ru/common.json'
import editorRu from './locales/ru/editor.json'
import projectRu from './locales/ru/project.json'
import errorsRu from './locales/ru/errors.json'
import welcomeRu from './locales/ru/welcome.json'
import terminalRu from './locales/ru/terminal.json'

import commonAr from './locales/ar/common.json'
import editorAr from './locales/ar/editor.json'
import projectAr from './locales/ar/project.json'
import errorsAr from './locales/ar/errors.json'
import welcomeAr from './locales/ar/welcome.json'
import terminalAr from './locales/ar/terminal.json'

import commonVi from './locales/vi/common.json'
import editorVi from './locales/vi/editor.json'
import projectVi from './locales/vi/project.json'
import errorsVi from './locales/vi/errors.json'
import welcomeVi from './locales/vi/welcome.json'
import terminalVi from './locales/vi/terminal.json'

import commonTh from './locales/th/common.json'
import editorTh from './locales/th/editor.json'
import projectTh from './locales/th/project.json'
import errorsTh from './locales/th/errors.json'
import welcomeTh from './locales/th/welcome.json'
import terminalTh from './locales/th/terminal.json'

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': {
      common: commonZh,
      chat: chatZh,
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
    de: {
      common: commonDe,
      editor: editorDe,
      project: projectDe,
      errors: errorsDe,
      welcome: welcomeDe,
      terminal: terminalDe,
    },
    es: {
      common: commonEs,
      editor: editorEs,
      project: projectEs,
      errors: errorsEs,
      welcome: welcomeEs,
      terminal: terminalEs,
    },
    pt: {
      common: commonPt,
      editor: editorPt,
      project: projectPt,
      errors: errorsPt,
      welcome: welcomePt,
      terminal: terminalPt,
    },
    ru: {
      common: commonRu,
      editor: editorRu,
      project: projectRu,
      errors: errorsRu,
      welcome: welcomeRu,
      terminal: terminalRu,
    },
    ar: {
      common: commonAr,
      editor: editorAr,
      project: projectAr,
      errors: errorsAr,
      welcome: welcomeAr,
      terminal: terminalAr,
    },
    vi: {
      common: commonVi,
      editor: editorVi,
      project: projectVi,
      errors: errorsVi,
      welcome: welcomeVi,
      terminal: terminalVi,
    },
    th: {
      common: commonTh,
      editor: editorTh,
      project: projectTh,
      errors: errorsTh,
      welcome: welcomeTh,
      terminal: terminalTh,
    },
  },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  ns: ['common', 'chat', 'editor', 'project', 'errors', 'welcome', 'terminal'],
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
