import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, LogOut } from 'lucide-react'
import { authApi, projectsApi, scansApi } from '../services/api'
import { useAuthStore } from '../store/auth'

const TopNav = ({ isSidebarCollapsed }) => {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [query, setQuery] = useState('')
  const [allProjects, setAllProjects] = useState([])
  const [allScans, setAllScans] = useState([])
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    let mounted = true

    const bootstrap = async () => {
      try {
        const [projectsRes, scansRes] = await Promise.all([projectsApi.getAll(), scansApi.getAll()])
        if (!mounted) return
        setAllProjects(projectsRes.data?.data || [])
        setAllScans(scansRes.data?.data || [])
      } catch {
        if (!mounted) return
        setAllProjects([])
        setAllScans([])
      }
    }

    bootstrap()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      const targetTag = String(event.target?.tagName || '').toLowerCase()
      const isTypingTarget = targetTag === 'input' || targetTag === 'textarea' || event.target?.isContentEditable
      if (isTypingTarget || event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === '/') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const onDocumentClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const projectResults = allProjects
      .filter((project) =>
        [project.name, project.fullName, project.repositoryUrl].join(' ').toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map((project) => ({
        id: `project-${project.id}`,
        type: 'Project',
        title: project.fullName || project.name,
        subtitle: project.repositoryUrl,
        path: `/projects/${project.id}`
      }))

    const scanResults = allScans
      .filter((scan) =>
        [scan.projectFullName, scan.projectName, scan.projectId, scan.id, scan.status, scan.scanType]
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 5)
      .map((scan) => ({
        id: `scan-${scan.id}`,
        type: 'Scan',
        title: scan.projectFullName || scan.projectName || scan.projectId || scan.id,
        subtitle: `Scan ${scan.status || 'unknown'} • ${scan.scanType || 'full'}`,
        path: '/scans'
      }))

    return [...projectResults, ...scanResults].slice(0, 8)
  }, [query, allProjects, allScans])

  const runSearch = () => {
    const trimmed = query.trim()
    if (!trimmed) return

    if (results.length > 0) {
      navigate(results[0].path)
      setFocused(false)
      return
    }

    navigate(`/projects?q=${encodeURIComponent(trimmed)}`)
    setFocused(false)
  }

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
    <div
      className={`h-[48px] bg-white border-b border-gray-300 fixed top-0 ${isSidebarCollapsed ? 'left-[72px]' : 'left-[220px]'} right-0 z-10 flex items-center px-4 gap-4 transition-all duration-200`}
    >
      <div ref={containerRef} className="flex-1 max-w-xl relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                runSearch()
              }
            }}
            placeholder="Search or go to..."
            className="w-full pl-10 pr-12 py-1.5 bg-[#f0f0f0] border border-gray-300 rounded text-sm text-[#303030] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1f75cb] focus:border-transparent"
          />
          <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 border border-gray-300 px-1.5 py-0.5 rounded">
            /
          </span>
        </div>

        {focused && query.trim() ? (
          <div className="absolute mt-1 w-full bg-white border border-gray-200 rounded shadow-sm overflow-hidden z-20">
            {results.length === 0 ? (
              <button
                type="button"
                onClick={runSearch}
                className="w-full text-left px-3 py-2 hover:bg-gray-50"
              >
                <div className="text-sm text-[#303030]">Search for “{query.trim()}” in projects</div>
              </button>
            ) : (
              results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => {
                    navigate(result.path)
                    setFocused(false)
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                >
                  <div className="text-xs text-[#666]">{result.type}</div>
                  <div className="text-sm text-[#303030] truncate">{result.title}</div>
                  <div className="text-xs text-[#666] truncate">{result.subtitle}</div>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button
          className="p-1.5 hover:bg-gray-100 rounded transition-colors"
          title="Create new project"
          onClick={() => navigate('/projects?create=1')}
        >
          <Plus className="w-5 h-5 text-[#303030]" />
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
