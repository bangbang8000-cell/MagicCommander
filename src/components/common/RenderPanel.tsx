import React, { useState, useCallback, useEffect } from 'react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Play, FileText, Plus, Trash2, Settings, Printer, RefreshCw } from 'lucide-react'
import { useProjectStore } from '@/stores/project.store'
import { useRenderStore } from '@/stores/render.store'
import type { RenderConfig } from '@/types/render'
import { LabelPrintPanel } from './LabelPrintPanel'

const INVALID_CHARS = /[\\/:*?"<>|]/
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

function validateProjectName(name: string): string | null {
  if (!name.trim()) {
    return '请输入项目名'
  }
  if (name.trim().length > 50) {
    return '项目名不能超过50个字符'
  }
  if (INVALID_CHARS.test(name)) {
    return '项目名不能包含以下字符: \\ / : * ? " < > |'
  }
  if (RESERVED_NAMES.test(name)) {
    return '项目名不能使用系统保留名称'
  }
  if (name.trim().startsWith('.') || name.trim().startsWith(' ')) {
    return '项目名不能以点号或空格开头'
  }
  return null
}

export function RenderPanel() {
  const projects = useProjectStore((s) => s.projects)
  const createProject = useProjectStore((s) => s.createProject)
  const deleteProjects = useProjectStore((s) => s.deleteProjects)
  const selectedProjectIds = useRenderStore((s) => s.selectedProjectIds)
  const setSelectedIds = useRenderStore((s) => s.setSelectedIds)
  const isRendering = useRenderStore((s) => s.isRendering)
  const isProjectRendering = useRenderStore((s) => s.isProjectRendering)
  const isYamlRendering = useRenderStore((s) => s.isYamlRendering)
  const isLabelPrinting = useRenderStore((s) => s.isLabelPrinting)
  const renderProject = useRenderStore((s) => s.renderProject)
  const renderYaml = useRenderStore((s) => s.renderYaml)
  const renderProjectSn = useRenderStore((s) => s.renderProjectSn)
  const renderYamlSn = useRenderStore((s) => s.renderYamlSn)
  const labelPrint = useRenderStore((s) => s.labelPrint)
  const labelDelete = useRenderStore((s) => s.labelDelete)
  const deleteOutput = useRenderStore((s) => s.deleteOutput)
  const deleteOutputSn = useRenderStore((s) => s.deleteOutputSn)
  const deleteYaml = useRenderStore((s) => s.deleteYaml)
  const deleteYamlSn = useRenderStore((s) => s.deleteYamlSn)
  const progress = useRenderStore((s) => s.progress)
  const currentMessage = useRenderStore((s) => s.currentMessage)
  const errors = useRenderStore((s) => s.errors)
  const config = useRenderStore((s) => s.config)
  const setConfig = useRenderStore((s) => s.setConfig)
  const resetProgress = useRenderStore((s) => s.resetProgress)

  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)

  const handleCreate = useCallback(async () => {
    const trimmed = newName.trim()
    const error = validateProjectName(trimmed)
    if (error) {
      setCreateError(error)
      return
    }
    try {
      await createProject(trimmed)
      setCreateOpen(false)
      setNewName('')
      setCreateError(null)
    } catch (err) {
      setCreateError((err as Error).message)
    }
  }, [newName, createProject])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewName(e.target.value)
    if (createError) {
      setCreateError(null)
    }
  }, [createError])

  const handleDelete = async () => {
    if (selectedProjectIds.length === 0) return
    const ok = await window.electron.dialog.showConfirm({
      title: '删除项目',
      message: `确定要删除选中的 ${selectedProjectIds.length} 个项目吗？此操作不可恢复。`,
    })
    if (!ok) return
    await deleteProjects(selectedProjectIds)
    setSelectedIds([])
  }

  const toggleProject = (id: number) => {
    const idStr = String(id)
    if (selectedProjectIds.includes(idStr)) {
      setSelectedIds(selectedProjectIds.filter((n) => n !== idStr))
    } else {
      setSelectedIds([...selectedProjectIds, idStr])
    }
  }

  const handleRender = async () => {
    if (selectedProjectIds.length === 0) {
      await window.electron.dialog.showMessage({
        type: 'warning',
        title: '提示',
        message: '请至少选择一个项目进行渲染',
      })
      return
    }

    if (config.renderType === 'project') {
      if (config.outputFormat === 'device_name') {
        await renderProject(selectedProjectIds)
      } else {
        await renderProjectSn(selectedProjectIds)
      }
    } else {
      if (config.outputFormat === 'device_name') {
        await renderYaml(selectedProjectIds)
      } else {
        await renderYamlSn(selectedProjectIds)
      }
    }
  }

  const handleLabelPrint = async () => {
    if (selectedProjectIds.length === 0) {
      await window.electron.dialog.showMessage({
        type: 'warning',
        title: '提示',
        message: '请至少选择一个项目进行标签打印',
      })
      return
    }
    await labelPrint(selectedProjectIds)
  }

  const handleLabelDelete = async () => {
    if (selectedProjectIds.length === 0) {
      await window.electron.dialog.showMessage({
        type: 'warning',
        title: '提示',
        message: '请至少选择一个项目进行标签删除',
      })
      return
    }
    await labelDelete(selectedProjectIds)
  }

  const handleDeleteOutput = async () => {
    if (selectedProjectIds.length === 0) {
      await window.electron.dialog.showMessage({
        type: 'warning',
        title: '提示',
        message: '请至少选择一个项目进行操作',
      })
      return
    }
    
    if (config.outputFormat === 'device_name') {
      await deleteOutput(selectedProjectIds)
    } else {
      await deleteOutputSn(selectedProjectIds)
    }
  }

  const handleDeleteYaml = async () => {
    if (selectedProjectIds.length === 0) {
      await window.electron.dialog.showMessage({
        type: 'warning',
        title: '提示',
        message: '请至少选择一个项目进行操作',
      })
      return
    }
    
    if (config.outputFormat === 'device_name') {
      await deleteYaml(selectedProjectIds)
    } else {
      await deleteYamlSn(selectedProjectIds)
    }
  }

  useEffect(() => {
    if (!isRendering && errors.length > 0) {
      window.electron.dialog.showMessage({
        type: 'error',
        title: '渲染失败',
        message: errors.join('\n'),
      })
    }
  }, [isRendering, errors])

  return (
    <div className="bg-white border-b border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
          新建项目
        </Button>
        <Button
          variant="secondary"
          icon={<Trash2 size={14} />}
          onClick={handleDelete}
          disabled={selectedProjectIds.length === 0}
        >
          删除选中
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-2" />

        <Button
          variant="primary"
          icon={<Play size={14} />}
          onClick={handleRender}
          disabled={isRendering}
          loading={isRendering}
        >
          {config.renderType === 'project' ? '渲染配置' : '输出YAML'}
          {config.outputFormat === 'device_sn' && ' (SN)'}
        </Button>
        <Button
          variant="secondary"
          icon={<FileText size={14} />}
          onClick={() => setConfig({ renderType: config.renderType === 'project' ? 'yaml' : 'project' })}
          disabled={isRendering}
        >
          切换到{config.renderType === 'project' ? 'YAML' : '项目'}模式
        </Button>
        <Button
          variant="secondary"
          icon={<Settings size={14} />}
          onClick={() => setShowConfig(!showConfig)}
        >
          配置
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-2" />

        <Button
          variant="primary"
          icon={<Printer size={14} />}
          onClick={handleLabelPrint}
          disabled={isRendering}
          loading={isLabelPrinting}
        >
          标签打印
        </Button>
        <Button
          variant="secondary"
          icon={<Trash2 size={14} />}
          onClick={handleLabelDelete}
          disabled={isRendering}
        >
          删除标签
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-2" />

        <Button
          variant="secondary"
          icon={<RefreshCw size={14} />}
          onClick={handleDeleteOutput}
          disabled={isRendering}
        >
          删除输出
          {config.outputFormat === 'device_sn' && ' (SN)'}
        </Button>
        <Button
          variant="secondary"
          icon={<RefreshCw size={14} />}
          onClick={handleDeleteYaml}
          disabled={isRendering}
        >
          删除YAML
          {config.outputFormat === 'device_sn' && ' (SN)'}
        </Button>

        <div className="flex-1" />

        <div className="text-xs text-gray-500">
          共 <span className="font-semibold text-primary-600">{projects.length}</span> 个项目，已选{' '}
          <span className="font-semibold text-primary-600">{selectedProjectIds.length}</span> 个
        </div>
      </div>

      {showConfig && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-semibold text-gray-700">渲染配置</h4>
          <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
            <div className="flex items-center gap-1">
              <label className="font-medium">输出格式:</label>
              <select
                value={config.outputFormat}
                onChange={(e) => setConfig({ outputFormat: e.target.value as 'device_name' | 'device_sn' })}
                className="text-xs border border-gray-300 rounded px-2 py-1"
              >
                <option value="device_name">设备名</option>
                <option value="device_sn">设备SN</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <label className="font-medium">渲染类型:</label>
              <select
                value={config.renderType}
                onChange={(e) => setConfig({ renderType: e.target.value as 'project' | 'yaml' })}
                className="text-xs border border-gray-300 rounded px-2 py-1"
              >
                <option value="project">项目配置</option>
                <option value="yaml">YAML文件</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-auto">
        {projects.length === 0 ? (
          <div className="text-xs text-gray-400 py-2">暂无项目，点击"新建项目"开始</div>
        ) : (
          projects.map((p) => {
            const selected = selectedProjectIds.includes(String(p.id))
            return (
              <button
                key={p.id}
                onClick={() => toggleProject(p.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  selected
                    ? 'bg-primary-100 border-primary-400 text-primary-700'
                    : 'bg-white border-gray-300 text-gray-700 hover:border-primary-300'
                }`}
              >
                {p.name}
              </button>
            )
          })
        )}
      </div>

      {isRendering && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-600">
            <span className="truncate">{currentMessage || '处理中...'}</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-primary-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-red-600 font-semibold">错误信息</div>
          {errors.map((error, index) => (
            <div key={index} className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded border border-red-200">
              {error}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false)
          setNewName('')
          setCreateError(null)
        }}
        title="新建项目"
        footer={
          <>
            <button
              onClick={() => {
                setCreateOpen(false)
                setNewName('')
                setCreateError(null)
              }}
              className="px-4 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              className="px-4 py-1.5 text-sm rounded bg-primary-600 text-white hover:bg-primary-700 inline-flex items-center gap-1"
            >
              <Plus size={14} /> 创建
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">项目名称</label>
          <input
            type="text"
            value={newName}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="例如：test1"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoFocus
          />
          {createError && <p className="text-xs text-red-600">{createError}</p>}
          <p className="text-xs text-gray-500">项目目录将创建在应用根目录，包含 excel/、templates/、para.xlsx</p>
        </div>
      </Modal>
    </div>
  )
}
