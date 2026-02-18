import { useState } from 'react'

export default function Risks() {
  const [risks] = useState([
    { id: 1, title: 'SQL Injection in Login', severity: 'Critical', project: 'Backend API', file: 'auth.js', line: 45 },
    { id: 2, title: 'XSS Vulnerability', severity: 'High', project: 'Frontend App', file: 'input.jsx', line: 102 },
    { id: 3, title: 'Outdated Dependencies', severity: 'High', project: 'Mobile App', file: 'package.json', line: 1 },
    { id: 4, title: 'Missing CORS Headers', severity: 'Medium', project: 'Backend API', file: 'config.js', line: 23 }
  ])

  const severityClass = (severity) => {
    if (severity === 'Critical') return 'bg-[#ffe4e6] text-[#be123c]'
    if (severity === 'High') return 'bg-[#fff1e6] text-[#c2410c]'
    if (severity === 'Medium') return 'bg-[#fff8dc] text-[#8a6d00]'
    return 'bg-[#e6f6ea] text-[#108548]'
  }

  return (
    <div className="bg-white min-h-[calc(100vh-48px)] p-6">
      <h1 className="text-2xl font-normal text-[#303030] mb-6">Identified Risks</h1>

      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f8f8f8] border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Risk Title</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Severity</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Project</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Location</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {risks.map((risk) => (
              <tr key={risk.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 text-[#303030]">{risk.title}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${severityClass(risk.severity)}`}>
                    {risk.severity}
                  </span>
                </td>
                <td className="px-6 py-4 text-[#666]">{risk.project}</td>
                <td className="px-6 py-4 text-[#666] text-sm">{risk.file}:{risk.line}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
