import clsx from 'clsx'
import { useCallback, useRef } from 'react'

type ResizeHandleProps = {
  direction: 'vertical' | 'horizontal'
  onResize: (delta: number) => void
  className?: string
}

export function ResizeHandle({ direction, onResize, className }: ResizeHandleProps) {
  const startRef = useRef<number | null>(null)
  const onResizeRef = useRef(onResize)
  onResizeRef.current = onResize

  const onMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      startRef.current = direction === 'vertical' ? event.clientX : event.clientY
      const handleMove = (moveEvent: MouseEvent) => {
        if (startRef.current === null) return
        const next = direction === 'vertical' ? moveEvent.clientX : moveEvent.clientY
        onResizeRef.current(next - startRef.current)
        startRef.current = next
      }
      const handleUp = () => {
        startRef.current = null
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [direction],
  )

  return (
    <div
      role="separator"
      aria-orientation={direction === 'vertical' ? 'vertical' : 'horizontal'}
      className={clsx(
        direction === 'vertical' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
        'flex-shrink-0 bg-transparent hover:bg-blue-400/60 active:bg-blue-500',
        className,
      )}
      onMouseDown={onMouseDown}
    />
  )
}
