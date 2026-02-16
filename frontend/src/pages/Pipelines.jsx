import { useState } from 'react'

export default function Pipelines() {
  const [pipelines] = useState([
    { id: 1, project: 'Backend API', stages: 5, status: 'Active', riskThreshold: 'Medium' },
    { id: 2, project: 'Frontend App', stages: 4, status: 'Active', riskThreshold: 'Low' },
    { id: 3, project: 'Mobile App', stages: 6, status: 'Inactive', riskThreshold: 'High' },
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white">CI/CD Pipelines</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {pipelines.map(pipeline => (
          <div key={pipeline.id} className="card p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">{pipeline.project}</h3>
                <p className="text-sm text-slate-400">{pipeline.stages} stages</p>
              </div>
              <span className={`badge ${pipeline.status === 'Active' ? 'badge-low' : 'badge-high'}`}>
                {pipeline.status}
              </span>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Risk Threshold</label>
                <p className="text-white">{pipeline.riskThreshold}</p>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Pipeline Stages</label>
                <div className="flex gap-2">
                  {Array(pipeline.stages).fill(0).map((_, i) => (
                    <div key={i} className="flex-1 h-2 bg-slate-700 rounded-full"></div>
                  ))}
                </div>
              </div>
            </div>

            <button className="w-full btn-secondary text-sm py-2">
              Configure
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
