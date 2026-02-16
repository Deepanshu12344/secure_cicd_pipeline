import { useState } from 'react'

export default function Risks() {
  const [risks] = useState([
    { id: 1, title: 'SQL Injection in Login', severity: 'critical', project: 'Backend API', file: 'auth.js', line: 45 },
    { id: 2, title: 'XSS Vulnerability', severity: 'high', project: 'Frontend App', file: 'input.jsx', line: 102 },
    { id: 3, title: 'Outdated Dependencies', severity: 'high', project: 'Mobile App', file: 'package.json', line: 1 },
    { id: 4, title: 'Missing CORS Headers', severity: 'medium', project: 'Backend API', file: 'config.js', line: 23 },
  ])

  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'critical': return 'badge-critical'
      case 'high': return 'badge-high'
      case 'medium': return 'badge-medium'
      default: return 'badge-low'
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">Identified Risks</h1>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-700/50 border-b border-slate-700">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Risk Title</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Severity</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Project</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Location</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {risks.map(risk => (
              <tr key={risk.id} className="hover:bg-slate-700/30 transition-colors">
                <td className="px-6 py-4 text-white">{risk.title}</td>
                <td className="px-6 py-4">
                  <span className={`badge ${getSeverityColor(risk.severity)}`}>
                    {risk.severity.charAt(0).toUpperCase() + risk.severity.slice(1)}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-400">{risk.project}</td>
                <td className="px-6 py-4 text-slate-400 text-sm">{risk.file}:{risk.line}</td>
                <td className="px-6 py-4">
                  <button className="text-blue-400 hover:text-blue-300 text-sm font-medium">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
