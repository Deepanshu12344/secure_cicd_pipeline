import { Link, useLocation } from 'react-router-dom'
import {
  ShieldCheckIcon,
  DocumentCheckIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  Cog6ToothIcon,
  HomeIcon
} from '@heroicons/react/24/outline'

const navItems = [
  { path: '/', icon: HomeIcon, label: 'Dashboard' },
  { path: '/projects', icon: DocumentCheckIcon, label: 'Projects' },
  { path: '/scans', icon: ChartBarIcon, label: 'Scans' },
  { path: '/risks', icon: ExclamationTriangleIcon, label: 'Risks' },
  { path: '/pipelines', icon: Cog6ToothIcon, label: 'Pipelines' }
]

export default function Sidebar() {
  const location = useLocation()

  return (
    <aside className="w-64 bg-slate-800 border-r border-slate-700 p-4">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-cyan-300 rounded-lg flex items-center justify-center">
          <ShieldCheckIcon className="w-6 h-6 text-slate-900" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold gradient-text">SecureCI/CD</h1>
          <p className="text-xs text-slate-400">AI Risk Scoring</p>
        </div>
      </div>

      <nav className="space-y-2">
        {navItems.map(item => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="absolute bottom-6 left-4 right-4 space-y-2">
        <div className="bg-slate-700 rounded-lg p-4">
          <p className="text-xs text-slate-300 mb-2">Quick Stats</p>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Scans Today</span>
              <span className="font-bold text-blue-400">12</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Critical Risks</span>
              <span className="font-bold text-red-400">3</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
