import { useState } from 'react'

export default function Pipelines() {
  const [pipelines] = useState([
    { id: 1, project: 'Backend API', stages: 5, status: 'Active', riskThreshold: 'Medium' },
    { id: 2, project: 'Frontend App', stages: 4, status: 'Active', riskThreshold: 'Low' },
    { id: 3, project: 'Mobile App', stages: 6, status: 'Inactive', riskThreshold: 'High' }
  ])

  return (
    <div className="bg-white min-h-[calc(100vh-48px)] p-6">
      <h1 className="text-2xl font-normal text-[#303030] mb-6">CI/CD Pipelines</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {pipelines.map((pipeline) => (
          <div key={pipeline.id} className="border border-gray-200 rounded p-5 bg-white">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium text-[#303030]">{pipeline.project}</h3>
                <p className="text-sm text-[#666]">{pipeline.stages} stages</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${pipeline.status === 'Active' ? 'bg-[#e6f6ea] text-[#108548]' : 'bg-[#f1f1f1] text-[#666]'}`}>
                {pipeline.status}
              </span>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm text-[#666] mb-1">Risk Threshold</label>
                <p className="text-[#303030]">{pipeline.riskThreshold}</p>
              </div>
              <div>
                <label className="block text-sm text-[#666] mb-2">Pipeline Stages</label>
                <div className="flex gap-2">
                  {Array.from({ length: pipeline.stages }).map((_, i) => (
                    <div key={i} className="flex-1 h-2 bg-gray-200 rounded-full"></div>
                  ))}
                </div>
              </div>
            </div>

            <button className="w-full px-3 py-2 text-sm text-[#303030] border border-gray-300 rounded hover:bg-gray-50 transition-colors">
              Configure
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
