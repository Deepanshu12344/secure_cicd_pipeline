import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { risksApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  History,
  Info,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
  XCircle
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

const chartGrid = '#ececec'
const axisColor = '#666'
const tooltipStyle = {
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  backgroundColor: '#fff'
}

const severityClass = (severity) => {
  const normalized = String(severity || '').toLowerCase()
  if (normalized === 'critical') return 'bg-[#ffe4e6] text-[#be123c]'
  if (normalized === 'high') return 'bg-[#fff1e6] text-[#c2410c]'
  if (normalized === 'medium') return 'bg-[#fff8dc] text-[#8a6d00]'
  return 'bg-[#e6f6ea] text-[#108548]'
}

const formatDateTime = (value) => {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString()
}

const normalizeThreatType = (value) => {
  const raw = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*&\s*/g, ' & ')
    .trim()
  if (!raw) return 'Other'
  const lower = raw.toLowerCase()
  if (lower === 'complexity and maintainability' || lower === 'complexity & maintainability') {
    return 'Complexity & Maintainability'
  }
  return raw
}

export default function RiskDetail() {
  const { id } = useParams()
  const user = useAuthStore((state) => state.user)
  const canWaive = ['admin', 'lead', 'security_reviewer'].includes(user?.role)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)
  const [viewMode, setViewMode] = useState('table')

  // Search & Filters
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // Selection & Bulk
  const [selectedIds, setSelectedIds] = useState([])
  const [submittingAction, setSubmittingAction] = useState(false)
  const [actionFeedback, setActionFeedback] = useState(null)

  // Modals state
  const [explainingData, setExplainingData] = useState(null)
  const [explainLoading, setExplainLoading] = useState(false)
  const [historyData, setHistoryData] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [waiverTarget, setWaiverTarget] = useState(null)
  const [waiverReason, setWaiverReason] = useState('')
  const [waiverDays, setWaiverDays] = useState(30)

  const loadDetail = async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const response = await risksApi.getProjectDetail(id)
      setDetail(response.data?.data || null)
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load project risks')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    if (id) {
      loadDetail()
    } else {
      setLoading(false)
      setError('Project id is missing')
    }
  }, [id])

  const project = detail?.project || null
  const summary = detail?.summary || { total: 0, critical: 0, high: 0, medium: 0, low: 0 }
  const occurrences = useMemo(() => detail?.occurrences || [], [detail])

  // Triage counters
  const triageStats = useMemo(() => {
    let confirmed = 0
    let falsePositive = 0
    let waived = 0
    let unreviewed = 0
    occurrences.forEach((item) => {
      if (item.waiver?.isWaived) waived++
      else if (item.feedbackStatus === 'false_positive' || item.isSuppressed) falsePositive++
      else if (item.feedbackStatus === 'confirmed') confirmed++
      else unreviewed++
    })
    return { confirmed, falsePositive, waived, unreviewed }
  }, [occurrences])

  // Filtered rows
  const filteredOccurrences = useMemo(() => {
    return occurrences.filter((item) => {
      if (severityFilter !== 'all' && String(item.severity).toLowerCase() !== severityFilter) {
        return false
      }
      if (statusFilter !== 'all') {
        if (statusFilter === 'waived' && !item.waiver?.isWaived) return false
        if (statusFilter === 'false_positive' && (item.waiver?.isWaived || (item.feedbackStatus !== 'false_positive' && !item.isSuppressed))) return false
        if (statusFilter === 'confirmed' && (item.waiver?.isWaived || item.feedbackStatus !== 'confirmed')) return false
        if (statusFilter === 'unreviewed' && (item.waiver?.isWaived || item.feedbackStatus === 'confirmed' || item.feedbackStatus === 'false_positive' || item.isSuppressed)) return false
      }
      if (search.trim()) {
        const query = search.toLowerCase()
        const text = [item.title, item.file, item.description, item.threatType].filter(Boolean).join(' ').toLowerCase()
        if (!text.includes(query)) return false
      }
      return true
    })
  }, [occurrences, severityFilter, statusFilter, search])

  // Single feedback action
  const handleFeedback = async (riskId, label) => {
    try {
      setSubmittingAction(true)
      await risksApi.submitFeedback(riskId, { label })
      setActionFeedback({ type: 'success', message: `Marked finding as ${label.replace('_', ' ')}` })
      await loadDetail(true)
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.response?.data?.error || 'Failed to submit feedback' })
    } finally {
      setSubmittingAction(false)
    }
  }

  // Revert feedback
  const handleRevertFeedback = async (riskId) => {
    try {
      setSubmittingAction(true)
      await risksApi.deleteFeedback(riskId)
      setActionFeedback({ type: 'success', message: 'Reverted review status to unreviewed' })
      await loadDetail(true)
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.response?.data?.error || 'Failed to revert feedback' })
    } finally {
      setSubmittingAction(false)
    }
  }

  // Bulk feedback action
  const handleBulkFeedback = async (label) => {
    if (selectedIds.length === 0) return
    try {
      setSubmittingAction(true)
      const items = selectedIds.map((id) => ({ findingId: id, label }))
      const res = await risksApi.submitBulkFeedback(items)
      const count = res.data?.data?.successful || selectedIds.length
      setActionFeedback({ type: 'success', message: `Successfully updated ${count} finding${count === 1 ? '' : 's'} to ${label.replace('_', ' ')}` })
      setSelectedIds([])
      await loadDetail(true)
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.response?.data?.error || 'Failed to apply bulk feedback' })
    } finally {
      setSubmittingAction(false)
    }
  }

  // Apply waiver
  const handleApplyWaiver = async () => {
    if (!waiverTarget) return
    if (!waiverReason.trim()) {
      setActionFeedback({ type: 'error', message: 'A documented justification reason is required for waivers.' })
      return
    }
    try {
      setSubmittingAction(true)
      const expiresAt = new Date(Date.now() + Number(waiverDays) * 24 * 60 * 60 * 1000).toISOString()
      await risksApi.submitWaiver(waiverTarget.id, { reason: waiverReason.trim(), expiresAt })
      setActionFeedback({ type: 'success', message: `Temporary waiver active for ${waiverDays} days.` })
      setWaiverTarget(null)
      setWaiverReason('')
      await loadDetail(true)
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.response?.data?.error || 'Failed to apply waiver' })
    } finally {
      setSubmittingAction(false)
    }
  }

  // Revoke waiver
  const handleRevokeWaiver = async (riskId) => {
    try {
      setSubmittingAction(true)
      await risksApi.deleteWaiver(riskId)
      setActionFeedback({ type: 'success', message: 'Temporary waiver revoked.' })
      await loadDetail(true)
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.response?.data?.error || 'Failed to revoke waiver' })
    } finally {
      setSubmittingAction(false)
    }
  }

  // Open Explainability modal
  const handleOpenExplain = async (item) => {
    try {
      setExplainLoading(true)
      setExplainingData({ item, loading: true })
      const res = await risksApi.getExplanation(item.id)
      setExplainingData({
        item,
        ...res.data?.data
      })
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.response?.data?.error || 'Failed to load score explanation' })
      setExplainingData(null)
    } finally {
      setExplainLoading(false)
    }
  }

  // Open History modal
  const handleOpenHistory = async (item) => {
    try {
      setHistoryLoading(true)
      setHistoryData({ item, events: [] })
      const res = await risksApi.getHistory(item.id)
      setHistoryData({
        item,
        events: res.data?.data || []
      })
    } catch (err) {
      setActionFeedback({ type: 'error', message: err.response?.data?.error || 'Failed to load audit history' })
      setHistoryData(null)
    } finally {
      setHistoryLoading(false)
    }
  }

  // Select all / deselect
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredOccurrences.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredOccurrences.map((i) => i.id))
    }
  }

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // Analytics tab computations
  const analytics = useMemo(() => {
    const severityMap = { critical: 0, high: 0, medium: 0, low: 0 }
    const sourceMap = {}
    const statusMap = {}
    const threatMap = {}
    const fileMap = {}
    const timelineMap = {}

    occurrences.forEach((item) => {
      const severity = String(item.severity || 'low').toLowerCase()
      severityMap[severity] = (severityMap[severity] || 0) + 1

      const source = String(item.source || 'unknown').toUpperCase()
      sourceMap[source] = (sourceMap[source] || 0) + 1

      const status = String(item.status || 'unknown').toLowerCase()
      statusMap[status] = (statusMap[status] || 0) + 1

      const threat = normalizeThreatType(item.threatType)
      threatMap[threat] = (threatMap[threat] || 0) + 1

      const file = String(item.file || 'Unknown file')
      fileMap[file] = (fileMap[file] || 0) + 1

      const dateKey = item.updatedAt ? new Date(item.updatedAt).toISOString().slice(0, 10) : 'Unknown'
      timelineMap[dateKey] = (timelineMap[dateKey] || 0) + 1
    })

    return {
      severityData: [
        { name: 'Critical', value: severityMap.critical || 0 },
        { name: 'High', value: severityMap.high || 0 },
        { name: 'Medium', value: severityMap.medium || 0 },
        { name: 'Low', value: severityMap.low || 0 }
      ],
      sourceData: Object.entries(sourceMap).map(([name, value]) => ({ name, value })),
      statusData: Object.entries(statusMap).map(([name, value]) => ({ name: name.toUpperCase(), value })),
      threatData: Object.entries(threatMap)
        .map(([name, value]) => ({ name: name.length > 22 ? `${name.slice(0, 22)}...` : name, fullName: name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6),
      fileData: Object.entries(fileMap)
        .map(([name, value]) => ({ name: name.length > 26 ? `${name.slice(0, 26)}...` : name, fullName: name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6),
      timelineData: Object.entries(timelineMap)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    }
  }, [occurrences])

  const severityColors = ['#dc2626', '#d97706', '#ca8a04', '#059669']
  const sourceChartData = analytics.sourceData.length ? analytics.sourceData : [{ name: 'NONE', value: 0 }]
  const fileSeriesData = analytics.fileData.length ? analytics.fileData : [{ name: 'None', fullName: 'None', value: 0 }]
  const timelineSeriesData = analytics.timelineData.length ? analytics.timelineData : [{ date: 'N/A', count: 0 }]
  const severityTotal = analytics.severityData.reduce((sum, item) => sum + Number(item.value || 0), 0)

  if (loading) {
    return <div className="bg-white min-h-[calc(100vh-48px)] p-6 text-[#666]">Loading project risks...</div>
  }

  return (
    <div className="bg-[#fbfbfb] min-h-[calc(100vh-48px)]">
      {/* Top Breadcrumb */}
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-[#6e49cb]">
          <Link to="/" className="hover:underline">Your work</Link>
          <span className="text-gray-400">/</span>
          <Link to="/risks" className="hover:underline">Risks</Link>
          <span className="text-gray-400">/</span>
          <span className="text-[#303030] font-medium">{project?.fullName || project?.name || 'Triage'}</span>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto p-6">
        {/* Alerts / Feedback Toast */}
        {actionFeedback ? (
          <div
            className={`mb-4 px-4 py-3 rounded text-sm flex items-center justify-between border ${
              actionFeedback.type === 'error'
                ? 'bg-[#fff1f2] border-[#fecdd3] text-[#be123c]'
                : 'bg-[#f0fdf4] border-[#bbf7d0] text-[#15803d]'
            }`}
          >
            <span>{actionFeedback.message}</span>
            <button onClick={() => setActionFeedback(null)} className="p-1 hover:opacity-75">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 px-4 py-3 text-sm bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] rounded">
            {error}
          </div>
        ) : null}

        {!project ? (
          <div className="border border-gray-200 rounded p-6 text-sm text-[#666] bg-white">Project risks not found.</div>
        ) : (
          <>
            {/* Project Header & KPI summary */}
            <div className="bg-white border border-gray-200 rounded p-6 mb-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                  <h1 className="text-2xl font-normal text-[#303030]">{project.fullName || project.name}</h1>
                  <div className="text-xs text-[#999] mt-1">Project ID: {project.id}</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViewMode(viewMode === 'table' ? 'analytics' : 'table')}
                    className="px-3 py-1.5 text-xs border border-[#d4d4d4] rounded bg-white hover:bg-gray-50 text-[#303030]"
                  >
                    {viewMode === 'table' ? 'View Analytics' : 'Back to Triage Table'}
                  </button>
                </div>
              </div>

              {/* Triage Status Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-gray-100 text-sm">
                <div className="p-3 bg-gray-50 border border-gray-200 rounded">
                  <div className="text-xs text-[#666]">Total Findings</div>
                  <div className="text-xl font-semibold text-[#303030] mt-0.5">{summary.total}</div>
                </div>
                <div className="p-3 bg-[#fef2f2] border border-[#fecaca] rounded">
                  <div className="text-xs text-[#be123c]">Confirmed Real</div>
                  <div className="text-xl font-semibold text-[#be123c] mt-0.5">{triageStats.confirmed}</div>
                </div>
                <div className="p-3 bg-[#fffbeb] border border-[#fde68a] rounded">
                  <div className="text-xs text-[#b45309]">False Positives</div>
                  <div className="text-xl font-semibold text-[#b45309] mt-0.5">{triageStats.falsePositive}</div>
                </div>
                <div className="p-3 bg-[#f5f3ff] border border-[#ddd6fe] rounded">
                  <div className="text-xs text-[#6d28d9]">Temporary Waivers</div>
                  <div className="text-xl font-semibold text-[#6d28d9] mt-0.5">{triageStats.waived}</div>
                </div>
              </div>
            </div>

            {/* View Mode: Analytics */}
            {viewMode === 'analytics' ? (
              <div className="bg-white border border-gray-200 rounded p-6 mb-6">
                <h2 className="text-base font-medium text-[#303030] mb-4">Risk Analytics & Breakdown</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="border border-gray-200 rounded p-4">
                    <div className="text-xs text-[#666] mb-2 font-medium">Severity Distribution</div>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={analytics.severityData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={75}
                          >
                            {analytics.severityData.map((entry, idx) => (
                              <Cell key={`${entry.name}-${idx}`} fill={severityColors[idx % severityColors.length]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded p-4">
                    <div className="text-xs text-[#666] mb-2 font-medium">Top Vulnerable Files</div>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={fileSeriesData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                          <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 10 }} />
                          <YAxis tick={{ fill: axisColor, fontSize: 11 }} allowDecimals={false} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Line type="monotone" dataKey="value" stroke="#7c3aed" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* View Mode: Table & Triage */}
            {viewMode === 'table' ? (
              <div className="bg-white border border-gray-200 rounded overflow-hidden">
                {/* Search & Filter Toolbar */}
                <div className="p-4 border-b border-gray-200 bg-white flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <input
                      type="text"
                      placeholder="Search finding, file, snippet, rule..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-[#1f75cb]"
                    />
                    <span className="absolute left-3 top-2 text-gray-400">🔍</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 text-xs text-[#666]">
                      <span>Severity:</span>
                      <select
                        value={severityFilter}
                        onChange={(e) => setSeverityFilter(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-xs bg-white text-[#303030]"
                      >
                        <option value="all">All</option>
                        <option value="critical">Critical</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-[#666]">
                      <span>Review Status:</span>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-xs bg-white text-[#303030]"
                      >
                        <option value="all">All</option>
                        <option value="unreviewed">Unreviewed</option>
                        <option value="false_positive">False Positive</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="waived">Waived</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Bulk Actions Banner */}
                {selectedIds.length > 0 ? (
                  <div className="bg-[#eff6ff] border-b border-[#bfdbfe] px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-[#1e40af] font-medium">
                      <span>{selectedIds.length} finding{selectedIds.length === 1 ? '' : 's'} selected</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleBulkFeedback('false_positive')}
                        disabled={submittingAction}
                        className="px-2.5 py-1 bg-[#d97706] hover:bg-[#b45309] text-white rounded font-medium disabled:opacity-50"
                      >
                        Mark False Positive
                      </button>
                      <button
                        onClick={() => handleBulkFeedback('confirmed')}
                        disabled={submittingAction}
                        className="px-2.5 py-1 bg-[#dc2626] hover:bg-[#b91c1c] text-white rounded font-medium disabled:opacity-50"
                      >
                        Confirm Real
                      </button>
                      <button
                        onClick={() => setSelectedIds([])}
                        className="px-2.5 py-1 bg-white border border-gray-300 hover:bg-gray-50 text-[#303030] rounded"
                      >
                        Clear Selection
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Findings Table */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px]">
                    <thead className="bg-[#f8f8f8] border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left w-10">
                          <input
                            type="checkbox"
                            checked={filteredOccurrences.length > 0 && selectedIds.length === filteredOccurrences.length}
                            onChange={toggleSelectAll}
                            className="rounded border-gray-300"
                          />
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#303030]">Finding & Location</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#303030]">Severity</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#303030]">Threat Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#303030]">ML Probability</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-[#303030]">Triage Status</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-[#303030]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredOccurrences.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-8 text-center text-sm text-[#666]">
                            No findings match the selected filters.
                          </td>
                        </tr>
                      ) : (
                        filteredOccurrences.map((item) => {
                          const isSelected = selectedIds.includes(item.id)
                          const isWaived = Boolean(item.waiver?.isWaived)
                          const isFp = item.feedbackStatus === 'false_positive' || item.isSuppressed
                          const isConfirmed = item.feedbackStatus === 'confirmed'
                          const isCritical = String(item.severity).toLowerCase() === 'critical'
                          const probVal = item.modelPrediction !== null && item.modelPrediction !== undefined
                            ? Number(item.modelPrediction)
                            : (isCritical ? 0.95 : 0.50)

                          return (
                            <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-[#f0f9ff]' : ''}`}>
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectOne(item.id)}
                                  className="rounded border-gray-300"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="text-sm font-medium text-[#303030]">{item.title}</div>
                                <div className="text-xs text-[#666] mt-0.5 font-mono">
                                  {item.file ? `${item.file}:${item.line || 1}` : 'No location'}
                                </div>
                                {item.description ? (
                                  <div className="text-xs text-gray-500 mt-1 line-clamp-1 italic">
                                    {item.description}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${severityClass(item.severity)}`}>
                                  {String(item.severity).toUpperCase()}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-[#666]">
                                {normalizeThreatType(item.threatType)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className={`h-1.5 rounded-full ${
                                        probVal < 0.25 ? 'bg-green-500' : probVal > 0.70 ? 'bg-red-500' : 'bg-amber-500'
                                      }`}
                                      style={{ width: `${Math.round(probVal * 100)}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-xs font-mono text-[#303030]">
                                    {Math.round(probVal * 100)}%
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {isWaived ? (
                                  <span
                                    title={`Waived by ${item.waiver?.waivedBy || 'reviewer'}: ${item.waiver?.reason || 'No reason'}`}
                                    className="px-2 py-0.5 rounded text-xs font-medium bg-[#ede9fe] text-[#6d28d9] inline-flex items-center gap-1"
                                  >
                                    <Clock className="w-3 h-3" /> Waived
                                  </span>
                                ) : isFp ? (
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#fef3c7] text-[#b45309] inline-flex items-center gap-1">
                                    <Check className="w-3 h-3" /> False Positive
                                  </span>
                                ) : isConfirmed ? (
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#ffe4e6] text-[#be123c] inline-flex items-center gap-1">
                                    <ShieldAlert className="w-3 h-3" /> Confirmed
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                                    Unreviewed
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* Triage feedback buttons */}
                                  {!isFp && !isWaived ? (
                                    <button
                                      onClick={() => handleFeedback(item.id, 'false_positive')}
                                      disabled={submittingAction}
                                      className="px-2 py-1 text-xs border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded font-medium"
                                      title="Mark finding as false positive"
                                    >
                                      FP
                                    </button>
                                  ) : null}

                                  {!isConfirmed && !isWaived ? (
                                    <button
                                      onClick={() => handleFeedback(item.id, 'confirmed')}
                                      disabled={submittingAction}
                                      className="px-2 py-1 text-xs border border-red-300 bg-red-50 hover:bg-red-100 text-red-800 rounded font-medium"
                                      title="Confirm vulnerability is real"
                                    >
                                      Confirm
                                    </button>
                                  ) : null}

                                  {(isFp || isConfirmed) && !isWaived ? (
                                    <button
                                      onClick={() => handleRevertFeedback(item.id)}
                                      disabled={submittingAction}
                                      className="px-2 py-1 text-xs border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 rounded"
                                      title="Revert back to unreviewed"
                                    >
                                      Revert
                                    </button>
                                  ) : null}

                                  {/* Temporary Waiver button for authorized roles */}
                                  {canWaive ? (
                                    isWaived ? (
                                      <button
                                        onClick={() => handleRevokeWaiver(item.id)}
                                        disabled={submittingAction}
                                        className="px-2 py-1 text-xs border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded"
                                        title="Revoke temporary waiver"
                                      >
                                        Revoke
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setWaiverTarget(item)
                                          setWaiverReason('')
                                          setWaiverDays(30)
                                        }}
                                        disabled={submittingAction}
                                        className="px-2 py-1 text-xs border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded"
                                        title="Grant temporary reviewed waiver"
                                      >
                                        Waive
                                      </button>
                                    )
                                  ) : null}

                                  {/* Explainability button */}
                                  <button
                                    onClick={() => handleOpenExplain(item)}
                                    className="p-1 text-xs border border-gray-300 bg-white hover:bg-gray-50 text-[#1f75cb] rounded flex items-center gap-1"
                                    title="Explain ML score and feature attributions"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" />
                                  </button>

                                  {/* History button */}
                                  <button
                                    onClick={() => handleOpenHistory(item)}
                                    className="p-1 text-xs border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 rounded"
                                    title="View review audit history"
                                  >
                                    <History className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* MODAL 1: EXPLAINABLE SCORE MODAL */}
      {explainingData ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#1f75cb]" />
                <h3 className="text-base font-medium text-[#303030]">Explainable Finding Score</h3>
              </div>
              <button onClick={() => setExplainingData(null)} className="p-1 hover:bg-gray-100 rounded text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <div className="text-sm font-semibold text-[#303030]">{explainingData.item?.title}</div>
                <div className="text-xs text-gray-500 font-mono mt-0.5">
                  {explainingData.item?.file}:{explainingData.item?.line || 1}
                </div>
              </div>

              {explainLoading ? (
                <div className="py-8 text-center text-sm text-gray-500">Computing feature contributions...</div>
              ) : (
                <>
                  {/* Probability & Verdict Meter */}
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-600 font-medium">True-Positive Probability P(TP):</span>
                      <span className="font-mono font-bold text-sm text-[#303030]">
                        {Math.round(Number(explainingData.explanation?.probability ?? 0.5) * 100)}%
                      </span>
                    </div>

                    <div className="w-full bg-gray-200 rounded-full h-3 mb-2 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all duration-300 ${
                          (explainingData.explanation?.probability ?? 0.5) < 0.25
                            ? 'bg-green-500'
                            : (explainingData.explanation?.probability ?? 0.5) > 0.70
                            ? 'bg-red-500'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.round(Number(explainingData.explanation?.probability ?? 0.5) * 100)}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-green-700">0% (False Positive)</span>
                      <span className="text-amber-700">25% (Suppression Threshold)</span>
                      <span className="text-red-700">100% (Confirmed Real)</span>
                    </div>
                  </div>

                  {/* Safety Floor Notice */}
                  {explainingData.explanation?.clamped_by_floor || explainingData.explanation?.is_clamped ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded flex items-start gap-2 text-xs text-red-800">
                      <ShieldCheck className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Critical Safety Floor Clamped:</span> This finding has critical severity. Model probability is strictly clamped to &ge; 0.85 to ensure critical vulnerabilities can never be auto-suppressed.
                      </div>
                    </div>
                  ) : null}

                  {/* Natural Language Summary */}
                  {explainingData.explanation?.summary ? (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-900">
                      <span className="font-semibold">Explanation: </span>
                      {explainingData.explanation.summary}
                    </div>
                  ) : null}

                  {/* Feature Contributions */}
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-[#303030]">Top Contributing Factors</div>

                    {/* Positive Influences */}
                    <div>
                      <div className="text-[11px] font-medium text-red-700 mb-1">Pushing Towards True Positive (Real Vulnerability):</div>
                      <div className="space-y-1">
                        {(explainingData.explanation?.top_positive_factors || explainingData.explanation?.top_positive_features || []).map((feat, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs bg-red-50/50 p-1.5 rounded border border-red-100">
                            <span className="text-gray-700 font-mono text-[11px]">{feat.feature || feat[0] || feat.description}</span>
                            <span className="text-red-600 font-mono font-medium">+{Math.abs(Number(feat.impact || feat[1] || feat.weight || 0)).toFixed(2)}</span>
                          </div>
                        ))}
                        {!(explainingData.explanation?.top_positive_factors || explainingData.explanation?.top_positive_features)?.length && (
                          <div className="text-xs text-gray-400 italic">None</div>
                        )}
                      </div>
                    </div>

                    {/* Negative Influences */}
                    <div>
                      <div className="text-[11px] font-medium text-green-700 mb-1">Pushing Towards False Positive (Suppressed):</div>
                      <div className="space-y-1">
                        {(explainingData.explanation?.top_negative_factors || explainingData.explanation?.top_negative_features || []).map((feat, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs bg-green-50/50 p-1.5 rounded border border-green-100">
                            <span className="text-gray-700 font-mono text-[11px]">{feat.feature || feat[0] || feat.description}</span>
                            <span className="text-green-600 font-mono font-medium">-{Math.abs(Number(feat.impact || feat[1] || feat.weight || 0)).toFixed(2)}</span>
                          </div>
                        ))}
                        {!(explainingData.explanation?.top_negative_factors || explainingData.explanation?.top_negative_features)?.length && (
                          <div className="text-xs text-gray-400 italic">None</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
                    Model Version: {explainingData.modelVersion || 'v1'} • Honest Bootstrap Governance
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                onClick={() => setExplainingData(null)}
                className="px-4 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-100 text-[#303030]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL 2: TEMPORARY WAIVER MODAL */}
      {waiverTarget ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-medium text-[#303030]">Grant Temporary Reviewed Waiver</h3>
              </div>
              <button onClick={() => setWaiverTarget(null)} className="p-1 hover:bg-gray-100 rounded text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded text-xs text-purple-900 leading-relaxed">
                <span className="font-bold">Reviewed Waiver Policy:</span> Critical findings cannot be auto-suppressed by ML, but may be granted a temporary reviewed waiver by authorized reviewers (Admin, Lead, Security Reviewer). All waivers require documented justification, auto-expire within &le; 90 days, and are audit-logged.
              </div>

              <div>
                <div className="text-sm font-semibold text-[#303030]">{waiverTarget.title}</div>
                <div className="text-xs text-gray-500 font-mono mt-0.5">{waiverTarget.file || 'General Project Finding'}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#303030] mb-1">
                  Justification / Rationale <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={waiverReason}
                  onChange={(e) => setWaiverReason(e.target.value)}
                  placeholder="e.g. Compensating control in place via WAF rule #482; scheduled for refactor in sprint 44."
                  className="w-full border border-gray-300 rounded p-2 text-xs text-[#303030] focus:outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#303030] mb-1">Waiver Duration</label>
                <select
                  value={waiverDays}
                  onChange={(e) => setWaiverDays(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded p-2 text-xs bg-white text-[#303030]"
                >
                  <option value={7}>7 Days (1 week)</option>
                  <option value={14}>14 Days (2 weeks)</option>
                  <option value={30}>30 Days (1 month)</option>
                  <option value={60}>60 Days (2 months)</option>
                  <option value={90}>90 Days (Maximum permitted)</option>
                </select>
              </div>
            </div>

            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setWaiverTarget(null)}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-100 text-[#303030]"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyWaiver}
                disabled={submittingAction || !waiverReason.trim()}
                className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded font-medium disabled:opacity-50"
              >
                {submittingAction ? 'Applying...' : 'Grant Waiver'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL 3: AUDIT HISTORY MODAL */}
      {historyData ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-gray-700" />
                <h3 className="text-base font-medium text-[#303030]">Review Audit History</h3>
              </div>
              <button onClick={() => setHistoryData(null)} className="p-1 hover:bg-gray-100 rounded text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 max-h-[75vh] overflow-y-auto">
              <div className="mb-4">
                <div className="text-sm font-semibold text-[#303030]">{historyData.item?.title}</div>
                <div className="text-xs text-gray-500 font-mono mt-0.5">{historyData.item?.file || '-'}</div>
              </div>

              {historyLoading ? (
                <div className="py-6 text-center text-sm text-gray-500">Loading audit history...</div>
              ) : historyData.events.length === 0 ? (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded text-center text-xs text-gray-500">
                  No review feedback has been submitted for this finding yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {historyData.events.map((evt, idx) => (
                    <div key={idx} className="p-3 border border-gray-200 rounded text-xs bg-white">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[#303030]">
                          {evt.user?.username || evt.user?.email || evt.userId || 'Reviewer'}
                          {evt.user?.role ? <span className="ml-1 text-[11px] text-gray-500">({evt.user.role})</span> : null}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          evt.label === 'false_positive' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {evt.label}
                        </span>
                      </div>
                      <div className="text-gray-500 text-[11px]">{formatDateTime(evt.createdAt)}</div>
                      {evt.notes ? <div className="mt-1 text-gray-700 italic">"{evt.notes}"</div> : null}
                      <div className="mt-1 text-[10px] text-gray-400">
                        State: {evt.status || 'active'} • Fingerprint: {evt.fingerprint?.slice(0, 12)}...
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                onClick={() => setHistoryData(null)}
                className="px-4 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-100 text-[#303030]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
