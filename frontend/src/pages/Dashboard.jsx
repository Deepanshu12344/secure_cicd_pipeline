import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export default function Dashboard() {
  const riskTrendData = [
    { week: 'Week 1', critical: 2, high: 8, medium: 40, low: 85 },
    { week: 'Week 2', critical: 3, high: 10, medium: 45, low: 88 },
    { week: 'Week 3', critical: 2, high: 9, medium: 48, low: 92 },
    { week: 'Week 4', critical: 1, high: 12, medium: 50, low: 95 },
    { week: 'Week 5', critical: 3, high: 15, medium: 42, low: 89 },
  ]

  const vulnTypeData = [
    { type: 'SQL Injection', count: 15 },
    { type: 'XSS', count: 28 },
    { type: 'Insecure Deps', count: 42 },
    { type: 'Auth Bypass', count: 8 },
    { type: 'Data Exposure', count: 12 },
  ]

  return (
    <div className="space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Projects', value: '24', color: 'blue' },
          { label: 'Active Scans', value: '5', color: 'cyan' },
          { label: 'Critical Risks', value: '3', color: 'red' },
          { label: 'Success Rate', value: '94.5%', color: 'green' },
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
          {[
            { action: 'Scan completed', project: 'Backend API', status: 'success', time: '2 hours ago' },
            { action: 'Risk identified', project: 'Frontend App', status: 'warning', time: '4 hours ago' },
            { action: 'Pipeline blocked', project: 'Mobile App', status: 'error', time: '1 day ago' },
          ].map((activity, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
              <div>
                <p className="text-white font-medium">{activity.action}</p>
                <p className="text-sm text-slate-400">{activity.project}</p>
              </div>
              <span className={`badge badge-${activity.status === 'success' ? 'low' : activity.status === 'warning' ? 'medium' : 'high'}`}>
                {activity.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
