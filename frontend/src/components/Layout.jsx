import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopNav from './TopNav'

export default function Layout() {
  return (
    <div className="min-h-screen bg-white">
      <Sidebar />
      <TopNav />
      <main className="ml-[220px] mt-[48px] min-h-[calc(100vh-48px)]">
        <Outlet />
      </main>
    </div>
  )
}
