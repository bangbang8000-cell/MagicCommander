import { useProjectStore } from '@/stores/project.store'
import { useRenderStore } from '@/stores/render.store'
import { useEditorStore } from '@/stores/editor.store'
import { Button } from '@/components/ui/Button'
import { Play, FileText, RefreshCw, FolderOpen, FileCheck, FileCode, FileOutput } from 'lucide-react'
import { useState, useEffect } from 'react'

export function ConfigPanel() {
  const selectedProject = useProjectStore((s) => s.selectedProject)
  const isRendering = useRenderStore((s) => s.isRendering)
  const renderProject = useRenderStore((s) => s.renderProject)
  const renderYaml = useRenderStore((s) => s.renderYaml)
  const renderProjectSn = useRenderStore((s) => s.renderProjectSn)
  const renderYamlSn = useRenderStore((s) => s.renderYamlSn)
  const deleteOutput = useRenderStore((s) => s.deleteOutput)
  const deleteOutputSn = useRenderStore((s) => s.deleteOutputSn)
  const deleteYaml = useRenderStore((s) => s.deleteYaml)
  const deleteYamlSn = useRenderStore((s) => s.deleteYamlSn)
  const config = useRenderStore((s) => s.config)
  const setConfig = useRenderStore((s) => s.setConfig)
  const progress = useRenderStore((s) => s.progress)
  const currentMessage = useRenderStore((s) => s.currentMessage)
  const openFile = useEditorStore((s) => s.openFile)

  const [projectInfo, setProjectInfo] = useState<any>(null)

  useEffect(() => {
    if (selectedProject) {
      window.electron.project.parameters(String(selectedProject.id)).then(setProjectInfo).catch(() => setProjectInfo(null))
    } else {
      setProjectInfo(null)
    }
  }, [selectedProject])

  if (!selectedProject) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-gray-400 p-4 text-center">
        请先在项目浏览器中选择一个项目
      </div>
    )
  }

  const handleRender = async () => {
    const ids = [String(selectedProject.id)]
    if (config.renderType === 'project') {
      if (config.outputFormat === 'device_name') await renderProject(ids)
      else await renderProjectSn(ids)
    } else {
      if (config.outputFormat === 'device_name') await renderYaml(ids)
      else await renderYamlSn(ids)
    }
  }

  const handleDeleteOutput = async () => {
    const ids = [String(selectedProject.id)]
    if (config.outputFormat === 'device_name') await deleteOutput(ids)
    else await deleteOutputSn(ids)
  }

  const handleDeleteYaml = async () => {
    const ids = [String(selectedProject.id)]
    if (config.outputFormat === 'device_name') await deleteYaml(ids)
    else await deleteYamlSn(ids)
  }

  const openParaConfig = () => {
    openFile({
      id: '',
      title: 'para.xlsx',
      filePath: 'para.xlsx',
      fileType: 'excel',
      projectId: selectedProject.id,
      projectName: selectedProject.name,
      isDirty: false,
    })
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-3 space-y-3">
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1">
            <FolderOpen size={12} /> 项目信息
          </h4>
          <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">名称</span>
              <span className="font-medium">{selectedProject.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">ID</span>
              <span className="font-medium">{selectedProject.id}</span>
            </div>
            {projectInfo && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-500">路径</span>
                  <span className="font-medium text-[10px] truncate max-w-[140px]">{projectInfo.path}</span>
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {projectInfo.structure?.excel && <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[10px]">Excel</span>}
                  {projectInfo.structure?.templates && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">模板</span>}
                  {projectInfo.structure?.para && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-[10px]">参数</span>}
                  {projectInfo.structure?.output && <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px]">输出</span>}
                  {projectInfo.structure?.yaml && <span className="px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded text-[10px]">YAML</span>}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1">
            <FileCheck size={12} /> 参数配置
          </h4>
          <Button variant="secondary" size="sm" icon={<FileCode size={12} />} onClick={openParaConfig} className="w-full justify-start">
            打开 para.xlsx
          </Button>
        </div>

        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1">
            <Play size={12} /> 渲染操作
          </h4>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              <span>格式:</span>
              <select
                value={config.outputFormat}
                onChange={(e) => setConfig({ outputFormat: e.target.value as 'device_name' | 'device_sn' })}
                className="text-[10px] border border-gray-300 rounded px-1 py-0.5 flex-1"
              >
                <option value="device_name">设备名</option>
                <option value="device_sn">设备SN</option>
              </select>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-500">
              <span>类型:</span>
              <select
                value={config.renderType}
                onChange={(e) => setConfig({ renderType: e.target.value as 'project' | 'yaml' })}
                className="text-[10px] border border-gray-300 rounded px-1 py-0.5 flex-1"
              >
                <option value="project">项目配置</option>
                <option value="yaml">YAML文件</option>
              </select>
            </div>
          </div>
          <Button variant="primary" size="sm" icon={<Play size={12} />} onClick={handleRender} disabled={isRendering} loading={isRendering} className="w-full justify-start">
            执行渲染
          </Button>
        </div>

        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1">
            <RefreshCw size={12} /> 清理操作
          </h4>
          <div className="flex flex-col gap-1">
            <Button variant="secondary" size="sm" icon={<FileOutput size={12} />} onClick={handleDeleteOutput} disabled={isRendering} className="w-full justify-start">
              删除输出
            </Button>
            <Button variant="secondary" size="sm" icon={<FileCode size={12} />} onClick={handleDeleteYaml} disabled={isRendering} className="w-full justify-start">
              删除YAML
            </Button>
          </div>
        </div>

        {isRendering && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-gray-600">
              <span className="truncate">{currentMessage || '处理中...'}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div className="bg-primary-600 h-1 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
