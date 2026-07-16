/**
 * 项目服务层
 * 封装项目相关的 IPC 调用和业务逻辑
 */

import type { ProjectInfo } from '@/types/project'
import type { LabelPrintConfig } from '@/types'

const electron = window.electron

export interface ProjectService {
  listProjects(): Promise<ProjectInfo[]>
  createProject(name: string): Promise<void>
  deleteProject(ids: string[]): Promise<void>
  getProjectStructure(name: string): Promise<any[]>
  getProjectParameters(id: string): Promise<any[]>
  readFile(projectId: number, filePath: string): Promise<string>
  writeFile(projectId: number, filePath: string, content: string): Promise<void>
  listFiles(projectId: string, fileType?: string): Promise<any[]>
  readExcel(projectId: number, filePath: string): Promise<any[]>
  writeExcel(projectId: number, filePath: string, sheets: any[]): Promise<void>
  readDocx(projectId: number, filePath: string): Promise<string>
  readDocxBuffer(projectId: number, filePath: string): Promise<ArrayBuffer>
  renderProject(ids: string[]): Promise<void>
  renderYaml(ids: string[]): Promise<void>
  renderProjectSn(ids: string[]): Promise<void>
  renderYamlSn(ids: string[]): Promise<void>
  labelPrint(ids: string[], config?: LabelPrintConfig): Promise<void>
  labelMarkdown(ids: string[], config?: LabelPrintConfig): Promise<void>
  labelPdf(ids: string[], config?: LabelPrintConfig): Promise<string[]>
  labelDelete(ids: string[]): Promise<void>
  deleteOutput(ids: string[]): Promise<void>
  deleteOutputSn(ids: string[]): Promise<void>
  deleteYaml(ids: string[]): Promise<void>
  deleteYamlSn(ids: string[]): Promise<void>
}

class ProjectServiceImpl implements ProjectService {
  async listProjects(): Promise<ProjectInfo[]> {
    try {
      const result = await electron.project.list()
      return (result as ProjectInfo[]) || []
    } catch (error) {
      console.error('[ProjectService] listProjects error:', error)
      throw error
    }
  }

  async createProject(name: string): Promise<void> {
    try {
      await electron.project.create(name)
    } catch (error) {
      console.error('[ProjectService] createProject error:', error)
      throw error
    }
  }

  async deleteProject(ids: string[]): Promise<void> {
    try {
      await electron.project.delete(ids)
    } catch (error) {
      console.error('[ProjectService] deleteProject error:', error)
      throw error
    }
  }

  async getProjectStructure(name: string): Promise<any[]> {
    try {
      return (await electron.project.getStructure(name)) || []
    } catch (error) {
      console.error('[ProjectService] getProjectStructure error:', error)
      throw error
    }
  }

  async getProjectParameters(id: string): Promise<any[]> {
    try {
      const result = await electron.project.parameters(id)
      return (result as any[]) || []
    } catch (error) {
      console.error('[ProjectService] getProjectParameters error:', error)
      throw error
    }
  }

  async readFile(projectId: number, filePath: string): Promise<string> {
    try {
      return (await electron.project.readFile(projectId, filePath)) || ''
    } catch (error) {
      console.error('[ProjectService] readFile error:', error)
      throw error
    }
  }

  async writeFile(projectId: number, filePath: string, content: string): Promise<void> {
    try {
      await electron.project.writeFile(projectId, filePath, content)
    } catch (error) {
      console.error('[ProjectService] writeFile error:', error)
      throw error
    }
  }

  async listFiles(projectId: string, fileType?: string): Promise<any[]> {
    try {
      const result = await electron.project.listFiles(projectId, fileType)
      return (result as any[]) || []
    } catch (error) {
      console.error('[ProjectService] listFiles error:', error)
      throw error
    }
  }

  async readExcel(projectId: number, filePath: string): Promise<any[]> {
    try {
      return (await electron.project.readExcel(projectId, filePath)) || []
    } catch (error) {
      console.error('[ProjectService] readExcel error:', error)
      throw error
    }
  }

  async writeExcel(projectId: number, filePath: string, sheets: any[]): Promise<void> {
    try {
      await electron.project.writeExcel(projectId, filePath, sheets)
    } catch (error) {
      console.error('[ProjectService] writeExcel error:', error)
      throw error
    }
  }

  async readDocx(projectId: number, filePath: string): Promise<string> {
    try {
      return (await electron.project.readDocx(projectId, filePath)) || ''
    } catch (error) {
      console.error('[ProjectService] readDocx error:', error)
      throw error
    }
  }

  async readDocxBuffer(projectId: number, filePath: string): Promise<ArrayBuffer> {
    try {
      return await electron.project.readDocxBuffer(projectId, filePath)
    } catch (error) {
      console.error('[ProjectService] readDocxBuffer error:', error)
      throw error
    }
  }

  async renderProject(ids: string[]): Promise<void> {
    try {
      await electron.render.project(ids)
    } catch (error) {
      console.error('[ProjectService] renderProject error:', error)
      throw error
    }
  }

  async renderYaml(ids: string[]): Promise<void> {
    try {
      await electron.render.yaml(ids)
    } catch (error) {
      console.error('[ProjectService] renderYaml error:', error)
      throw error
    }
  }

  async renderProjectSn(ids: string[]): Promise<void> {
    try {
      await electron.render.projectSn(ids)
    } catch (error) {
      console.error('[ProjectService] renderProjectSn error:', error)
      throw error
    }
  }

  async renderYamlSn(ids: string[]): Promise<void> {
    try {
      await electron.render.yamlSn(ids)
    } catch (error) {
      console.error('[ProjectService] renderYamlSn error:', error)
      throw error
    }
  }

  async labelPrint(ids: string[], config?: LabelPrintConfig): Promise<void> {
    try {
      await electron.feature.labelPrint(ids, config)
    } catch (error) {
      console.error('[ProjectService] labelPrint error:', error)
      throw error
    }
  }

  async labelMarkdown(ids: string[], config?: LabelPrintConfig): Promise<void> {
    try {
      await electron.feature.labelMarkdown(ids, config)
    } catch (error) {
      console.error('[ProjectService] labelMarkdown error:', error)
      throw error
    }
  }

  async labelPdf(ids: string[], config?: LabelPrintConfig): Promise<string[]> {
    try {
      return await electron.feature.labelPdf(ids, config)
    } catch (error) {
      console.error('[ProjectService] labelPdf error:', error)
      throw error
    }
  }

  async labelDelete(ids: string[]): Promise<void> {
    try {
      await electron.feature.labelDelete(ids)
    } catch (error) {
      console.error('[ProjectService] labelDelete error:', error)
      throw error
    }
  }

  async deleteOutput(ids: string[]): Promise<void> {
    try {
      await electron.delete.output(ids)
    } catch (error) {
      console.error('[ProjectService] deleteOutput error:', error)
      throw error
    }
  }

  async deleteOutputSn(ids: string[]): Promise<void> {
    try {
      await electron.delete.outputSn(ids)
    } catch (error) {
      console.error('[ProjectService] deleteOutputSn error:', error)
      throw error
    }
  }

  async deleteYaml(ids: string[]): Promise<void> {
    try {
      await electron.delete.yaml(ids)
    } catch (error) {
      console.error('[ProjectService] deleteYaml error:', error)
      throw error
    }
  }

  async deleteYamlSn(ids: string[]): Promise<void> {
    try {
      await electron.delete.yamlSn(ids)
    } catch (error) {
      console.error('[ProjectService] deleteYamlSn error:', error)
      throw error
    }
  }
}

export const projectService = new ProjectServiceImpl()
