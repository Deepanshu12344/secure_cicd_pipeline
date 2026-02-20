import { AlertCircle, Camera, CheckCircle2, Clock3, FolderGit2, Settings } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi, projectsApi, scansApi } from '../services/api'
import { useAuthStore } from '../store/auth'

const formatRelative = (value) => {
  if (!value) return 'just now'
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / (1000 * 60))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

const Home = () => {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const userName = user?.name || 'Developer'
  const fileInputRef = useRef(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')

  const [projects, setProjects] = useState([])
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quickTab, setQuickTab] = useState('recent')
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
  const backendBase = apiBase.replace(/\/api\/?$/, '')
  const profilePhotoSrc = user?.profilePhotoUrl
    ? user.profilePhotoUrl.startsWith('http')
      ? user.profilePhotoUrl
      : `${backendBase}${user.profilePhotoUrl}`
    : null

  const handleProfilePhotoChange = async (event) => {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return

    if (!String(selected.type || '').startsWith('image/')) {
      setPhotoError('Please select an image file.')
      return
    }

    if (selected.size > 5 * 1024 * 1024) {
      setPhotoError('Image must be 5MB or smaller.')
      return
    }

    const formData = new FormData()
    formData.append('photo', selected)

    try {
      setUploadingPhoto(true)
      setPhotoError('')
      const response = await authApi.uploadProfilePhoto(formData)
      const updatedUser = response.data?.data?.user
      if (updatedUser) {
        setUser(updatedUser)
      }
    } catch (err) {
      setPhotoError(err.response?.data?.error || 'Failed to upload profile photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  const loadData = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true)
    setError('')
    try {
      const [projectsRes, scansRes] = await Promise.all([projectsApi.getAll(), scansApi.getAll()])
      setProjects(projectsRes.data?.data || [])
      setScans(scansRes.data?.data || [])
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load home data')
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(true)
  }, [loadData])

  useEffect(() => {
    const timer = setInterval(() => {
      loadData(false)
    }, 30000)

    return () => clearInterval(timer)
  }, [loadData])

  const projectCount = projects.length
  const runningScans = scans.filter((scan) => String(scan.status).toLowerCase() === 'running')
  const failedScans = scans.filter((scan) => String(scan.status).toLowerCase() === 'failed')
  const completedScans = scans.filter((scan) => String(scan.status).toLowerCase() === 'completed')

  const attentionItems = useMemo(() => {
    const items = []

    failedScans.slice(0, 4).forEach((scan) => {
      items.push({
        id: `failed-${scan.id}`,
        type: 'failed_scan',
        title: `Failed scan: ${scan.projectFullName || scan.projectName || scan.projectId}`,
        subtitle: scan.errorMessage || 'Scan failed and needs rerun.',
        when: scan.updatedAt,
        link: '/scans'
      })
    })

    runningScans.slice(0, 2).forEach((scan) => {
      items.push({
        id: `running-${scan.id}`,
        type: 'running_scan',
        title: `Scan in progress: ${scan.projectFullName || scan.projectName || scan.projectId}`,
        subtitle: `Current progress: ${Number(scan.progress || 0)}%`,
        when: scan.updatedAt,
        link: '/scans'
      })
    })

    projects
      .filter((project) => Number(project.riskScore || 0) >= 70)
      .slice(0, 3)
      .forEach((project) => {
        items.push({
          id: `risk-${project.id}`,
          type: 'high_risk',
          title: `High risk project: ${project.fullName || project.name}`,
          subtitle: `Risk score: ${Number(project.riskScore || 0)}`,
          when: project.updatedAt,
          link: '/projects'
        })
      })

    return items
      .sort((a, b) => new Date(b.when || 0).getTime() - new Date(a.when || 0).getTime())
      .slice(0, 6)
  }, [failedScans, runningScans, projects])

  const latestUpdates = useMemo(() => {
    const updates = []

    scans.slice(0, 8).forEach((scan) => {
      updates.push({
        id: `scan-${scan.id}`,
        title: `Scan ${scan.status}: ${scan.projectFullName || scan.projectName || scan.projectId}`,
        subtitle: `Type: ${scan.scanType || 'full'} ? Progress: ${Number(scan.progress || 0)}%`,
        when: scan.updatedAt,
        link: '/scans'
      })
    })

    projects.slice(0, 8).forEach((project) => {
      updates.push({
        id: `project-${project.id}`,
        title: `Project updated: ${project.fullName || project.name}`,
        subtitle: `Language: ${project.language || 'unknown'} ? Risk: ${Number(project.riskScore || 0)}`,
        when: project.updatedAt,
        link: `/projects/${project.id}`
      })
    })

    return updates
      .sort((a, b) => new Date(b.when || 0).getTime() - new Date(a.when || 0).getTime())
      .slice(0, 8)
  }, [projects, scans])

  const quickAccessItems = useMemo(() => {
    if (quickTab === 'projects') {
      return projects.slice(0, 6).map((project) => ({
        id: project.id,
        title: project.fullName || project.name,
        subtitle: `Risk ${Number(project.riskScore || 0)}`,
        link: `/projects/${project.id}`
      }))
    }

    const recent = scans
      .slice(0, 10)
      .map((scan) => ({
        id: scan.id,
        title: scan.projectFullName || scan.projectName || scan.projectId,
        subtitle: `Scan ${scan.status} ? ${formatRelative(scan.updatedAt)}`,
        link: '/scans'
      }))

    return recent.slice(0, 6)
  }, [projects, scans, quickTab])

  if (loading) {
    return <div className="bg-white min-h-[calc(100vh-48px)] p-6 text-[#666]">Loading home...</div>
  }

  return (
    <div className="bg-[#fbfbfb] min-h-[calc(100vh-48px)]">
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-[#6e49cb]">
          <Link to="/" className="hover:underline">Your work</Link>
          <span className="text-gray-400">/</span>
          <span className="text-[#303030]">Home</span>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-6">
        {error ? <div className="mb-4 px-4 py-3 text-sm bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] rounded">{error}</div> : null}

        <div className="flex gap-6">
          <div className="flex-1">
            <div className="mb-6">
              <div className="flex items-start gap-4">
                <div className="relative w-16 h-16 flex-shrink-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleProfilePhotoChange}
                  />
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center overflow-hidden">
                  {profilePhotoSrc ? (
                    <img src={profilePhotoSrc} alt={`${userName} profile`} className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-12 h-12 text-white" viewBox="0 0 48 48">
                      <defs>
                        <pattern id="dots" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                          <circle cx="4" cy="4" r="1.5" fill="white" />
                        </pattern>
                      </defs>
                      <rect width="48" height="48" fill="url(#dots)" />
                    </svg>
                  )}
                </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="absolute -right-1 -bottom-1 w-7 h-7 rounded-full border border-white bg-[#1f75cb] text-white flex items-center justify-center hover:bg-[#195f9f] disabled:opacity-60"
                    title={uploadingPhoto ? 'Uploading...' : 'Upload photo'}
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div>
                  <div className="text-xs text-[#6e49cb] font-medium mb-1">Today's highlights</div>
                  <h1 className="text-3xl font-normal text-[#303030]">Hi, {userName}</h1>
                  {uploadingPhoto ? <p className="text-xs text-[#666] mt-2">Uploading photo...</p> : null}
                  {photoError ? <p className="text-xs text-[#be123c] mt-2">{photoError}</p> : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-white border border-gray-200 rounded p-4 hover:border-gray-300 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[#303030]">Projects</span>
                  <FolderGit2 className="w-4 h-4 text-gray-500" />
                </div>
                <div className="text-3xl font-normal text-[#303030] mb-1">{projectCount}</div>
                <div className="text-xs text-[#666]">Imported and tracked repositories</div>
              </div>

              <div className="bg-white border border-gray-200 rounded p-4 hover:border-gray-300 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[#303030]">Running scans</span>
                  <Clock3 className="w-4 h-4 text-gray-500" />
                </div>
                <div className="text-3xl font-normal text-[#303030] mb-1">{runningScans.length}</div>
                <div className="text-xs text-[#666]">Currently in progress</div>
              </div>

              <div className="bg-white border border-gray-200 rounded p-4 hover:border-gray-300 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[#303030]">Failed scans</span>
                  <AlertCircle className="w-4 h-4 text-gray-500" />
                </div>
                <div className="text-3xl font-normal text-[#303030] mb-1">{failedScans.length}</div>
                <div className="text-xs text-[#666]">Need rerun or review</div>
              </div>

              <div className="bg-white border border-gray-200 rounded p-4 hover:border-gray-300 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[#303030]">Completed scans</span>
                  <CheckCircle2 className="w-4 h-4 text-gray-500" />
                </div>
                <div className="text-3xl font-normal text-[#303030] mb-1">{completedScans.length}</div>
                <div className="text-xs text-[#666]">Reports available to download</div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-medium text-[#303030]">Items that need your attention</h2>
                <Link to="/scans" className="text-sm text-[#1f75cb] hover:underline">Open scans</Link>
              </div>

              {attentionItems.length === 0 ? (
                <div className="flex items-start gap-4 py-4">
                  <div className="w-12 h-12 rounded-full bg-[#91d4a8] flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-[#108548]" />
                  </div>
                  <div>
                    <p className="text-sm text-[#303030]"><span className="font-semibold">Good job!</span> All your critical items are clear.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {attentionItems.map((item) => (
                    <Link key={item.id} to={item.link} className="block border border-gray-200 rounded px-3 py-2 hover:bg-gray-50">
                      <div className="text-sm text-[#303030]">{item.title}</div>
                      <div className="text-xs text-[#666] mt-1">{item.subtitle} ? {formatRelative(item.when)}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-medium text-[#303030]">Follow the latest updates</h2>
                <Link to="/projects" className="text-sm text-[#1f75cb] hover:underline">View projects</Link>
              </div>

              {latestUpdates.length === 0 ? (
                <p className="text-sm text-[#666]">No recent activity yet.</p>
              ) : (
                <div className="space-y-2">
                  {latestUpdates.map((update) => (
                    <Link key={update.id} to={update.link} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 px-2 rounded">
                      <div className="min-w-0">
                        <div className="text-sm text-[#303030] truncate">{update.title}</div>
                        <div className="text-xs text-[#666] truncate mt-0.5">{update.subtitle}</div>
                      </div>
                      <div className="text-xs text-[#666] whitespace-nowrap">{formatRelative(update.when)}</div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="w-80">
            <div className="bg-white border border-gray-200 rounded p-4 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#303030]">Quick access</h2>
                <button className="p-1 hover:bg-gray-100 rounded">
                  <Settings className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setQuickTab('recent')}
                  className={`flex-1 px-3 py-1.5 text-sm border rounded transition-colors ${
                    quickTab === 'recent'
                      ? 'text-[#303030] bg-gray-100 border-gray-300'
                      : 'text-[#303030] border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Recently viewed
                </button>
                <button
                  onClick={() => setQuickTab('projects')}
                  className={`flex-1 px-3 py-1.5 text-sm border rounded transition-colors ${
                    quickTab === 'projects'
                      ? 'text-[#303030] bg-gray-100 border-gray-300'
                      : 'text-[#303030] border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Projects
                </button>
              </div>

              <div className="space-y-2">
                {quickAccessItems.length === 0 ? (
                  <div className="text-sm text-[#666] px-1 py-2">No quick access items.</div>
                ) : (
                  quickAccessItems.map((item) => (
                    <Link key={item.id} to={item.link} className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer">
                      <div className="w-6 h-6 bg-gray-200 rounded flex items-center justify-center text-xs font-semibold text-[#303030]">
                        {(item.title || 'P').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-[#303030] truncate">{item.title}</div>
                        <div className="text-xs text-[#666] truncate">{item.subtitle}</div>
                      </div>
                    </Link>
                  ))
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-gray-200">
                <p className="text-xs text-[#666]">Data is synced from your latest projects and scans.</p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded p-4">
              <h2 className="text-sm font-semibold text-[#303030] mb-2">Share your feedback</h2>
              <p className="text-sm text-[#666] mb-3">
                Help us improve this homepage experience with your suggestions.
              </p>
              <Link to="/scans" className="text-sm text-[#1f75cb] hover:underline">
                Open scans workspace
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
