import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import Scans from './pages/Scans'
import Risks from './pages/Risks'
import Pipelines from './pages/Pipelines'
import ProjectDetail from './pages/ProjectDetail'
import Login from './pages/Login'
import { useAuthStore } from './store/auth'
import { authApi } from './services/api'
import './App.css'

function App() {
  const token = useAuthStore((state) => state.token)
  const logout = useAuthStore((state) => state.logout)
  const setUser = useAuthStore((state) => state.setUser)
  const setAuthResolved = useAuthStore((state) => state.setAuthResolved)

  useEffect(() => {
    let mounted = true

    const resolveAuth = async () => {
      if (!token) {
        if (mounted) {
          setAuthResolved(true)
        }
        return
      }

      try {
        const response = await authApi.me()
        if (mounted) {
          setUser(response.data.data.user)
          setAuthResolved(true)
        }
      } catch {
        if (mounted) {
          logout()
        }
      }
    }

    resolveAuth()

    return () => {
      mounted = false
    }
  }, [token, logout, setUser, setAuthResolved])

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/scans" element={<Scans />} />
          <Route path="/risks" element={<Risks />} />
          <Route path="/pipelines" element={<Pipelines />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
