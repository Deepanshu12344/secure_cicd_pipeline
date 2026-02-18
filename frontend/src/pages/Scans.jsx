import { useState } from 'react'

export default function Scans() {
  const [scans] = useState([
    { id: 1, project: 'Backend API', type: 'Full', status: 'Completed', progress: 100, findings: 18 },
    { id: 2, project: 'Frontend App', type: 'Quick', status: 'Running', progress: 45, findings: 0 },
    { id: 3, project: 'Mobile App', type: 'Full', status: 'Queued', progress: 0, findings: 0 }
  ])

  return (
    <div className="bg-white min-h-[calc(100vh-48px)] p-6">
      <h1 className="text-2xl font-normal text-[#303030] mb-6">Scans</h1>

      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f8f8f8] border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Project</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Type</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Status</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Progress</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Findings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {scans.map((scan) => (
              <tr key={scan.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 text-[#303030]">{scan.project}</td>
                <td className="px-6 py-4 text-[#666]">{scan.type}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    scan.status === 'Completed'
                      ? 'bg-[#e6f6ea] text-[#108548]'
                      : scan.status === 'Running'
                        ? 'bg-[#fff6de] text-[#8a6d00]'
                        : 'bg-[#f1f1f1] text-[#666]'
                  }`}>
                    {scan.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div className="bg-[#1f75cb] h-2 rounded-full" style={{ width: `${scan.progress}%` }}></div>
                    </div>
                    <span className="text-sm text-[#666]">{scan.progress}%</span>
                  </div>
                </td>
                <td className="px-6 py-4 font-medium text-[#303030]">{scan.findings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
