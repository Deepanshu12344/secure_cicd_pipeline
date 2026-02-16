export default function Scans() {
  const [scans] = useState([
    { id: 1, project: 'Backend API', type: 'Full', status: 'Completed', progress: 100, findings: 18 },
    { id: 2, project: 'Frontend App', type: 'Quick', status: 'Running', progress: 45, findings: 0 },
    { id: 3, project: 'Mobile App', type: 'Full', status: 'Queued', progress: 0, findings: 0 },
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">Scans</h1>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-700/50 border-b border-slate-700">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Project</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Type</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Status</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Progress</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-slate-300">Findings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {scans.map(scan => (
              <tr key={scan.id} className="hover:bg-slate-700/30 transition-colors">
                <td className="px-6 py-4 text-white">{scan.project}</td>
                <td className="px-6 py-4 text-slate-400">{scan.type}</td>
                <td className="px-6 py-4">
                  <span className={`badge ${scan.status === 'Completed' ? 'badge-low' : scan.status === 'Running' ? 'badge-medium' : 'badge-high'}`}>
                    {scan.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-slate-700 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full transition-all" 
                        style={{ width: `${scan.progress}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-slate-400">{scan.progress}%</span>
                  </div>
                </td>
                <td className="px-6 py-4 font-semibold text-white">{scan.findings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import { useState } from 'react'
