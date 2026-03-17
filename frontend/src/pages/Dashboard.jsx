import { useEffect, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { ciApi } from '../services/api'

export default function Dashboard() {
  const [metrics, setMetrics] = useState({
    totalProjects: 0,
    activeScans: 0,
    criticalRisks: 0,
    successRate: 100
  })
  const [riskTrendData, setRiskTrendData] = useState([])
  const [vulnTypeData, setVulnTypeData] = useState([])
  const [projects, setProjects] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true
    ciApi
      .getSummary()
      .then((response) => {
        if (!mounted) return
        const data = response.data?.data || {}
        setMetrics(data.metrics || metrics)
        setRiskTrendData(Array.isArray(data.riskTrend) ? data.riskTrend : [])
        setVulnTypeData(Array.isArray(data.vulnTypes) ? data.vulnTypes : [])
      })
      .catch(() => {
        if (mounted) setError('Failed to load dashboard metrics')
      })

    ciApi
      .getProjects()
      .then((response) => {
        if (mounted) setProjects(Array.isArray(response.data?.data) ? response.data.data : [])
      })
      .catch(() => {
        if (mounted) setError('Failed to load project list')
      })

    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="space-y-6">
      {error ? <div className="card p-4 text-red-400">{error}</div> : null}
      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Projects', value: metrics.totalProjects, color: 'blue' },
          { label: 'Active Scans', value: metrics.activeScans, color: 'cyan' },
          { label: 'Critical Risks', value: metrics.criticalRisks, color: 'red' },
          { label: 'Success Rate', value: `${metrics.successRate}%`, color: 'green' },
        ].map((metric, i) => (
          <div key={i} className="card p-6">
            <p className="text-slate-400 text-sm mb-2">{metric.label}</p>
            <p className={`text-3xl font-bold text-${metric.color}-400`}>{metric.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4 text-white">Risk Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={riskTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="week" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
              <Legend />
              <Line type="monotone" dataKey="critical" stroke="#ef4444" strokeWidth={2} />
              <Line type="monotone" dataKey="high" stroke="#f97316" strokeWidth={2} />
              <Line type="monotone" dataKey="medium" stroke="#eab308" strokeWidth={2} />
              <Line type="monotone" dataKey="low" stroke="#22c55e" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4 text-white">Vulnerability Types</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={vulnTypeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="type" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569' }} />
              <Bar dataKey="count" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4 text-white">Recent Activity</h3>
        <div className="space-y-3">
          {projects.length === 0 ? (
            <p className="text-sm text-slate-400">No scans ingested yet.</p>
          ) : (
            projects.slice(0, 5).map((project) => (
              <div key={project.repository} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                <div>
                  <p className="text-white font-medium">Scan completed</p>
                  <p className="text-sm text-slate-400">{project.repository}</p>
                </div>
                <span className={`badge badge-${project.riskScore >= 80 ? 'high' : project.riskScore >= 50 ? 'medium' : 'low'}`}>
                  Risk {project.riskScore}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Projects */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4 text-white">Projects</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-slate-300">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="py-2">Repository</th>
                <th className="py-2">Risk Score</th>
                <th className="py-2">Critical</th>
                <th className="py-2">Last Scan</th>
                <th className="py-2">Total Scans</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.repository} className="border-b border-slate-800/60">
                  <td className="py-2">{project.repository}</td>
                  <td className="py-2">{project.riskScore}</td>
                  <td className="py-2">{project.critical}</td>
                  <td className="py-2">{project.lastScanAt ? new Date(project.lastScanAt).toLocaleString() : '-'}</td>
                  <td className="py-2">{project.totalScans}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
