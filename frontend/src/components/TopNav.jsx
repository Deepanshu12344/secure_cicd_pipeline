import { useNavigate } from 'react-router-dom'
import { Search, Plus, CheckSquare, GitMerge, Clock, LogOut } from 'lucide-react'
import { authApi } from '../services/api'
import { useAuthStore } from '../store/auth'

const TopNav = () => {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  const handleLogout = async () => {
    try {
      if (user?.email) {
        sessionStorage.setItem('lastGoogleEmail', user.email)
      }

      if (window.google?.accounts?.id) {
        window.google.accounts.id.disableAutoSelect()
        if (user?.email) {
          window.google.accounts.id.revoke(user.email, () => {})
        }
      }

      await authApi.logout()
    } catch {
      // Ignore API/SDK errors and clear local session regardless.
    } finally {
      logout()
      navigate('/login', { replace: true })
    }
  }

  return (
    <div className="h-[48px] bg-white border-b border-gray-300 fixed top-0 left-[220px] right-0 z-10 flex items-center px-4 gap-4">
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search or go to..."
            className="w-full pl-10 pr-12 py-1.5 bg-[#f0f0f0] border border-gray-300 rounded text-sm text-[#303030] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1f75cb] focus:border-transparent"
          />
          <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 border border-gray-300 px-1.5 py-0.5 rounded">
            /
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="p-1.5 hover:bg-gray-100 rounded transition-colors" title="Create new">
          <Plus className="w-5 h-5 text-[#303030]" />
        </button>
        <button className="p-1.5 hover:bg-gray-100 rounded transition-colors relative" title="To-Do List">
          <CheckSquare className="w-5 h-5 text-[#303030]" />
          <span className="absolute top-0 right-0 bg-transparent text-[#303030] text-xs font-semibold">0</span>
        </button>
        <button className="p-1.5 hover:bg-gray-100 rounded transition-colors relative" title="Merge requests">
          <GitMerge className="w-5 h-5 text-[#303030]" />
          <span className="absolute top-0 right-0 bg-transparent text-[#303030] text-xs font-semibold">0</span>
        </button>
        <button className="p-1.5 hover:bg-gray-100 rounded transition-colors relative" title="Issues">
          <Clock className="w-5 h-5 text-[#303030]" />
          <span className="absolute top-0 right-0 bg-transparent text-[#303030] text-xs font-semibold">0</span>
        </button>

        <button className="h-8 px-2 rounded bg-gray-100 text-xs text-[#303030] ml-2" title={user?.email || ''}>
          {user?.name || 'User'}
        </button>

        <button
          onClick={handleLogout}
          className="ml-1 p-1.5 hover:bg-gray-100 rounded transition-colors"
          title="Logout"
        >
          <LogOut className="w-5 h-5 text-[#303030]" />
        </button>
      </div>
    </div>
  )
}

export default TopNav
