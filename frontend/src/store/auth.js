import { create } from 'zustand'

const initialToken = localStorage.getItem('token')
const initialUserRaw = localStorage.getItem('user')

let initialUser = null
if (initialUserRaw) {
  try {
    initialUser = JSON.parse(initialUserRaw)
  } catch {
    initialUser = null
  }
}

export const useAuthStore = create((set) => ({
  user: initialUser,
  token: initialToken,
  isAuthenticated: !!initialToken,
  isAuthResolved: false,

  login: (user, token) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    set({ user, token, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ user: null, token: null, isAuthenticated: false, isAuthResolved: true })
  },

  setAuthResolved: (value) => set({ isAuthResolved: value }),

  setUser: (user) => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user))
    } else {
      localStorage.removeItem('user')
    }
    set({ user })
  }
}))

export const useProjectStore = create((set) => ({
  projects: [],
  selectedProject: null,

  setProjects: (projects) => set({ projects }),
  selectProject: (project) => set({ selectedProject: project })
}))
