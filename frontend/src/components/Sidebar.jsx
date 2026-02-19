import { Link, useLocation } from 'react-router-dom'
import {
  Home,
  FolderGit2,
  ScanLine,
  TriangleAlert,
  Workflow,
  HelpCircle,
  Bell,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

const Sidebar = ({ isCollapsed, onToggleCollapse }) => {
  const location = useLocation()

  const menuItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: FolderGit2, label: 'Projects', path: '/projects' },
    { icon: ScanLine, label: 'Scans', path: '/scans' },
    { icon: TriangleAlert, label: 'Risks', path: '/risks' },
    { icon: Workflow, label: 'Pipelines', path: '/pipelines' }
  ]

  const isActive = (path) => location.pathname === path

  return (
    <aside
      className={`${isCollapsed ? 'w-[72px]' : 'w-[220px]'} bg-[#f0f0f0] border-r border-gray-300 h-screen flex flex-col fixed left-0 top-0 transition-all duration-200 z-20`}
    >
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2 px-4'} py-3 border-b border-gray-300`}>
        <div className="w-8 h-8 bg-[#fc6d26] rounded flex items-center justify-center">
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L3 8.5l1.5 10.5L12 22l7.5-3L21 8.5L12 2z" />
          </svg>
        </div>
      </div>

      {!isCollapsed ? (
        <div className="px-4 py-2 text-[11px] font-semibold text-[#303030] tracking-wide border-b border-gray-300">
          Your work
        </div>
      ) : null}

      <nav className="flex-1 overflow-y-auto py-2">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-2 text-[14px] hover:bg-[#dbdbdb] transition-colors ${
              isActive(item.path) ? 'bg-[#dbdbdb] text-[#303030] font-medium' : 'text-[#303030]'
            }`}
            title={isCollapsed ? item.label : ''}
          >
            <item.icon className="w-4 h-4" />
            {!isCollapsed ? <span className="flex-1">{item.label}</span> : null}
          </Link>
        ))}
      </nav>

      <div className="border-t border-gray-300">
        <button
          className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 text-[14px] text-[#303030] hover:bg-[#dbdbdb] w-full transition-colors`}
          title={isCollapsed ? "What's new" : ''}
        >
          <Bell className="w-4 h-4" />
          {!isCollapsed ? <span className="flex-1 text-left">What's new</span> : null}
        </button>

        <button
          className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 text-[14px] text-[#303030] hover:bg-[#dbdbdb] w-full transition-colors`}
          title={isCollapsed ? 'Help' : ''}
        >
          <HelpCircle className="w-4 h-4" />
          {!isCollapsed ? <span>Help</span> : null}
        </button>

        <button
          onClick={onToggleCollapse}
          className={`flex items-center ${isCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 text-[14px] text-[#303030] hover:bg-[#dbdbdb] w-full transition-colors border-t border-gray-300`}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!isCollapsed ? <span>Collapse sidebar</span> : null}
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
