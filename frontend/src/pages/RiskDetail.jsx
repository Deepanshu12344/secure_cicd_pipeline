import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { risksApi } from '../services/api'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)
  const [viewMode, setViewMode] = useState('table')

  useEffect(() => {
    let mounted = true

    const loadDetail = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await risksApi.getProjectDetail(id)
        if (mounted) {
          setDetail(response.data?.data || null)
        }
      } catch (err) {
        if (mounted) {
          setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load project risks')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    if (id) {
      loadDetail()
    } else {
      setLoading(false)
      setError('Project id is missing')
    }

    return () => {
      mounted = false
    }
  }, [id])

  const project = detail?.project || null
  const summary = detail?.summary || { total: 0, critical: 0, high: 0, medium: 0, low: 0 }
  const occurrences = useMemo(() => detail?.occurrences || [], [detail])

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
  const sourceColors = ['#1f75cb', '#64748b', '#0f766e', '#0284c7', '#334155']
  const sourceChartData = analytics.sourceData.length ? analytics.sourceData : [{ name: 'NONE', value: 0 }]
  const statusRadarData = analytics.statusData.length ? analytics.statusData : [{ name: 'NONE', value: 0 }]
  const threatSeriesData = analytics.threatData.length ? analytics.threatData : [{ name: 'None', fullName: 'None', value: 0 }]
  const fileSeriesData = analytics.fileData.length ? analytics.fileData : [{ name: 'None', fullName: 'None', value: 0 }]
  const timelineSeriesData = analytics.timelineData.length ? analytics.timelineData : [{ date: 'N/A', count: 0 }]
  const severityTotal = analytics.severityData.reduce((sum, item) => sum + Number(item.value || 0), 0)
  const statusTotal = statusRadarData.reduce((sum, item) => sum + Number(item.value || 0), 0)

  if (loading) {
    return <div className="bg-white min-h-[calc(100vh-48px)] p-6 text-[#666]">Loading project risks...</div>
  }

  return (
    <div className="bg-white min-h-[calc(100vh-48px)]">
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-[#6e49cb]">
          <Link to="/" className="hover:underline">Your work</Link>
          <span className="text-gray-400">/</span>
          <Link to="/risks" className="hover:underline">Risks</Link>
          <span className="text-gray-400">/</span>
          <span className="text-[#303030]">Full View</span>
        </div>
      </div>

      <div className="p-6">
        {error ? <div className="mb-4 px-4 py-3 text-sm bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] rounded">{error}</div> : null}

        {!project ? (
          <div className="border border-gray-200 rounded p-4 text-sm text-[#666] bg-white">Project risks not found.</div>
        ) : (
          <>
            <div className="border border-gray-200 rounded p-4 bg-white mb-4">
              <h1 className="text-2xl font-normal text-[#303030]">{project.fullName || project.name || 'Project risks'}</h1>
              <div className="text-sm text-[#666] mt-2">Project ID: <span className="text-[#999]">{project.id || '-'}</span></div>
              <div className="text-sm text-[#666] mt-3">
                Total: {Number(summary.total || 0)} | Critical: {Number(summary.critical || 0)} | High: {Number(summary.high || 0)} | Medium: {Number(summary.medium || 0)} | Low: {Number(summary.low || 0)}
              </div>
            </div>

            <div className="border border-gray-200 rounded overflow-hidden bg-white">
              <div className="px-4 py-3 border-b border-gray-200 text-sm text-[#303030] flex items-center justify-between gap-3">
                <span>Risk list for this project</span>
                <button
                  onClick={() => setViewMode((prev) => (prev === 'table' ? 'analytics' : 'table'))}
                  className="inline-flex px-3 py-1.5 text-xs border border-[#d4d4d4] rounded bg-white hover:bg-[#f8f8f8] text-[#303030]"
                >
                  {viewMode === 'table' ? 'Analytics' : 'Tabular View'}
                </button>
              </div>

              {viewMode === 'analytics' ? (
                <div className="p-4 border-b border-gray-200 bg-[#fcfcfc]">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-gray-200 rounded p-3 bg-white">
                      <div className="text-xs text-[#666] mb-2">Severity Mix (Donut)</div>
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
                              outerRadius={78}
                            >
                              {analytics.severityData.map((entry, idx) => (
                                <Cell key={`${entry.name}-${idx}`} fill={severityColors[idx % severityColors.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[#666]">
                        {analytics.severityData.map((item, idx) => {
                          const pct = severityTotal > 0 ? ((Number(item.value || 0) * 100) / severityTotal).toFixed(0) : '0'
                          return (
                            <div key={`sev-legend-${item.name}`} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: severityColors[idx % severityColors.length] }}
                                ></span>
                                <span>{item.name}</span>
                              </div>
                              <span>{item.value} ({pct}%)</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3 bg-white">
                      <div className="text-xs text-[#666] mb-2">Source Mix (Donut)</div>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={sourceChartData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={78}
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              labelLine={false}
                            >
                              {sourceChartData.map((entry, idx) => (
                                <Cell key={`${entry.name}-${idx}`} fill={sourceColors[idx % sourceColors.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3 bg-white">
                      <div className="text-xs text-[#666] mb-2">Status Profile (Donut)</div>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={statusRadarData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={78}
                            >
                              {statusRadarData.map((entry, idx) => (
                                <Cell key={`status-${entry.name}-${idx}`} fill={sourceColors[idx % sourceColors.length]} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[#666]">
                        {statusRadarData.map((item, idx) => {
                          const pct = statusTotal > 0 ? ((Number(item.value || 0) * 100) / statusTotal).toFixed(0) : '0'
                          return (
                            <div key={`status-legend-${item.name}`} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: sourceColors[idx % sourceColors.length] }}
                                ></span>
                                <span>{item.name}</span>
                              </div>
                              <span>{item.value} ({pct}%)</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3 bg-white">
                      <div className="text-xs text-[#666] mb-2">Top Threat Types (Area)</div>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={threatSeriesData}>
                            <defs>
                              <linearGradient id="threatArea" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#0f766e" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#0f766e" stopOpacity={0.05} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                            <XAxis
                              dataKey="name"
                              tick={{ fill: axisColor, fontSize: 10 }}
                              tickLine={false}
                              axisLine={false}
                              interval={0}
                              angle={-22}
                              textAnchor="end"
                              height={52}
                            />
                            <YAxis tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip
                              contentStyle={tooltipStyle}
                              formatter={(value, _name, item) => [value, item?.payload?.fullName || 'Threat']}
                            />
                            <Area type="monotone" dataKey="value" stroke="#0f766e" fill="url(#threatArea)" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3 bg-white">
                      <div className="text-xs text-[#666] mb-2">Top Files With Risks (Line)</div>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={fileSeriesData}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                            <XAxis
                              dataKey="name"
                              tick={{ fill: axisColor, fontSize: 10 }}
                              tickLine={false}
                              axisLine={false}
                              interval={0}
                              angle={-22}
                              textAnchor="end"
                              height={52}
                            />
                            <YAxis tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip
                              contentStyle={tooltipStyle}
                              formatter={(value, _name, item) => [value, item?.payload?.fullName || 'File']}
                            />
                            <Line type="monotone" dataKey="value" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded p-3 bg-white">
                      <div className="text-xs text-[#666] mb-2">Risk Discovery Trend (Area)</div>
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={timelineSeriesData}>
                            <defs>
                              <linearGradient id="timelineArea" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#1f75cb" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#1f75cb" stopOpacity={0.05} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                            <XAxis
                              dataKey="date"
                              tick={{ fill: axisColor, fontSize: 10 }}
                              tickLine={false}
                              axisLine={false}
                              interval="preserveStartEnd"
                            />
                            <YAxis tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Area type="monotone" dataKey="count" stroke="#1f75cb" fill="url(#timelineArea)" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {viewMode === 'table' ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1080px]">
                    <thead className="bg-[#f8f8f8] border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Risk</th>
                        <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Severity</th>
                        <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Source</th>
                        <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Location</th>
                        <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Threat Type</th>
                        <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Status</th>
                        <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {occurrences.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-8 text-center text-sm text-[#666]">No risks available.</td>
                        </tr>
                      ) : (
                        occurrences.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-sm text-[#303030]">{item.title || '-'}</td>
                            <td className="px-6 py-4 text-sm">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${severityClass(item.severity)}`}>
                                {String(item.severity || 'unknown')}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-[#666]">{item.source ? String(item.source).toUpperCase() : '-'}</td>
                            <td className="px-6 py-4 text-sm text-[#666]">{item.file ? `${item.file}:${item.line || '-'}` : '-'}</td>
                            <td className="px-6 py-4 text-sm text-[#666]">{normalizeThreatType(item.threatType)}</td>
                            <td className="px-6 py-4 text-sm text-[#666]">{item.status || '-'}</td>
                            <td className="px-6 py-4 text-sm text-[#666]">{formatDateTime(item.updatedAt)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
