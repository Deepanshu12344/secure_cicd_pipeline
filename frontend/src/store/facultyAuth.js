import { create } from 'zustand'

const initialToken = localStorage.getItem('faculty_token')
const initialUserRaw = localStorage.getItem('faculty_user')

let initialUser = null
if (initialUserRaw) {
  try {
    initialUser = JSON.parse(initialUserRaw)
  } catch {
    initialUser = null
  }
}

export const useFacultyAuthStore = create((set) => ({
  user: initialUser,
  token: initialToken,
  isAuthenticated: !!initialToken,

  login: (user, token) => {
    localStorage.setItem('faculty_token', token)
    localStorage.setItem('faculty_user', JSON.stringify(user))
    set({ user, token, isAuthenticated: true })
  },

  logout: () => {
    localStorage.removeItem('faculty_token')
    localStorage.removeItem('faculty_user')
    set({ user: null, token: null, isAuthenticated: false })
  }
}))
