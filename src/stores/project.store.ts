import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FileNode, ProjectInfo } from '@/types/project'

interface ProjectState {
  projects: ProjectInfo[]
  selectedProject: ProjectInfo | null
  selectedProjectId: number | null
  projectStructure: FileNode[]
  isLoading: boolean
  error: string | null
  favoriteProjects: number[]
  recentProjects: number[]

  fetchProjects: () => Promise<void>
  createProject: (name: string) => Promise<void>
  deleteProjects: (ids: string[]) => Promise<void>
  selectProject: (project: ProjectInfo | null) => void
  loadStructure: (name: string) => Promise<void>
  toggleFavorite: (id: number) => void
  trackRecent: (id: number) => void
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      selectedProject: null,
      selectedProjectId: null,
      projectStructure: [],
      isLoading: false,
      error: null,
      favoriteProjects: [],
      recentProjects: [],

      fetchProjects: async () => {
        set({ isLoading: true, error: null })
        try {
          if (!window.electron || !window.electron.project) {
            set({ error: '请在 Electron 桌面应用中运行此功能', isLoading: false })
            return
          }
          const rawProjects = await window.electron.project.list()
          const projects: ProjectInfo[] = Array.isArray(rawProjects)
            ? rawProjects.map((p: any) => ({
                id: p.id ?? 0,
                name: String(p.name ?? ''),
                index: p.index ?? 0,
              }))
            : []
          set({ projects, isLoading: false })
        } catch (err) {
          console.error('[fetchProjects] 错误:', (err as Error).message)
          set({ error: (err as Error).message, isLoading: false })
        }
      },

      createProject: async (name: string) => {
        await window.electron.project.create(name)
        await get().fetchProjects()
      },

      deleteProjects: async (ids: string[]) => {
        await window.electron.project.delete(ids)
        const { selectedProject } = get()
        if (selectedProject) {
          const rawProjects = await window.electron.project.list()
          const projectNames = Array.isArray(rawProjects)
            ? rawProjects.map((p: any) => String(p.name ?? ''))
            : []
          if (!projectNames.includes(selectedProject.name)) {
            set({ selectedProject: null, projectStructure: [] })
          }
        }
        await get().fetchProjects()
      },

      selectProject: (project: ProjectInfo | null) => {
        set({ selectedProject: project, selectedProjectId: project?.id ?? null })
        if (project) get().trackRecent(project.id)
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

      toggleFavorite: (id: number) => {
        const list = get().favoriteProjects
        const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
        set({ favoriteProjects: next })
      },

      trackRecent: (id: number) => {
        const list = get().recentProjects.filter((x) => x !== id)
        const next = [id, ...list].slice(0, 5)
        set({ recentProjects: next })
      },
    }),
    {
      name: 'mc-project-state',
      partialize: (state) => ({
        selectedProjectId: state.selectedProjectId,
        favoriteProjects: state.favoriteProjects,
        recentProjects: state.recentProjects,
      }),
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            state.selectedProject = null
          }
        }
      },
    },
  ),
)
