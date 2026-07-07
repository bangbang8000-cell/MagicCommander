import React, { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Play, FileText, Plus, Trash2, Settings, Printer, RefreshCw } from 'lucide-react'
import { useProjectStore } from '@/stores/project.store'
import { useRenderStore } from '@/stores/render.store'
import type { RenderConfig } from '@/types/render'
import { LabelPrintPanel } from './LabelPrintPanel'

const INVALID_CHARS = /[\\/:*?"<>|]/
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

function validateProjectName(name: string, t: (key: string, opts?: any) => string): string | null {
  if (!name.trim()) {
    return t('renderPanel.validation.emptyName')
  }
  if (name.trim().length > 50) {
    return t('renderPanel.validation.nameTooLong')
  }
  if (INVALID_CHARS.test(name)) {
    return t('renderPanel.validation.invalidChars')
  }
  if (RESERVED_NAMES.test(name)) {
    return t('renderPanel.validation.reservedName')
  }
  if (name.trim().startsWith('.') || name.trim().startsWith(' ')) {
    return t('renderPanel.validation.leadingDotOrSpace')
  }
  return null
}

export function RenderPanel() {
  const { t } = useTranslation(['common', 'project'])
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
    const error = validateProjectName(trimmed, t)
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
  }, [newName, createProject, t])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewName(e.target.value)
    if (createError) {
      setCreateError(null)
    }
  }, [createError])

  const handleDelete = async () => {
    if (selectedProjectIds.length === 0) return
    const ok = await window.electron.dialog.showConfirm({
      title: t('renderPanel.dialog.deleteTitle'),
      message: t('renderPanel.dialog.deleteConfirm', { count: selectedProjectIds.length }),
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
        title: t('renderPanel.dialog.hintTitle'),
        message: t('renderPanel.dialog.selectAtLeastOneRender'),
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
        title: t('renderPanel.dialog.hintTitle'),
        message: t('renderPanel.dialog.selectAtLeastOneLabelPrint'),
      })
      return
    }
    await labelPrint(selectedProjectIds)
  }

  const handleLabelDelete = async () => {
    if (selectedProjectIds.length === 0) {
      await window.electron.dialog.showMessage({
        type: 'warning',
        title: t('renderPanel.dialog.hintTitle'),
        message: t('renderPanel.dialog.selectAtLeastOneLabelDelete'),
      })
      return
    }
    await labelDelete(selectedProjectIds)
  }

  const handleDeleteOutput = async () => {
    if (selectedProjectIds.length === 0) {
      await window.electron.dialog.showMessage({
        type: 'warning',
        title: t('renderPanel.dialog.hintTitle'),
        message: t('renderPanel.dialog.selectAtLeastOne'),
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
        title: t('renderPanel.dialog.hintTitle'),
        message: t('renderPanel.dialog.selectAtLeastOne'),
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
        title: t('renderPanel.dialog.renderFailed'),
        message: errors.join('\n'),
      })
    }
  }, [isRendering, errors, t])

  return (
    <div className="bg-white border-b border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
          {t('menu.newProject')}
        </Button>
        <Button
          variant="secondary"
          icon={<Trash2 size={14} />}
          onClick={handleDelete}
          disabled={selectedProjectIds.length === 0}
        >
          {t('renderPanel.deleteSelected')}
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-2" />

        <Button
          variant="primary"
          icon={<Play size={14} />}
          onClick={handleRender}
          disabled={isRendering}
          loading={isRendering}
        >
          {config.renderType === 'project' ? t('renderPanel.executeRender') : t('renderPanel.outputYaml')}
          {config.outputFormat === 'device_sn' && ' (SN)'}
        </Button>
        <Button
          variant="secondary"
          icon={<FileText size={14} />}
          onClick={() => setConfig({ renderType: config.renderType === 'project' ? 'yaml' : 'project' })}
          disabled={isRendering}
        >
          {t('renderPanel.switchToMode', { mode: config.renderType === 'project' ? 'YAML' : t('renderPanel.projectMode') })}
        </Button>
        <Button
          variant="secondary"
          icon={<Settings size={14} />}
          onClick={() => setShowConfig(!showConfig)}
        >
          {t('renderPanel.config')}
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-2" />

        <Button
          variant="primary"
          icon={<Printer size={14} />}
          onClick={handleLabelPrint}
          disabled={isRendering}
          loading={isLabelPrinting}
        >
          {t('menu.labelPrint')}
        </Button>
        <Button
          variant="secondary"
          icon={<Trash2 size={14} />}
          onClick={handleLabelDelete}
          disabled={isRendering}
        >
          {t('renderPanel.deleteLabel')}
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-2" />

        <Button
          variant="secondary"
          icon={<RefreshCw size={14} />}
          onClick={handleDeleteOutput}
          disabled={isRendering}
        >
          {t('renderPanel.deleteOutput')}
          {config.outputFormat === 'device_sn' && ' (SN)'}
        </Button>
        <Button
          variant="secondary"
          icon={<RefreshCw size={14} />}
          onClick={handleDeleteYaml}
          disabled={isRendering}
        >
          {t('renderPanel.deleteYaml')}
          {config.outputFormat === 'device_sn' && ' (SN)'}
        </Button>

        <div className="flex-1" />

        <div className="text-xs text-gray-500">
          {t('renderPanel.projectCount', {
            total: projects.length,
            selected: selectedProjectIds.length,
          })}
        </div>
      </div>

      {showConfig && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
          <h4 className="text-xs font-semibold text-gray-700">{t('renderPanel.renderConfig')}</h4>
          <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
            <div className="flex items-center gap-1">
              <label className="font-medium">{t('renderPanel.outputFormat')}:</label>
              <select
                value={config.outputFormat}
                onChange={(e) => setConfig({ outputFormat: e.target.value as 'device_name' | 'device_sn' })}
                className="text-xs border border-gray-300 rounded px-2 py-1"
              >
                <option value="device_name">{t('renderPanel.deviceName')}</option>
                <option value="device_sn">{t('renderPanel.deviceSN')}</option>
              </select>
            </div>
            <div className="flex items-center gap-1">
              <label className="font-medium">{t('renderPanel.renderType')}:</label>
              <select
                value={config.renderType}
                onChange={(e) => setConfig({ renderType: e.target.value as 'project' | 'yaml' })}
                className="text-xs border border-gray-300 rounded px-2 py-1"
              >
                <option value="project">{t('renderPanel.projectConfig')}</option>
                <option value="yaml">{t('renderPanel.yamlFile')}</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-auto">
        {projects.length === 0 ? (
          <div className="text-xs text-gray-400 py-2">{t('renderPanel.noProjectsHint')}</div>
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
            <span className="truncate">{currentMessage || t('renderPanel.processing')}</span>
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
          <div className="text-xs text-red-600 font-semibold">{t('renderPanel.errorMessage')}</div>
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
        title={t('menu.newProject')}
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
              {t('app.cancel')}
            </button>
            <button
              onClick={handleCreate}
              className="px-4 py-1.5 text-sm rounded bg-primary-600 text-white hover:bg-primary-700 inline-flex items-center gap-1"
            >
              <Plus size={14} /> {t('renderPanel.dialog.create')}
            </button>
          </>
        }
      >
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">{t('renderPanel.dialog.projectName')}</label>
          <input
            type="text"
            value={newName}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder={t('renderPanel.dialog.projectNamePlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoFocus
          />
          {createError && <p className="text-xs text-red-600">{createError}</p>}
          <p className="text-xs text-gray-500">{t('renderPanel.dialog.projectDirHint')}</p>
        </div>
      </Modal>
    </div>
  )
}
