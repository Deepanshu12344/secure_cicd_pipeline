import { useNavigate } from 'react-router-dom'
import { BellIcon, UserCircleIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
import { useAuthStore } from '../store/auth'
import { authApi } from '../services/api'

export default function Navbar() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  const handleLogout = async () => {
    try {
      await authApi.logout()
    } catch {
      // Ignore logout API errors and clear local session regardless.
    } finally {
      logout()
      navigate('/login', { replace: true })
    }
  }

  return (
    <nav className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
      <div className="flex-1">
        <h2 className="text-xl font-bold text-white">Secure CI/CD Pipeline</h2>
      </div>
      
      <div className="flex items-center gap-6">
        <button className="relative p-2 text-slate-400 hover:text-white transition-colors">
          <BellIcon className="w-6 h-6" />
          <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        
        <button className="p-2 text-slate-400 hover:text-white transition-colors">
          <Cog6ToothIcon className="w-6 h-6" />
        </button>
        
        <button className="flex items-center gap-2 p-2 hover:bg-slate-700 rounded-lg transition-colors">
          <UserCircleIcon className="w-6 h-6 text-slate-400" />
          <span className="text-sm text-slate-300">{user?.name || 'User'}</span>
        </button>
        <button onClick={handleLogout} className="btn-secondary text-sm py-1.5 px-3">
          Logout
        </button>
      </div>
    </nav>
  )
}
