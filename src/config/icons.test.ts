import { describe, it, expect } from 'vitest'
import {
  ACTIVITY_ICONS,
  FILE_TYPE_ICONS,
  OUTPUT_DIR_ICONS,
  EMPTY_STATE_ICONS,
  ACTION_ICONS,
  STATUS_ICONS,
  PANEL_ICONS,
  getFileTypeIcon,
  getOutputDirIcon,
  getActivityIcon,
  FolderOpen,
  Folder,
  FileText,
  FileCheck,
} from './icons'

describe('icons 配置（508-a 覆盖率）', () => {
  it('各图标映射表的键与取值均有效', () => {
    const tables = [
      ACTIVITY_ICONS,
      FILE_TYPE_ICONS,
      OUTPUT_DIR_ICONS,
      EMPTY_STATE_ICONS,
      ACTION_ICONS,
      STATUS_ICONS,
      PANEL_ICONS,
    ]
    expect(tables.length).toBe(7)
    for (const table of tables) {
      for (const [key, Icon] of Object.entries(table)) {
        expect(key).toBeTruthy()
        expect(typeof Icon).toBe('object') // lucide 组件
      }
    }
  })

  it('活动栏图标包含完整 6 项', () => {
    expect(Object.keys(ACTIVITY_ICONS)).toEqual([
      'explorer',
      'search',
      'config',
      'label',
      'render',
      'output',
    ])
  })

  it('文件类型图标含未知类型回退', () => {
    expect(FILE_TYPE_ICONS.unknown).toBe(FileText)
    expect(FILE_TYPE_ICONS.word).toBe(FileText)
  })

  it('getFileTypeIcon：已知类型命中，未知类型回退 FileText', () => {
    expect(getFileTypeIcon('excel')).toBe(FILE_TYPE_ICONS.excel)
    expect(getFileTypeIcon('yaml')).toBe(FILE_TYPE_ICONS.yaml)
    expect(getFileTypeIcon('not-a-type')).toBe(FileText)
    expect(getFileTypeIcon('')).toBe(FileText)
  })

  it('getOutputDirIcon：已知目录命中，未知回退 Folder', () => {
    expect(getOutputDirIcon('output')).toBe(OUTPUT_DIR_ICONS.output)
    expect(getOutputDirIcon('yaml-sn')).toBe(OUTPUT_DIR_ICONS['yaml-sn'])
    expect(getOutputDirIcon('missing')).toBe(Folder)
  })

  it('getActivityIcon：已知活动命中，未知回退 FolderOpen', () => {
    expect(getActivityIcon('explorer')).toBe(ACTIVITY_ICONS.explorer)
    expect(getActivityIcon('output')).toBe(ACTIVITY_ICONS.output)
    expect(getActivityIcon('unknown')).toBe(FolderOpen)
  })

  it('状态图标含全部 6 种语义', () => {
    expect(Object.keys(STATUS_ICONS)).toEqual([
      'error',
      'success',
      'warning',
      'info',
      'loading',
      'alert',
    ])
    expect(STATUS_ICONS.success).toBeTruthy()
  })

  it('操作图标关键项齐全', () => {
    for (const key of ['refresh', 'add', 'delete', 'download', 'undo', 'redo', 'save']) {
      expect(ACTION_ICONS[key as keyof typeof ACTION_ICONS]).toBeTruthy()
    }
    expect(ACTION_ICONS.hide).not.toBe(ACTION_ICONS.view)
  })

  it('文件类型图标 Excel 命中', () => {
    expect(FILE_TYPE_ICONS.excel).toBeTruthy()
    expect(FILE_TYPE_ICONS.output).toBe(FileCheck)
  })
})