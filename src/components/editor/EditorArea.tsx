import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { X, SplitSquareVertical, Layout, RotateCcw } from 'lucide-react'
import clsx from 'clsx'
import { MonacoEditor } from './MonacoEditor'
import { ExcelViewer } from './ExcelViewer'
import { WordViewer } from './WordViewer'
import { UnsupportedViewer } from './UnsupportedViewer'
import { Modal } from '@/components/ui/Modal'
import { getFileTypeIcon } from '@/config/icons'

export function EditorArea() {
  const { t } = useTranslation()
  const openTabs = useEditorStore((s) => s.openTabs)
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const splitTabs = useEditorStore((s) => s.splitTabs)
  const activeSplitTabId = useEditorStore((s) => s.activeSplitTabId)
  const splitMode = useEditorStore((s) => s.splitMode)
  const closeTab = useEditorStore((s) => s.closeTab)
  const setActiveTab = useEditorStore((s) => s.setActiveTab)
  const setSplitMode = useEditorStore((s) => s.setSplitMode)
  const pendingCloseTabId = useEditorStore((s) => s.pendingCloseTabId)
  const confirmClose = useEditorStore((s) => s.confirmClose)
  const setPendingCloseTab = useEditorStore((s) => s.setPendingCloseTab)
  const recentClosedTabs = useEditorStore((s) => s.recentClosedTabs)
  const reopenLastClosed = useEditorStore((s) => s.reopenLastClosed)
  const isDark = useUIStore((s) => s.isDark)
  const syncScroll = useUIStore((s) => s.syncScroll)
  const toggleSyncScroll = useUIStore((s) => s.toggleSyncScroll)

  // 初始化监听：确保 openTabs 变化时同步 activeTabId
  const isInitialized = useRef(false)
  useEffect(() => {
    if (!isInitialized.current && openTabs.length > 0 && !activeTabId) {
      setActiveTab(openTabs[0].id)
      isInitialized.current = true
    } else if (activeTabId) {
      isInitialized.current = true
    }
  }, [openTabs, activeTabId, setActiveTab])

  const activeTab = openTabs.find((t) => t.id === activeTabId) || null
  const activeSplitTab = splitTabs.find((t) => t.id === activeSplitTabId) || null

  const pendingTab = [...openTabs, ...splitTabs].find((t) => t.id === pendingCloseTabId)

  const renderEditor = (tab: typeof activeTab) => {
    if (!tab) {
      return (
        <div className={`absolute inset-0 flex items-center justify-center text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          <div className="text-center space-y-2">
            <Layout size={48} className={`mx-auto ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
            <p>{t('editor:empty.openFileHint')}</p>
            <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{t('editor:empty.supportedFormats')}</p>
          </div>
        </div>
      )
    }

    console.log('[EditorArea] 渲染组件 - fileType:', tab.fileType)
    switch (tab.fileType) {
      case 'excel':
        return <ExcelViewer key={tab.id} tab={tab} />
      case 'word':
        return <WordViewer key={tab.id} tab={tab} />
      case 'yaml':
      case 'template':
      case 'output':
      case 'text':
      default:
        return <MonacoEditor key={tab.id} tab={tab} />
    }
  }

  const renderUnsavedModal = () => {
    if (!pendingTab) return null
    return (
      <Modal
        open
        onClose={() => setPendingCloseTab(null)}
        title={t('editor:modal.unsavedTitle')}
        width="380px"
        footer={
          <>
            <button
              onClick={() => setPendingCloseTab(null)}
              className={clsx(
                'px-4 py-1.5 text-sm rounded border',
                isDark ? 'border-gray-600 hover:bg-gray-700 text-gray-200' : 'border-gray-300 hover:bg-gray-50 text-gray-700',
              )}
            >
              {t('editor:modal.cancel')}
            </button>
            <button
              onClick={() => {
                setPendingCloseTab(null)
                if (pendingTab.id) closeTab(pendingTab.id, true)
              }}
              className="px-4 py-1.5 text-sm rounded bg-red-600 text-white hover:bg-red-700"
            >
              {t('editor:modal.dontSave')}
            </button>
            <button
              onClick={() => {
                confirmClose()
                if (pendingTab.id) closeTab(pendingTab.id, true)
              }}
              className="px-4 py-1.5 text-sm rounded bg-primary-600 text-white hover:bg-primary-700"
            >
              {t('editor:modal.save')}
            </button>
          </>
        }
      >
        <p className={clsx('text-sm', isDark ? 'text-gray-200' : 'text-gray-700')}>
          <strong>{pendingTab.title}</strong> {t('editor:modal.unsavedMessage', { name: pendingTab.title })}
        </p>
        <p className={`text-sm mt-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{t('editor:modal.saveBeforeClose')}</p>
      </Modal>
    )
  }

  const renderTabBar = (tabs: typeof openTabs, activeId: string | null, isSplit: boolean) => (
    <div className={`flex items-center border-b h-9 shrink-0 overflow-x-auto ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
      {tabs.map((tab) => {
        // 构建完整的悬浮提示信息
        const dirPath = tab.filePath.includes('/')
          ? tab.filePath.substring(0, tab.filePath.lastIndexOf('/'))
          : ''
        const fullPath = dirPath
          ? `${tab.projectName} / ${dirPath} / ${tab.title}`
          : `${tab.projectName} / ${tab.title}`

        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={fullPath}
            className={clsx(
              `flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer border-e select-none group whitespace-nowrap ${isDark ? 'border-gray-700' : 'border-gray-200'}`,
              activeId === tab.id
                ? isDark
                  ? 'bg-gray-900 text-gray-100 border-b-2 border-b-primary-400'
                  : 'bg-white text-gray-900 border-b-2 border-b-primary-500 shadow-sm'
                : isDark
                ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
            )}
          >
            {(() => {
              const IconComponent = getFileTypeIcon(tab.fileType)
              return <IconComponent size={14} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
            })()}
            <span className={clsx(tab.isDirty && 'italic')}>
              {tab.title}
              {tab.isDirty && ' \u2022'}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className={clsx(
                'ms-1 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity',
                isDark ? 'hover:bg-gray-600 text-gray-400' : 'hover:bg-gray-200 text-gray-400',
              )}
            >
              <X size={10} />
            </button>
          </div>
        )
      })}
      {!isSplit && (
        <div className="ms-auto flex items-center gap-0.5 pr-1">
          <button
            onClick={() => reopenLastClosed()}
            disabled={recentClosedTabs.length === 0}
            className={clsx(
              'p-1 rounded transition-opacity',
              recentClosedTabs.length > 0
                ? isDark
                  ? 'text-gray-400 hover:bg-gray-700'
                  : 'text-gray-500 hover:bg-gray-200'
                : isDark
                ? 'text-gray-600 cursor-not-allowed'
                : 'text-gray-300 cursor-not-allowed',
            )}
            title={t('editor:tabs.reopenTooltip')}
          >
            <RotateCcw size={14} />
          </button>
          {splitMode !== 'none' && (
            <button
              onClick={() => toggleSyncScroll()}
              className={clsx(
                'p-1 rounded',
                syncScroll && (isDark ? 'bg-gray-700' : 'bg-gray-200'),
                isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-200',
              )}
              title={syncScroll ? t('editor:split.closeSyncScroll') : t('editor:split.openSyncScroll')}
            >
              <span className="text-xs font-bold leading-none">{'\u21C5'}</span>
            </button>
          )}
          <button
              onClick={() => setSplitMode(splitMode === 'vertical' ? 'none' : 'vertical')}
              className={clsx(
                'p-1 rounded',
                splitMode === 'vertical' && (isDark ? 'bg-gray-700' : 'bg-gray-200'),
                isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-200',
              )}
              title={t('editor:split.verticalSplit')}
            >
            <SplitSquareVertical size={14} />
          </button>
        </div>
      )}
    </div>
  )

  if (splitMode === 'none') {
    return (
      <div className="w-full h-full flex flex-col">
        <div className={`flex-1 flex flex-col min-h-0 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
          {renderTabBar(openTabs, activeTabId, false)}
          <div className="flex-1 min-h-0 relative overflow-hidden">
            <div className="w-full h-full">
              {renderEditor(activeTab)}
            </div>
          </div>
        </div>
        {renderUnsavedModal()}
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 flex min-h-0">
        <div className={clsx('flex-1 flex flex-col min-h-0 border-e', isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300')}>
          {renderTabBar(openTabs, activeTabId, false)}
          <div className="flex-1 min-h-0 relative overflow-hidden">
            <div className="w-full h-full">
              {renderEditor(activeTab)}
            </div>
          </div>
        </div>
        <div className={clsx('flex-1 flex flex-col min-h-0', isDark ? 'bg-gray-900' : 'bg-white')}>
          {renderTabBar(splitTabs, activeSplitTabId, true)}
          <div className="flex-1 min-h-0 relative overflow-hidden">
            <div className="w-full h-full">
              {renderEditor(activeSplitTab)}
            </div>
          </div>
        </div>
      </div>
      {renderUnsavedModal()}
    </div>
  )
}