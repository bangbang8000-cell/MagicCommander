import type { TemplateInfo, TemplateMeta } from '@/types/project'

export const templateService = {
  listTemplates: (): Promise<TemplateInfo[]> => window.electron.project.listTemplates(),
  getTemplate: (id: string): Promise<TemplateInfo> => window.electron.project.getTemplate(id),
  saveAsTemplate: (projectName: string, templateName: string, meta: Partial<TemplateMeta>): Promise<void> =>
    window.electron.project.saveAsTemplate(projectName, templateName, meta),
  updateTemplateMeta: (id: string, meta: Partial<TemplateMeta>): Promise<void> =>
    window.electron.project.updateTemplateMeta(id, meta),
  deleteTemplate: (id: string): Promise<void> => window.electron.project.deleteTemplate(id),
}
