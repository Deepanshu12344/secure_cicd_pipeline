import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ShieldAlert, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
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
  const [scanExplainData, setScanExplainData] = useState(null)
  const [scanExplainLoading, setScanExplainLoading] = useState(false)
  const [error, setError] = useState('')
  const [banner, setBanner] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [projectQuery, setProjectQuery] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [startingScan, setStartingScan] = useState(false)
  const [downloadingScanId, setDownloadingScanId] = useState('')
  const [expandedScanId, setExpandedScanId] = useState('')
  const [skillsFallbackByScan, setSkillsFallbackByScan] = useState({})
  const [sourceFilter, setSourceFilter] = useState('all')

  const handleOpenScanExplain = async (scan) => {
    try {
      setScanExplainLoading(true)
      setScanExplainData({ scan, loading: true })
      const res = await scansApi.getExplanation(scan.id)
      setScanExplainData({
        scan,
        ...res.data?.data
      })
    } catch (err) {
      setBanner(err.response?.data?.error || err.response?.data?.message || 'Failed to load score explanation')
      setScanExplainData(null)
    } finally {
      setScanExplainLoading(false)
    }
  }

  const filteredScans = useMemo(() => {
    if (sourceFilter === 'all') return scans
    if (sourceFilter === 'pre-commit') return scans.filter((s) => s.scanType === 'pre-commit')
    if (sourceFilter === 'cicd') return scans.filter((s) => s.scanType === 'cicd')
    if (sourceFilter === 'full') return scans.filter((s) => !s.scanType || s.scanType === 'full')
    return scans
  }, [scans, sourceFilter])

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
    const timer = setInterval(() => {
      loadData(false)
    }, 15000)

    return () => clearInterval(timer)
  }, [loadData])

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
    return <div className="bg-white min-h-[calc(100vh-48px)] p-4 sm:p-6 text-[#666]">Loading scans...</div>
  }

  return (
    <div className="bg-white min-h-[calc(100vh-48px)]">
      <div className="border-b border-gray-200 bg-white px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-[#6e49cb]">
          <Link to="/" className="hover:underline">Your work</Link>
          <span className="text-gray-400">/</span>
          <span className="text-[#303030]">Scans</span>
        </div>
      </div>

      <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-normal text-[#303030]">Scans</h1>
          <div className="flex items-center border border-gray-200 rounded overflow-hidden text-xs">
            <button
              onClick={() => setSourceFilter('all')}
              className={`px-3 py-1.5 transition-colors ${
                sourceFilter === 'all'
                  ? 'bg-[#1f75cb] text-white font-medium'
                  : 'bg-white text-[#666] hover:bg-gray-50'
              }`}
            >
              All ({scans.length})
            </button>
            <button
              onClick={() => setSourceFilter('pre-commit')}
              className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${
                sourceFilter === 'pre-commit'
                  ? 'bg-[#1f75cb] text-white font-medium'
                  : 'bg-white text-[#666] hover:bg-gray-50'
              }`}
            >
              Pre-Commit ({scans.filter((s) => s.scanType === 'pre-commit').length})
            </button>
            <button
              onClick={() => setSourceFilter('cicd')}
              className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${
                sourceFilter === 'cicd'
                  ? 'bg-[#1f75cb] text-white font-medium'
                  : 'bg-white text-[#666] hover:bg-gray-50'
              }`}
            >
              CI/CD ({scans.filter((s) => s.scanType === 'cicd').length})
            </button>
            <button
              onClick={() => setSourceFilter('full')}
              className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${
                sourceFilter === 'full'
                  ? 'bg-[#1f75cb] text-white font-medium'
                  : 'bg-white text-[#666] hover:bg-gray-50'
              }`}
            >
              Manual ({scans.filter((s) => !s.scanType || s.scanType === 'full').length})
            </button>
          </div>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="w-full sm:w-auto px-4 py-2 text-sm border border-[#d4d4d4] rounded bg-white text-[#303030] hover:bg-[#f8f8f8]"
        >
          Run Analyzer Scan
        </button>
      </div>

      {banner ? <div className="mb-4 px-4 py-3 text-sm bg-[#eff6ff] border border-[#bfdbfe] text-[#1d4ed8] rounded">{banner}</div> : null}
      {error ? <div className="mb-4 px-4 py-3 text-sm bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] rounded">{error}</div> : null}

      <div className="border border-gray-200 rounded overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead className="bg-[#f8f8f8] border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Scan ID</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Project</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Type</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Status</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Risk Score</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Progress</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredScans.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-sm text-[#666]">
                  {sourceFilter === 'all'
                    ? 'No scans available.'
                    : `No ${sourceFilter} scans found.`}
                </td>
              </tr>
            ) : (
              filteredScans.map((scan) => {
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
                const barChartData = [...radarData]
                  .sort((a, b) => b.score - a.score)
                  .map((entry) => ({
                    ...entry,
                    shortSkill: entry.skill.length > 18 ? `${entry.skill.slice(0, 18)}...` : entry.skill
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
                      <td className="px-6 py-4 text-[#666] text-sm">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            scan.scanType === 'pre-commit'
                              ? 'bg-purple-100 text-purple-700'
                              : scan.scanType === 'cicd'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {scan.scanType || 'full'}
                          </span>
                          {scan.isBypass && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                              BYPASSED
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${statusClass(scan.status)}`}>
                          {String(scan.status || 'unknown')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 font-mono text-xs">
                            <span className="font-semibold text-[#303030]">
                              {scan.scoreSource === 'adjusted'
                                ? (scan.adjustedRiskScore ?? scan.riskScore ?? 0)
                                : (scan.rawRiskScore ?? scan.riskScore ?? 0)}
                              /10
                            </span>
                            {scan.scoreSource ? (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                                scan.scoreSource === 'adjusted' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                              }`}>
                                {scan.scoreSource}
                              </span>
                            ) : null}
                          </div>
                          {scan.modelMetrics?.version ? (
                            <span className="text-[10px] text-gray-400">
                              {scan.modelMetrics.version} ({scan.modelMetrics.confidence || 'bootstrap'})
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-center gap-2">
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
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenScanExplain(scan)
                            }}
                            className="px-2 py-1.5 text-xs border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#1f75cb] rounded font-medium flex items-center gap-1"
                            title="Explain scan score"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            Explain
                          </button>
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
                        <td colSpan={7} className="px-3 sm:px-6 py-5">
                          {hasAnalytics ? (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div className="border border-gray-200 rounded p-4 bg-white">
                                <div className="text-xs text-[#666] mb-1">Quality score</div>
                                <div className="text-3xl text-[#303030] leading-none">{Math.round(Number(metrics.overall || 0))}</div>
                                <div className="text-xs text-[#666] mt-1">Files analyzed: {summary.totalFilesAnalyzed || 0}</div>
                              </div>

                              <div className="border border-gray-200 rounded p-4 bg-white flex flex-col justify-between">
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="text-xs text-[#666] font-medium">Risk score</div>
                                    {scan.scoreSource ? (
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                                        scan.scoreSource === 'adjusted' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                                      }`}>
                                        {scan.scoreSource}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="text-3xl text-[#303030] leading-none font-semibold">
                                    {scan.scoreSource === 'adjusted'
                                      ? (scan.adjustedRiskScore ?? scan.riskScore ?? 0)
                                      : (scan.rawRiskScore ?? scan.riskScore ?? 0)}
                                    <span className="text-sm text-gray-400 font-normal"> / 10</span>
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    Raw: {scan.rawRiskScore ?? scan.riskScore ?? 0} | Adj: {scan.adjustedRiskScore ?? scan.riskScore ?? 0}
                                  </div>
                                  {scan.fallbackReason ? (
                                    <div className="mt-2 p-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-[10px] rounded">
                                      ⚠️ {scan.fallbackReason}
                                    </div>
                                  ) : null}
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleOpenScanExplain(scan)
                                  }}
                                  className="mt-3 w-full px-2.5 py-1 text-xs bg-white border border-[#1f75cb] text-[#1f75cb] hover:bg-blue-50 rounded font-medium flex items-center justify-center gap-1.5"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  Explain Score
                                </button>
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

                              <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-[7fr_3fr] gap-4">
                                <div className="border border-gray-200 rounded p-4 bg-white">
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
                                    <div className="h-56 sm:h-64">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart data={radarData} outerRadius="68%">
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

                                <div className="border border-gray-200 rounded p-4 bg-white">
                                  <div className="text-xs text-[#666] mb-2">Skills line chart</div>
                                  {barChartData.length > 0 ? (
                                    <div className="h-60 sm:h-64">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <LineChart
                                          data={barChartData}
                                          margin={{ top: 10, right: 12, left: 2, bottom: 22 }}
                                        >
                                          <CartesianGrid strokeDasharray="3 3" stroke="#ececec" />
                                          <XAxis
                                            dataKey="shortSkill"
                                            tick={{ fill: '#666', fontSize: 9 }}
                                            interval="preserveStartEnd"
                                            angle={-35}
                                            textAnchor="end"
                                            height={64}
                                            minTickGap={10}
                                          />
                                          <YAxis
                                            domain={[0, 100]}
                                            tick={{ fill: '#666', fontSize: 10 }}
                                          />
                                          <Tooltip
                                            formatter={(value, name, item) => [value, item?.payload?.skill || name]}
                                            contentStyle={{ border: '1px solid #e5e7eb', borderRadius: 6 }}
                                          />
                                          <Line
                                            type="monotone"
                                            dataKey="score"
                                            name="Skill score"
                                            stroke="#1f75cb"
                                            strokeWidth={2}
                                            dot={{ r: 3 }}
                                            activeDot={{ r: 5 }}
                                          />
                                        </LineChart>
                                      </ResponsiveContainer>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-[#999]">No skills data available for this scan.</div>
                                  )}
                                </div>
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
      </div>

      {/* SCAN EXPLANATION MODAL */}
      {scanExplainData ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-3xl bg-white rounded-lg border border-gray-300 shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#1f75cb]" />
                <h3 className="text-base font-medium text-[#303030]">Scan Risk Score Explanation</h3>
              </div>
              <button
                className="text-gray-400 hover:text-gray-600 p-1 rounded"
                onClick={() => setScanExplainData(null)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
                <div>
                  <div className="text-sm font-semibold text-[#303030]">
                    {scanExplainData.scan?.projectFullName || scanExplainData.scan?.projectName || scanExplainData.scan?.projectId || 'Project Scan'}
                  </div>
                  <div className="text-xs text-gray-500 font-mono mt-0.5">Scan ID: {scanExplainData.scan?.id}</div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs font-mono uppercase bg-purple-100 text-purple-700 font-medium">
                    Source: {scanExplainData.scoreSource || scanExplainData.scan?.scoreSource || 'raw'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-mono bg-blue-50 text-blue-700 border border-blue-200">
                    Model: {scanExplainData.modelMetrics?.version || 'v1'} ({scanExplainData.modelMetrics?.confidence || 'bootstrap'})
                  </span>
                </div>
              </div>

              {scanExplainLoading ? (
                <div className="py-12 text-center text-sm text-gray-500">Computing explainable breakdown...</div>
              ) : (
                <>
                  {/* Score Comparison Cards */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded">
                      <div className="text-xs text-gray-500 font-medium uppercase">Raw Severity Score</div>
                      <div className="text-2xl font-bold text-[#303030] mt-1">
                        {scanExplainData.rawRiskScore ?? scanExplainData.scan?.rawRiskScore ?? 0}
                        <span className="text-sm text-gray-400 font-normal"> / 10.0</span>
                      </div>
                      <div className="text-[11px] text-gray-500 mt-1">
                        Unweighted sum of all detected rule severities
                      </div>
                    </div>

                    <div className="p-4 bg-purple-50 border border-purple-200 rounded">
                      <div className="text-xs text-purple-700 font-medium uppercase">ML-Adjusted Risk Score</div>
                      <div className="text-2xl font-bold text-purple-900 mt-1">
                        {scanExplainData.adjustedRiskScore ?? scanExplainData.scan?.adjustedRiskScore ?? 0}
                        <span className="text-sm text-purple-400 font-normal"> / 10.0</span>
                      </div>
                      <div className="text-[11px] text-purple-700 mt-1">
                        Probability-weighted with auto-suppression of false positives
                      </div>
                    </div>
                  </div>

                  {/* Formula explanation */}
                  {scanExplainData.explanation?.formula ? (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900">
                      <span className="font-semibold">Scoring Policy & Formula: </span>
                      {scanExplainData.explanation.formula}
                    </div>
                  ) : null}

                  {/* Top contributing findings */}
                  <div>
                    <div className="text-xs font-semibold text-[#303030] mb-2">Findings Breakdown</div>
                    <div className="border border-gray-200 rounded overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-[#f8f8f8] border-b border-gray-200 text-[#666]">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Finding / Rule</th>
                            <th className="px-3 py-2 text-left font-medium">Severity</th>
                            <th className="px-3 py-2 text-left font-medium">P(TP)</th>
                            <th className="px-3 py-2 text-left font-medium">Status / Impact</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(scanExplainData.explanation?.top_contributing_findings || []).length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-4 py-4 text-center text-gray-500">
                                No individual findings to display.
                              </td>
                            </tr>
                          ) : (
                            (scanExplainData.explanation?.top_contributing_findings || []).map((f, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-3 py-2">
                                  <div className="font-medium text-[#303030]">{f.ruleId || f.title || f.issue}</div>
                                  <div className="text-[11px] text-gray-400 font-mono">{f.file || 'Repository'}</div>
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                    String(f.severity).toLowerCase() === 'critical'
                                      ? 'bg-red-100 text-red-800'
                                      : String(f.severity).toLowerCase() === 'high'
                                      ? 'bg-orange-100 text-orange-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}>
                                    {String(f.severity).toUpperCase()}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-mono">
                                  {f.probability !== undefined && f.probability !== null
                                    ? `${Math.round(Number(f.probability) * 100)}%`
                                    : '-'}
                                </td>
                                <td className="px-3 py-2">
                                  {f.is_suppressed ? (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-800 font-medium">
                                      Suppressed (FP)
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-50 text-red-700 font-medium font-mono">
                                      +{Number(f.effective_weight || 0).toFixed(2)} pts
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                onClick={() => setScanExplainData(null)}
                className="px-4 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-100 text-[#303030]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-2xl bg-white rounded border border-gray-300 shadow-lg max-h-[92vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg text-[#303030]">Run Analyzer Scan</h2>
              <button className="text-sm text-[#666] hover:text-[#303030]" onClick={() => setModalOpen(false)}>
                Close
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto">
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

            <div className="px-4 sm:px-5 py-4 border-t border-gray-200 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <button
                className="w-full sm:w-auto px-4 py-2 text-sm border border-gray-300 rounded bg-white text-[#303030] hover:bg-[#f8f8f8]"
                onClick={() => setModalOpen(false)}
                disabled={startingScan}
              >
                Cancel
              </button>
              <button
                className="w-full sm:w-auto px-4 py-2 text-sm border border-[#1f75cb] rounded bg-[#1f75cb] text-white disabled:opacity-60"
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
