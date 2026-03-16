import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'
import Home from './pages/Home'
import Projects from './pages/Projects'
import Scans from './pages/Scans'
import Risks from './pages/Risks'
import RiskDetail from './pages/RiskDetail'
import ProjectDetail from './pages/ProjectDetail'
import Login from './pages/Login'
import FacultyLogin from './pages/FacultyLogin'
import FacultyStudents from './pages/FacultyStudents'
import FacultyStudentDetail from './pages/FacultyStudentDetail'
import StudentReports from './pages/StudentReports'
import { useAuthStore } from './store/auth'
import { authApi } from './services/api'
import FacultyProtectedRoute from './components/FacultyProtectedRoute'
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
        <Route path="/faculty/login" element={<FacultyLogin />} />

        <Route
          path="/faculty/students"
          element={
            <FacultyProtectedRoute requiredRole="faculty">
              <FacultyStudents />
            </FacultyProtectedRoute>
          }
        />
        <Route
          path="/faculty/student/:id"
          element={
            <FacultyProtectedRoute requiredRole="faculty">
              <FacultyStudentDetail />
            </FacultyProtectedRoute>
          }
        />
        <Route
          path="/student/reports"
          element={
            <FacultyProtectedRoute requiredRole="student">
              <StudentReports />
            </FacultyProtectedRoute>
          }
        />

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Home />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/scans" element={<Scans />} />
          <Route path="/risks" element={<Risks />} />
          <Route path="/risks/:id" element={<RiskDetail />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
