import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Lock, Globe, Star, GitMerge } from 'lucide-react'
import { projectsApi } from '../services/api'

const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  return date.toLocaleString()
}

export default function ProjectDetail() {
  const { id } = useParams()
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    const loadProject = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await projectsApi.getById(id)
        if (mounted) {
          setProject(response.data?.data || null)
        }
      } catch (err) {
        if (mounted) {
          setError(err.response?.data?.error || 'Failed to load project details')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadProject()

    return () => {
      mounted = false
    }
  }, [id])

  if (loading) {
    return <div className="bg-white min-h-[calc(100vh-48px)] p-6 text-[#666]">Loading project details...</div>
  }

  if (error || !project) {
    return (
      <div className="bg-white min-h-[calc(100vh-48px)] p-6">
        <p className="text-sm text-[#be123c] mb-4">{error || 'Project not found'}</p>
        <Link to="/projects" className="text-sm text-[#1f75cb] hover:underline">Back to Projects</Link>
      </div>
    )
  }

  return (
    <div className="bg-white min-h-[calc(100vh-48px)] p-6">
      <div className="mb-6">
        <Link to="/projects" className="text-sm text-[#6e49cb] hover:underline">Your work / Projects</Link>
        <h1 className="text-2xl font-normal text-[#303030] mt-2">{project.fullName || project.name}</h1>
        <p className="text-[#666] mt-1">{project.description || 'No description available.'}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 border border-gray-200 rounded p-5 bg-white">
          <h2 className="text-base font-medium text-[#303030] mb-4">Project Information</h2>

          <div className="space-y-3 text-sm">
            <div>
              <div className="text-[#666]">Repository URL</div>
              <a
                href={project.repositoryUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#1f75cb] hover:underline break-all"
              >
                {project.repositoryUrl}
              </a>
            </div>
            <div>
              <div className="text-[#666]">Language</div>
              <div className="text-[#303030]">{project.language || 'unknown'}</div>
            </div>
            <div>
              <div className="text-[#666]">Visibility</div>
              <div className="text-[#303030] inline-flex items-center gap-1">
                {project.isPrivate ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                {project.isPrivate ? 'Private' : 'Public'}
              </div>
            </div>
            <div>
              <div className="text-[#666]">Created</div>
              <div className="text-[#303030]">{formatDate(project.createdAt)}</div>
            </div>
            <div>
              <div className="text-[#666]">Updated</div>
              <div className="text-[#303030]">{formatDate(project.updatedAt)}</div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="border border-gray-200 rounded p-5 bg-white">
            <h3 className="text-base font-medium text-[#303030] mb-3">Repository Stats</h3>
            <div className="space-y-2 text-sm text-[#303030]">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1"><Star className="w-4 h-4" /> Stars</span>
                <span>{project.stars ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1"><GitMerge className="w-4 h-4" /> Forks</span>
                <span>{project.forks ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Status</span>
                <span className="px-2 py-0.5 bg-[#e6f6ea] text-[#108548] rounded text-xs font-medium">{project.status || 'active'}</span>
              </div>
            </div>
          </div>

          <div className="border border-gray-200 rounded p-5 bg-white">
            <h3 className="text-base font-medium text-[#303030] mb-2">Risk Score</h3>
            <div className="text-3xl text-[#303030]">{project.riskScore ?? 0}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
