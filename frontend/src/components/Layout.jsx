import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopNav from './TopNav'

export default function Layout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-white">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />
      <TopNav isSidebarCollapsed={isSidebarCollapsed} />
      <main
        className={`${isSidebarCollapsed ? 'ml-[72px]' : 'ml-[220px]'} mt-[48px] min-h-[calc(100vh-48px)] transition-all duration-200`}
      >
        <Outlet />
      </main>
    </div>
  )
}
