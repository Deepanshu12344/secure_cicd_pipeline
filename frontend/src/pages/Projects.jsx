import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Search,
  Clock,
  Star,
  GitMerge,
  MoreHorizontal,
  Lock,
  Globe,
  Download,
  Github,
  Plus,
  Trash2
} from 'lucide-react'
import { githubApi, projectsApi } from '../services/api'
import { useAuthStore } from '../store/auth'

const formatRelative = (value) => {
  if (!value) return 'just now'
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

const Projects = () => {
  const location = useLocation()
  const token = useAuthStore((state) => state.token)

  const [activeTab, setActiveTab] = useState('contributed')
  const [projects, setProjects] = useState([])
  const [githubConnected, setGithubConnected] = useState(false)
  const [githubRepos, setGithubRepos] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [showImportPanel, setShowImportPanel] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    repositoryUrl: ''
  })

  const importedRepoIds = useMemo(
    () => new Set(projects.map((project) => String(project.githubRepoId || ''))),
    [projects]
  )

  const loadProjects = async () => {
    const response = await projectsApi.getAll()
    setProjects(response.data?.data || [])
  }

  const loadGithubStatus = async () => {
    try {
      const response = await githubApi.getStatus()
      setGithubConnected(Boolean(response.data?.data?.connected))
    } catch {
      setGithubConnected(false)
    }
  }

  useEffect(() => {
    let mounted = true

    const bootstrap = async () => {
      setLoading(true)
      setError('')

      try {
        await Promise.all([loadProjects(), loadGithubStatus()])
      } catch (err) {
        if (mounted) {
          setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load projects')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    bootstrap()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const githubState = params.get('github')
    const createParam = params.get('create')
    const searchParam = params.get('q')

    if (createParam === '1') {
      setShowCreateModal(true)
    }

    if (searchParam !== null) {
      setSearchText(searchParam)
    }

    if (githubState === 'connected') {
      setInfo('GitHub connected successfully. You can import repositories now.')
      setGithubConnected(true)
    }

    if (githubState === 'link_failed') {
      setError('GitHub linking failed. Please try connecting again.')
    }

    if (githubState === 'config_missing') {
      setError('GitHub OAuth is not configured on backend. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.')
    }

    if (githubState === 'email_mismatch') {
      setError('GitHub account email does not match your app login email. Please sign in to the matching GitHub account and try again.')
    }

    if (githubState === 'email_unverified') {
      setError('No verified email found on your GitHub account. Verify your GitHub email and try again.')
    }
  }, [location.search])

  const handleConnectGithub = () => {
    if (!token) {
      setError('You must be logged in to connect GitHub')
      return
    }

    window.location.href = githubApi.getConnectUrl(token)
  }

  const handleLoadRepos = async () => {
    setLoadingRepos(true)
    setError('')
    setInfo('')

    try {
      const response = await githubApi.getRepos()
      setGithubRepos(response.data?.data || [])
      setShowImportPanel(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch GitHub repositories')
    } finally {
      setLoadingRepos(false)
    }
  }

  const handleImportRepo = async (repo) => {
    setError('')
    setInfo('')

    try {
      const response = await projectsApi.importGithub(repo)
      setInfo(response.data?.message || `Imported ${repo.name}`)
      await loadProjects()
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to import repository')
    }
  }

  const handleCreateProject = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')

    try {
      await projectsApi.create({
        ...newProject,
        repositoryType: 'github'
      })

      setShowCreateModal(false)
      setNewProject({ name: '', description: '', repositoryUrl: '' })
      setInfo('Project created successfully')
      await loadProjects()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create project')
    }
  }

  const handleDeleteProject = async (project) => {
    const shouldDelete = window.confirm(`Delete "${project.name}"?`)
    if (!shouldDelete) return

    setError('')
    setInfo('')

    try {
      await projectsApi.delete(project.id)
      setInfo('Project deleted successfully')
      await loadProjects()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete project')
    }
  }

  const filteredProjects = useMemo(() => {
    const q = searchText.trim().toLowerCase()

    return projects.filter((project) => {
      const byTab =
        activeTab === 'inactive'
          ? project.status === 'inactive'
          : activeTab === 'starred'
            ? Number(project.stars || 0) > 0
            : true

      const bySearch =
        q.length < 1 ||
        String(project.name || '').toLowerCase().includes(q) ||
        String(project.fullName || '').toLowerCase().includes(q)

      return byTab && bySearch
    })
  }, [activeTab, projects, searchText])

  const tabs = useMemo(() => {
    const inactiveCount = projects.filter((project) => project.status === 'inactive').length
    const starredCount = projects.filter((project) => Number(project.stars || 0) > 0).length

    return [
      { id: 'contributed', label: 'Contributed', count: projects.length },
      { id: 'starred', label: 'Starred', count: starredCount },
      { id: 'personal', label: 'Personal', count: projects.length },
      { id: 'member', label: 'Member', count: projects.length },
      { id: 'inactive', label: 'Inactive', count: inactiveCount }
    ]
  }, [projects])

  if (loading) {
    return <div className="bg-white min-h-[calc(100vh-48px)] p-6 text-[#666]">Loading projects...</div>
  }

  return (
    <div className="bg-white min-h-[calc(100vh-48px)]">
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-[#6e49cb]">
          <Link to="/" className="hover:underline">Your work</Link>
          <span className="text-gray-400">/</span>
          <span className="text-[#303030]">Projects</span>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-normal text-[#303030]">Projects</h1>
          <div className="flex items-center gap-3">
            {githubConnected ? (
              <button
                onClick={handleLoadRepos}
                disabled={loadingRepos}
                className="px-4 py-2 text-sm text-[#1f75cb] hover:text-[#1068bf] transition-colors inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {loadingRepos ? 'Fetching...' : 'Import from GitHub'}
              </button>
            ) : (
              <button
                onClick={handleConnectGithub}
                className="px-4 py-2 text-sm text-[#1f75cb] hover:text-[#1068bf] transition-colors inline-flex items-center gap-2"
              >
                <Github className="w-4 h-4" />
                Connect GitHub
              </button>
            )}

            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-[#1f75cb] text-white text-sm font-medium rounded hover:bg-[#1068bf] transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New project
            </button>
          </div>
        </div>

        {error ? <div className="mb-4 px-4 py-3 text-sm bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] rounded">{error}</div> : null}
        {info ? <div className="mb-4 px-4 py-3 text-sm bg-[#ecfdf3] border border-[#bbf7d0] text-[#166534] rounded">{info}</div> : null}

        {showImportPanel ? (
          <div className="border border-gray-200 rounded p-4 mb-6">
            <h2 className="text-sm font-semibold text-[#303030] mb-3">Your GitHub Repositories</h2>
            {githubRepos.length === 0 ? <p className="text-sm text-[#666]">No repositories found.</p> : null}

            <div className="space-y-2 max-h-72 overflow-auto">
              {githubRepos.map((repo) => {
                const alreadyImported = importedRepoIds.has(String(repo.id))

                return (
                  <div key={repo.id} className="flex items-center justify-between gap-3 border border-gray-200 rounded p-3">
                    <div className="min-w-0">
                      <p className="text-sm text-[#303030] truncate">{repo.fullName || repo.name}</p>
                      <p className="text-xs text-[#666] truncate">{repo.description || 'No description'}</p>
                    </div>
                    <button
                      disabled={alreadyImported}
                      onClick={() => handleImportRepo(repo)}
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                        alreadyImported
                          ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          : 'bg-[#1f75cb] text-white hover:bg-[#1068bf]'
                      }`}
                    >
                      {alreadyImported ? 'Imported' : 'Import'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="border-b border-gray-200 mb-6">
          <div className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-[#303030] border-b-2 border-[#303030]'
                    : 'text-[#666] hover:text-[#303030]'
                }`}
              >
                {tab.label}
                <span
                  className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                    activeTab === tab.id ? 'bg-gray-200 text-[#303030]' : 'bg-gray-100 text-[#666]'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#303030] border border-gray-300 rounded hover:border-gray-400 hover:bg-gray-50 transition-colors">
              <Clock className="w-4 h-4" />
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          <div className="flex-1 relative">
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              type="text"
              placeholder="Filter or search (3 character minimum)"
              className="w-full pl-3 pr-10 py-1.5 bg-white border border-gray-300 rounded text-sm text-[#303030] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#1f75cb] focus:border-transparent"
            />
            <button className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded">
              <Search className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="border border-gray-200 rounded">
          {filteredProjects.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#666]">No projects found.</div>
          ) : (
            filteredProjects.map((project) => (
              <div
                key={project.id}
                className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors border-b last:border-b-0 border-gray-200"
              >
                <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
                  {project.isPrivate ? <Lock className="w-5 h-5 text-gray-500" /> : <Globe className="w-5 h-5 text-gray-500" />}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="w-6 h-6 bg-[#1f75cb] text-white rounded flex items-center justify-center text-xs font-semibold">
                    {(project.name || 'P').slice(0, 1).toUpperCase()}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link to={`/projects/${project.id}`} className="text-sm font-medium text-[#1f75cb] hover:underline truncate">
                      {project.fullName || project.name}
                    </Link>
                    <span className="px-2 py-0.5 bg-[#dbf0ff] text-[#1f75cb] text-xs font-medium rounded">Owner</span>
                  </div>
                  <div className="text-xs text-[#666] truncate mt-1">{project.description || 'No description'}</div>
                </div>

                <div className="flex items-center gap-6 text-sm text-[#666] flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4" />
                    <span>{project.stars ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <GitMerge className="w-4 h-4" />
                    <span>{project.forks ?? 0}</span>
                  </div>
                </div>

                <div className="text-xs text-[#666] flex-shrink-0">Created {formatRelative(project.createdAt)}</div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleDeleteProject(project)}
                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-[#303030]" />
                  </button>
                  <button className="p-1 hover:bg-gray-200 rounded transition-colors" title="More">
                    <MoreHorizontal className="w-5 h-5 text-[#303030]" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showCreateModal ? (
        <div className="fixed inset-0 bg-black/35 flex items-center justify-center px-4 z-20">
          <form onSubmit={handleCreateProject} className="w-full max-w-lg bg-white border border-gray-200 rounded p-5">
            <h3 className="text-lg font-medium text-[#303030] mb-4">Create Project</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-[#303030] mb-1">Project Name</label>
                <input
                  required
                  value={newProject.name}
                  onChange={(e) => setNewProject((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-[#303030] focus:outline-none focus:ring-2 focus:ring-[#1f75cb]"
                  placeholder="my-project"
                />
              </div>

              <div>
                <label className="block text-sm text-[#303030] mb-1">Repository URL</label>
                <input
                  required
                  value={newProject.repositoryUrl}
                  onChange={(e) => setNewProject((prev) => ({ ...prev, repositoryUrl: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-[#303030] focus:outline-none focus:ring-2 focus:ring-[#1f75cb]"
                  placeholder="https://github.com/org/repo"
                />
              </div>

              <div>
                <label className="block text-sm text-[#303030] mb-1">Description</label>
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full min-h-24 px-3 py-2 border border-gray-300 rounded text-sm text-[#303030] focus:outline-none focus:ring-2 focus:ring-[#1f75cb]"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-2 border border-gray-300 text-sm text-[#303030] rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button type="submit" className="px-3 py-2 bg-[#1f75cb] text-white text-sm font-medium rounded hover:bg-[#1068bf]">
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}

export default Projects
