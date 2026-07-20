import clsx from 'clsx'
import { ReactNode, useCallback } from 'react'
import { ResizeHandle } from '@/components/common/ResizeHandle'
import { useUIStore } from '@/stores/ui.store'

type ResizableAppLayoutProps = {
  isDark: boolean
  sidebarVisible: boolean
  panelVisible: boolean
  sidebar: ReactNode
  editor: ReactNode
  bottomPanel: ReactNode
}

export function ResizableAppLayout({
  isDark,
  sidebarVisible,
  panelVisible,
  sidebar,
  editor,
  bottomPanel,
}: ResizableAppLayoutProps) {
  const sidebarPx = useUIStore((s) => s.sidebarPx)
  const bottomPx = useUIStore((s) => s.bottomPx)
  const setSidebarPx = useUIStore((s) => s.setSidebarPx)
  const setBottomPx = useUIStore((s) => s.setBottomPx)

  const resizeSidebar = useCallback((delta: number) => setSidebarPx(sidebarPx + delta), [setSidebarPx, sidebarPx])
  const resizeBottom = useCallback((delta: number) => setBottomPx(bottomPx - delta), [setBottomPx, bottomPx])

  return (
    <div className="flex-1 flex overflow-hidden">
      {sidebarVisible && (
        <>
          <div
            className={clsx('flex-shrink-0 overflow-hidden', isDark ? 'bg-gray-900 border-r border-gray-700' : 'bg-white border-r border-gray-200')}
            style={{ width: sidebarPx }}
          >
            {sidebar}
          </div>
          <ResizeHandle direction="vertical" onResize={resizeSidebar} />
        </>
      )}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className={clsx('flex-1 overflow-hidden min-h-0', isDark ? 'bg-gray-900' : 'bg-white')}>{editor}</div>
        {panelVisible && (
          <>
            <ResizeHandle direction="horizontal" onResize={resizeBottom} />
            <div
              className={clsx('overflow-hidden border-t', isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200')}
              style={{ height: bottomPx }}
            >
              {bottomPanel}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
