import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  ArrowDownTrayIcon,
  GlobeAltIcon,
  LockClosedIcon,
  PencilSquareIcon,
  PlusIcon,
  StarIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import { githubApi, projectsApi } from '../services/api'
import { useAuthStore } from '../store/auth'

export default function Projects() {
  const location = useLocation()
  const token = useAuthStore((state) => state.token)
  const [projects, setProjects] = useState([])
  const [githubConnected, setGithubConnected] = useState(false)
  const [githubRepos, setGithubRepos] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [showImportPanel, setShowImportPanel] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

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
    if (githubState === 'connected') {
      setInfo('GitHub connected successfully. You can import repositories now.')
      setGithubConnected(true)
    }
    if (githubState === 'link_failed') {
      setError('GitHub linking failed. Please try connecting again.')
    }
    if (githubState === 'config_missing') {
      setError('GitHub OAuth is not configured on backend. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in backend/.env.')
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

  const openEditModal = (project) => {
    setEditingProject(project)
    setEditName(project.name || '')
    setEditDescription(project.description || '')
  }

  const handleUpdateProject = async (e) => {
    e.preventDefault()
    if (!editingProject) {
      return
    }

    setError('')
    setInfo('')
    try {
      await projectsApi.update(editingProject.id, {
        name: editName,
        description: editDescription
      })
      setInfo('Project updated successfully')
      setEditingProject(null)
      await loadProjects()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update project')
    }
  }

  const handleDeleteProject = async (project) => {
    const shouldDelete = window.confirm(`Delete "${project.name}"?`)
    if (!shouldDelete) {
      return
    }

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

  if (loading) {
    return <div className="text-slate-300">Loading projects...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold text-white">Projects</h1>
        <div className="flex flex-wrap items-center gap-3">
          {githubConnected ? (
            <button onClick={handleLoadRepos} className="btn-secondary flex items-center gap-2" disabled={loadingRepos}>
              <ArrowDownTrayIcon className="h-5 w-5" />
              {loadingRepos ? 'Fetching Repos...' : 'Import from GitHub'}
            </button>
          ) : (
            <button onClick={handleConnectGithub} className="btn-secondary flex items-center gap-2">
              <PlusIcon className="h-5 w-5" />
              Connect GitHub
            </button>
          )}
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-600/40 bg-red-900/20 p-3 text-sm text-red-300">{error}</div> : null}
      {info ? <div className="rounded-lg border border-green-600/40 bg-green-900/20 p-3 text-sm text-green-300">{info}</div> : null}

      {showImportPanel ? (
        <div className="card p-4">
          <h2 className="mb-4 text-lg font-semibold text-white">Your GitHub Repositories</h2>
          <div className="space-y-3">
            {githubRepos.length === 0 ? <p className="text-sm text-slate-400">No repositories found.</p> : null}
            {githubRepos.map((repo) => {
              const alreadyImported = importedRepoIds.has(String(repo.id))
              return (
                <div key={repo.id} className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900/60 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{repo.fullName || repo.name}</span>
                      {repo.private ? (
                        <LockClosedIcon className="h-4 w-4 text-amber-300" title="Private repository" />
                      ) : (
                        <GlobeAltIcon className="h-4 w-4 text-emerald-300" title="Public repository" />
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <StarIcon className="h-4 w-4" />
                        {repo.stars ?? 0}
                      </span>
                      <span>Forks: {repo.forks ?? 0}</span>
                    </div>
                  </div>
                  <button
                    disabled={alreadyImported}
                    onClick={() => handleImportRepo(repo)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      alreadyImported
                        ? 'cursor-not-allowed bg-slate-700 text-slate-400'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
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

      {projects.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">No projects imported yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {projects.map((project) => (
            <div key={project.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-white">{project.name}</h3>
                    {project.isPrivate ? (
                      <LockClosedIcon className="h-4 w-4 text-amber-300" title="Private repository" />
                    ) : (
                      <GlobeAltIcon className="h-4 w-4 text-emerald-300" title="Public repository" />
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-400">{project.description || 'No description'}</p>
                </div>
                <span className="badge badge-low">{project.status || 'active'}</span>
              </div>

              <div className="mt-4 flex items-center gap-4 text-sm text-slate-300">
                <span className="inline-flex items-center gap-1">
                  <StarIcon className="h-4 w-4" />
                  {project.stars ?? 0}
                </span>
                <span>Forks: {project.forks ?? 0}</span>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button onClick={() => openEditModal(project)} className="btn-secondary flex items-center gap-1 px-3 py-1.5 text-sm">
                  <PencilSquareIcon className="h-4 w-4" />
                  Edit
                </button>
                <button onClick={() => handleDeleteProject(project)} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600">
                  <span className="inline-flex items-center gap-1">
                    <TrashIcon className="h-4 w-4" />
                    Delete
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingProject ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <form onSubmit={handleUpdateProject} className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 p-5">
            <h3 className="mb-4 text-lg font-semibold text-white">Edit Project</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-slate-300">Name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-slate-100"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-300">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="min-h-24 w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-slate-100"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingProject(null)} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
