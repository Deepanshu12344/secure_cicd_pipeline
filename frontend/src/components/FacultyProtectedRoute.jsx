import { Navigate, useLocation } from 'react-router-dom'
import { useFacultyAuthStore } from '../store/facultyAuth'

export default function FacultyProtectedRoute({ children, requiredRole }) {
  const isAuthenticated = useFacultyAuthStore((state) => state.isAuthenticated)
  const user = useFacultyAuthStore((state) => state.user)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/faculty/login" replace state={{ from: location }} />
  }

  if (requiredRole && user?.role !== requiredRole) {
    const fallback = user?.role === 'student' ? '/student/reports' : '/faculty/students'
    return <Navigate to={fallback} replace />
  }

  return children
}
