import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { templateService } from '@/services/templateService'
import type { FileNode, ProjectInfo, ProjectStatus, TemplateInfo, TemplateMeta } from '@/types/project'

interface ProjectState {
  projects: ProjectInfo[]
  selectedProject: ProjectInfo | null
  selectedProjectId: number | null
  selectedProjectName: string | null
  projectStructure: FileNode[]
  templates: TemplateInfo[]
  projectStatuses: Record<string, ProjectStatus>
  isLoading: boolean
  error: string | null
  favoriteProjects: string[]
  recentProjects: string[]
  pendingCreateDialog: boolean

  fetchProjects: () => Promise<void>
  listExamples: () => Promise<string[]>
  fetchTemplates: () => Promise<void>
  createProject: (name: string, options?: { template?: string; empty?: boolean }) => Promise<void>
  saveAsExample: (projectName: string, exampleName: string) => Promise<void>
  saveAsTemplate: (projectName: string, templateName: string, meta: Partial<TemplateMeta>) => Promise<void>
  updateTemplateMeta: (id: string, meta: Partial<TemplateMeta>) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  deleteProjects: (ids: string[]) => Promise<void>
  selectProject: (project: ProjectInfo | null) => void
  loadStructure: (name: string) => Promise<void>
  toggleFavorite: (name: string) => void
  trackRecent: (name: string) => void
  triggerCreateProject: () => void
  clearCreateTrigger: () => void
}

const normalizeProjects = (rawProjects: any[]): ProjectInfo[] =>
  Array.isArray(rawProjects)
    ? rawProjects.map((p: any) => ({
        id: p.id ?? 0,
        name: String(p.name ?? ''),
        index: p.index ?? 0,
      }))
    : []

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      selectedProject: null,
      selectedProjectId: null,
      selectedProjectName: null,
      projectStructure: [],
      templates: [],
      projectStatuses: {},
      isLoading: false,
      error: null,
      favoriteProjects: [],
      recentProjects: [],
      pendingCreateDialog: false,

      fetchProjects: async () => {
        set({ isLoading: true, error: null })
        try {
          if (!window.electron || !window.electron.project) {
            set({ error: '请在 Electron 桌面应用中运行此功能', isLoading: false })
            return
          }
          const projects = normalizeProjects(await window.electron.project.list())
          const workspaceIndex = await window.electron.project.getWorkspaceIndex().catch(() => null)
          const projectStatuses = Object.fromEntries(
            (workspaceIndex?.projects ?? []).map((project) => [project.name, project.status]),
          )
          const validNames = new Set(projects.map((p) => p.name))
          const selectedProjectName = get().selectedProjectName
          const selectedProject = selectedProjectName
            ? (projects.find((p) => p.name === selectedProjectName) ?? null)
            : null
          set((state) => ({
            projects,
            projectStatuses,
            selectedProject,
            selectedProjectId: selectedProject?.id ?? null,
            selectedProjectName: selectedProject?.name ?? null,
            projectStructure: selectedProject ? state.projectStructure : [],
            favoriteProjects: state.favoriteProjects.filter((name) => validNames.has(name)),
            recentProjects: state.recentProjects.filter((name) => validNames.has(name)),
            isLoading: false,
            error: null,
          }))
        } catch (err) {
          console.error('[fetchProjects] 错误:', (err as Error).message)
          set({ error: (err as Error).message, isLoading: false })
        }
      },

      listExamples: async () => {
        return await window.electron.project.listExamples()
      },

      fetchTemplates: async () => {
        const templates = await templateService.listTemplates()
        set({ templates })
      },

      createProject: async (name: string, options?: { template?: string; empty?: boolean }) => {
        await window.electron.project.create(name, options)
        await get().fetchProjects()
      },

      saveAsExample: async (projectName: string, exampleName: string) => {
        await window.electron.project.saveAsExample(projectName, exampleName)
        await get().fetchTemplates()
      },

      saveAsTemplate: async (projectName: string, templateName: string, meta: Partial<TemplateMeta>) => {
        await templateService.saveAsTemplate(projectName, templateName, meta)
        await get().fetchTemplates()
      },

      updateTemplateMeta: async (id: string, meta: Partial<TemplateMeta>) => {
        await templateService.updateTemplateMeta(id, meta)
        await get().fetchTemplates()
      },

      deleteTemplate: async (id: string) => {
        await templateService.deleteTemplate(id)
        await get().fetchTemplates()
      },

      deleteProjects: async (ids: string[]) => {
        const deletingNames = new Set(
          ids
            .map((id) => get().projects.find((project) => String(project.id) === String(id))?.name)
            .filter((name): name is string => Boolean(name)),
        )
        await window.electron.project.delete(ids)
        const projects = normalizeProjects(await window.electron.project.list())
        const workspaceIndex = await window.electron.project.getWorkspaceIndex().catch(() => null)
        const projectStatuses = Object.fromEntries(
          (workspaceIndex?.projects ?? []).map((project) => [project.name, project.status]),
        )
        const validNames = new Set(projects.map((p) => p.name))
        const selectedProjectName = get().selectedProjectName
        const selectedProject =
          selectedProjectName && !deletingNames.has(selectedProjectName)
            ? (projects.find((p) => p.name === selectedProjectName) ?? null)
            : null
        set((state) => ({
          projects,
          projectStatuses,
          isLoading: false,
          error: null,
          favoriteProjects: state.favoriteProjects.filter((name) => validNames.has(name)),
          recentProjects: state.recentProjects.filter((name) => validNames.has(name)),
          selectedProject,
          selectedProjectId: selectedProject?.id ?? null,
          selectedProjectName: selectedProject?.name ?? null,
          projectStructure: selectedProject ? state.projectStructure : [],
        }))
      },

      selectProject: (project: ProjectInfo | null) => {
        set({
          selectedProject: project,
          selectedProjectId: project?.id ?? null,
          selectedProjectName: project?.name ?? null,
        })
        if (project) get().trackRecent(project.name)
      },

      loadStructure: async (name: string) => {
        set({ isLoading: true, error: null })
        try {
          const structure = await window.electron.project.getStructure(name)
          set({ projectStructure: structure as FileNode[], isLoading: false })
        } catch (err) {
          set({ error: (err as Error).message, isLoading: false })
        }
      },

      toggleFavorite: (name: string) => {
        const list = get().favoriteProjects
        const next = list.includes(name) ? list.filter((x) => x !== name) : [...list, name]
        set({ favoriteProjects: next })
      },

      trackRecent: (name: string) => {
        const list = get().recentProjects.filter((x) => x !== name)
        const next = [name, ...list].slice(0, 5)
        set({ recentProjects: next })
      },
      triggerCreateProject: () => set({ pendingCreateDialog: true }),
      clearCreateTrigger: () => set({ pendingCreateDialog: false }),
    }),
    {
      name: 'mc-project-state',
      partialize: (state) => ({
        selectedProjectName: state.selectedProjectName,
        favoriteProjects: state.favoriteProjects,
        recentProjects: state.recentProjects,
      }),
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            state.selectedProject = null
            state.selectedProjectId = null
          }
        }
      },
    },
  ),
)
