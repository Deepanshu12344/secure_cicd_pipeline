import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer
} from 'recharts'
import { projectsApi, scansApi } from '../services/api'

const statusClass = (status) => {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'completed') return 'bg-[#e6f6ea] text-[#108548]'
  if (normalized === 'running') return 'bg-[#fff6de] text-[#8a6d00]'
  if (normalized === 'failed') return 'bg-[#ffe4e6] text-[#be123c]'
  return 'bg-[#f1f1f1] text-[#666]'
}

const metricsOrder = ['overall', 'accuracy', 'complexity', 'efficiency', 'maintainability', 'documentation']

const prettyMetric = (metric) => {
  if (metric === 'overall') return 'Overall'
  return metric.charAt(0).toUpperCase() + metric.slice(1)
}

const barWidth = (value, max = 100) => `${Math.max(0, Math.min(100, (Number(value || 0) / max) * 100))}%`

export default function Scans() {
  const [scans, setScans] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [banner, setBanner] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [projectQuery, setProjectQuery] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [startingScan, setStartingScan] = useState(false)
  const [downloadingScanId, setDownloadingScanId] = useState('')
  const [expandedScanId, setExpandedScanId] = useState('')
  const [skillsFallbackByScan, setSkillsFallbackByScan] = useState({})

  const loadData = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true)
    setError('')

    try {
      const [scanResponse, projectResponse] = await Promise.all([scansApi.getAll(), projectsApi.getAll()])
      setScans(scanResponse.data?.data || [])
      setProjects(projectResponse.data?.data || [])
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load scans')
    } finally {
      if (showLoader) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(true)
  }, [loadData])

  useEffect(() => {
    const hasRunning = scans.some((scan) => String(scan.status).toLowerCase() === 'running')
    if (!hasRunning) return undefined

    const timer = setInterval(() => {
      loadData(false)
    }, 5000)

    return () => clearInterval(timer)
  }, [scans, loadData])

  useEffect(() => {
    if (scans.length === 0) {
      setExpandedScanId('')
      return
    }

    const selectedStillExists = scans.some((scan) => scan.id === expandedScanId)
    if (!selectedStillExists) {
      setExpandedScanId(scans[0].id)
    }
  }, [scans, expandedScanId])

  useEffect(() => {
    const scan = scans.find((item) => item.id === expandedScanId)
    if (!scan) return
    if (!scan.reportAvailable) return

    const existing = scan.analysisSummary?.skillsGap?.skillLevels || {}
    if (Object.keys(existing).length > 0) return
    if (skillsFallbackByScan[scan.id] !== undefined) return

    let isCancelled = false
    const loadSkillsFromJsonReport = async () => {
      try {
        const response = await scansApi.downloadReport(scan.id, 'json')
        const text = await new Blob([response.data]).text()
        const parsed = JSON.parse(text)
        const skillLevels = parsed?.skills_gap_analysis?.skill_levels || {}
        const overallProficiency = Number(parsed?.skills_gap_analysis?.overall_proficiency || 0)

        if (!isCancelled) {
          setSkillsFallbackByScan((prev) => ({
            ...prev,
            [scan.id]: {
              skillLevels:
                skillLevels && typeof skillLevels === 'object'
                  ? Object.entries(skillLevels).reduce((acc, [name, score]) => {
                      acc[String(name)] = Number(score || 0)
                      return acc
                    }, {})
                  : {},
              overallProficiency
            }
          }))
        }
      } catch {
        if (!isCancelled) {
          setSkillsFallbackByScan((prev) => ({
            ...prev,
            [scan.id]: null
          }))
        }
      }
    }

    loadSkillsFromJsonReport()
    return () => {
      isCancelled = true
    }
  }, [expandedScanId, scans, skillsFallbackByScan])

  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim().toLowerCase()
    if (!query) return projects

    return projects.filter((project) => {
      const haystack = [project.name, project.fullName, project.repositoryUrl].join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [projects, projectQuery])

  const runAnalyzerScan = async () => {
    if (!selectedProjectId || startingScan) return

    const selectedProject = projects.find((project) => project.id === selectedProjectId)
    if (!selectedProject) {
      setError('Selected project was not found')
      return
    }

    try {
      setStartingScan(true)
      setError('')
      setBanner('')

      const createResponse = await scansApi.create({
        projectId: selectedProject.id,
        repositoryUrl: selectedProject.repositoryUrl,
        scanType: 'full',
        branch: 'main'
      })

      const scanId = createResponse.data?.data?.id
      if (!scanId) {
        throw new Error('Scan creation failed')
      }

      await scansApi.run(scanId)
      setBanner('Analyzer scan started. Results will update automatically.')
      setModalOpen(false)
      setProjectQuery('')
      setSelectedProjectId('')
      await loadData(false)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to run scan')
    } finally {
      setStartingScan(false)
    }
  }

  const handleDownload = async (scan, type = 'pdf') => {
    try {
      setDownloadingScanId(scan.id)
      const response = await scansApi.downloadReport(scan.id, type)

      const blob = new Blob([response.data], {
        type: type === 'json' ? 'application/json' : 'application/pdf'
      })

      const disposition = response.headers?.['content-disposition'] || ''
      const match = disposition.match(/filename="?([^";]+)"?/i)
      const fallbackName = `scan-${scan.id}.${type === 'json' ? 'json' : 'pdf'}`
      const filename = match?.[1] || fallbackName

      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to download report')
    } finally {
      setDownloadingScanId('')
    }
  }

  const handleDeleteScan = async (scan) => {
    const shouldDelete = window.confirm(`Delete scan "${scan.id}"?`)
    if (!shouldDelete) return

    try {
      setError('')
      setBanner('')
      await scansApi.delete(scan.id)
      setBanner('Scan deleted successfully.')
      await loadData(false)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to delete scan')
    }
  }

  if (loading) {
    return <div className="bg-white min-h-[calc(100vh-48px)] p-6 text-[#666]">Loading scans...</div>
  }

  return (
    <div className="bg-white min-h-[calc(100vh-48px)]">
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-[#6e49cb]">
          <Link to="/" className="hover:underline">Your work</Link>
          <span className="text-gray-400">/</span>
          <span className="text-[#303030]">Scans</span>
        </div>
      </div>

      <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-normal text-[#303030]">Scans</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 text-sm border border-[#d4d4d4] rounded bg-white text-[#303030] hover:bg-[#f8f8f8]"
        >
          Run Analyzer Scan
        </button>
      </div>

      {banner ? <div className="mb-4 px-4 py-3 text-sm bg-[#eff6ff] border border-[#bfdbfe] text-[#1d4ed8] rounded">{banner}</div> : null}
      {error ? <div className="mb-4 px-4 py-3 text-sm bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] rounded">{error}</div> : null}

      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f8f8f8] border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Scan ID</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Project</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Type</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Status</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Progress</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {scans.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-sm text-[#666]">
                  No scans available.
                </td>
              </tr>
            ) : (
              scans.map((scan) => {
                const progress = Number(scan.progress || 0)
                const summary = scan.analysisSummary
                const metrics = summary?.metrics || {}
                const skillsGap = summary?.skillsGap || {}
                const fallbackSkills = skillsFallbackByScan[scan.id]
                const skillLevels =
                  Object.keys(skillsGap?.skillLevels || {}).length > 0
                    ? skillsGap.skillLevels
                    : fallbackSkills?.skillLevels || {}
                const radarData = Object.entries(skillLevels).map(([skill, score]) => ({
                  skill,
                  score: Math.max(0, Math.min(100, Number(score || 0)))
                }))
                const severities = summary?.severityCounts || {}
                const categories = summary?.categoryCounts || {}
                const hasAnalytics = String(scan.status).toLowerCase() === 'completed' && summary
                const isExpanded = expandedScanId === scan.id

                return (
                  <Fragment key={scan.id}>
                    <tr
                      className={`hover:bg-gray-50 transition-colors cursor-pointer ${isExpanded ? 'bg-[#fcfcfc]' : ''}`}
                      onClick={() => setExpandedScanId(scan.id)}
                    >
                      <td className="px-6 py-4 text-[#303030] text-sm">{scan.id}</td>
                      <td className="px-6 py-4 text-[#666] text-sm">{scan.projectFullName || scan.projectName || scan.projectId || '-'}</td>
                      <td className="px-6 py-4 text-[#666] text-sm">{scan.scanType || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${statusClass(scan.status)}`}>
                          {String(scan.status || 'unknown')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-[#1f75cb] h-2 rounded-full"
                              style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-[#666]">{Math.max(0, Math.min(progress, 100))}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {scan.reportAvailable ? (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDownload(scan, 'pdf')
                                }}
                                disabled={downloadingScanId === scan.id}
                                className="px-3 py-1.5 text-xs border border-[#d4d4d4] rounded bg-white hover:bg-[#f8f8f8] text-[#303030]"
                              >
                                Download PDF
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDownload(scan, 'json')
                                }}
                                disabled={downloadingScanId === scan.id}
                                className="px-3 py-1.5 text-xs border border-[#d4d4d4] rounded bg-white hover:bg-[#f8f8f8] text-[#303030]"
                              >
                                Download JSON
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-[#999]">Report unavailable</span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteScan(scan)
                            }}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 text-[#303030]" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded ? (
                      <tr className="bg-[#fcfcfc]">
                        <td colSpan={6} className="px-6 py-5">
                          {hasAnalytics ? (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="border border-gray-200 rounded p-4 bg-white">
                                <div className="text-xs text-[#666] mb-1">Overall score</div>
                                <div className="text-3xl text-[#303030] leading-none">{Math.round(Number(metrics.overall || 0))}</div>
                                <div className="text-xs text-[#666] mt-1">Files analyzed: {summary.totalFilesAnalyzed || 0}</div>
                              </div>

                              <div className="border border-gray-200 rounded p-4 bg-white md:col-span-2">
                                <div className="text-xs text-[#666] mb-2">Quality metrics</div>
                                <div className="space-y-2">
                                  {metricsOrder.map((metric) => (
                                    <div key={`${scan.id}-${metric}`} className="grid grid-cols-[120px_1fr_42px] items-center gap-2 text-xs">
                                      <span className="text-[#666]">{prettyMetric(metric)}</span>
                                      <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div className="bg-[#1f75cb] h-2 rounded-full" style={{ width: barWidth(metrics[metric]) }}></div>
                                      </div>
                                      <span className="text-[#303030] text-right">{Math.round(Number(metrics[metric] || 0))}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="border border-gray-200 rounded p-4 bg-white md:col-span-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-xs text-[#666]">Skills radar</div>
                                  <div className="text-xs text-[#666]">
                                    Overall proficiency:{' '}
                                    {Math.round(
                                      Number(
                                        Object.keys(skillsGap?.skillLevels || {}).length > 0
                                          ? skillsGap?.overallProficiency || 0
                                          : fallbackSkills?.overallProficiency || 0
                                      )
                                    )}
                                  </div>
                                </div>
                                {radarData.length > 0 ? (
                                  <div className="h-80">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <RadarChart data={radarData} outerRadius="70%">
                                        <PolarGrid stroke="#d4d4d4" />
                                        <PolarAngleAxis
                                          dataKey="skill"
                                          tick={{ fill: '#666', fontSize: 11 }}
                                          tickLine={false}
                                        />
                                        <PolarRadiusAxis
                                          angle={90}
                                          domain={[0, 100]}
                                          tick={{ fill: '#999', fontSize: 10 }}
                                          tickCount={6}
                                        />
                                        <Radar
                                          dataKey="score"
                                          stroke="#1f75cb"
                                          fill="#1f75cb"
                                          fillOpacity={0.25}
                                        />
                                      </RadarChart>
                                    </ResponsiveContainer>
                                  </div>
                                ) : (
                                  <div className="text-xs text-[#999]">No skills data available for this scan.</div>
                                )}
                              </div>

                              <div className="border border-gray-200 rounded p-4 bg-white md:col-span-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <div className="text-xs text-[#666] mb-2">Issue severity</div>
                                    <div className="space-y-2">
                                      {['High', 'Medium', 'Low'].map((level) => (
                                        <div key={`${scan.id}-${level}`} className="grid grid-cols-[60px_1fr_30px] items-center gap-2 text-xs">
                                          <span className="text-[#666]">{level}</span>
                                          <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div
                                              className={`h-2 rounded-full ${
                                                level === 'High' ? 'bg-[#dc2626]' : level === 'Medium' ? 'bg-[#d97706]' : 'bg-[#059669]'
                                              }`}
                                              style={{ width: barWidth(severities[level] || 0, Math.max(1, summary.totalIssues || 1)) }}
                                            ></div>
                                          </div>
                                          <span className="text-[#303030] text-right">{Number(severities[level] || 0)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>

                                  <div>
                                    <div className="text-xs text-[#666] mb-2">Issue categories</div>
                                    <div className="space-y-1 text-xs text-[#303030] max-h-28 overflow-auto pr-1">
                                      {Object.keys(categories).length === 0 ? (
                                        <div className="text-[#999]">No categories available</div>
                                      ) : (
                                        Object.entries(categories)
                                          .sort((a, b) => b[1] - a[1])
                                          .slice(0, 6)
                                          .map(([category, count]) => (
                                            <div key={`${scan.id}-${category}`} className="flex items-center justify-between border-b border-gray-100 py-1">
                                              <span>{category}</span>
                                              <span className="text-[#666]">{count}</span>
                                            </div>
                                          ))
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="border border-gray-200 rounded p-4 bg-white text-sm">
                              <div className="text-[#303030] mb-1">No analytics available for this scan yet.</div>
                              <div className="text-[#666]">
                                {scan.errorMessage
                                  ? `Reason: ${scan.errorMessage}`
                                  : 'Run the scan again to generate report and analytics.'}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded border border-gray-300 shadow-lg">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg text-[#303030]">Run Analyzer Scan</h2>
              <button className="text-sm text-[#666] hover:text-[#303030]" onClick={() => setModalOpen(false)}>
                Close
              </button>
            </div>

            <div className="p-5">
              <label className="block text-sm text-[#303030] mb-2">Search imported project</label>
              <input
                type="text"
                value={projectQuery}
                onChange={(e) => setProjectQuery(e.target.value)}
                placeholder="Search by project name or repository URL"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-[#303030] focus:outline-none focus:border-[#1f75cb]"
              />

              <div className="mt-4 border border-gray-200 rounded max-h-72 overflow-auto divide-y divide-gray-100">
                {filteredProjects.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-center text-[#666]">No matching imported projects.</div>
                ) : (
                  filteredProjects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`w-full px-4 py-3 text-left hover:bg-[#f8f8f8] ${
                        selectedProjectId === project.id ? 'bg-[#eef5ff]' : 'bg-white'
                      }`}
                    >
                      <div className="text-sm text-[#303030]">{project.fullName || project.name}</div>
                      <div className="text-xs text-[#666] mt-1">{project.repositoryUrl}</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                className="px-4 py-2 text-sm border border-gray-300 rounded bg-white text-[#303030] hover:bg-[#f8f8f8]"
                onClick={() => setModalOpen(false)}
                disabled={startingScan}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm border border-[#1f75cb] rounded bg-[#1f75cb] text-white disabled:opacity-60"
                onClick={runAnalyzerScan}
                disabled={!selectedProjectId || startingScan}
              >
                {startingScan ? 'Starting...' : 'Run Scan'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  )
}
