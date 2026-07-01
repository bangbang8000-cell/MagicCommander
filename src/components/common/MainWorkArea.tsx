import { RenderPanel } from './RenderPanel'
import { LogViewer } from './LogViewer'

export function MainWorkArea() {
  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <RenderPanel />
      <LogViewer />
    </main>
  )
}
