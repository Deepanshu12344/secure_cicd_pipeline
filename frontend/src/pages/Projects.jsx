import { useState } from 'react'
import { PlusIcon } from '@heroicons/react/24/outline'

export default function Projects() {
  const [projects] = useState([
    { id: 1, name: 'Backend API', type: 'Private', risk: 6.2, status: 'Active' },
    { id: 2, name: 'Frontend App', type: 'Public', risk: 4.8, status: 'Active' },
    { id: 3, name: 'Mobile App', type: 'Private', risk: 7.5, status: 'Active' },
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Projects</h1>
        <button className="btn-primary flex items-center gap-2">
          <PlusIcon className="w-5 h-5" />
          Add Project
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map(project => (
          <div key={project.id} className="card p-6 hover:border-slate-600 transition-colors cursor-pointer">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">{project.name}</h3>
                <p className="text-sm text-slate-400">{project.type}</p>
              </div>
              <span className="badge badge-low">{project.status}</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">Risk Score</span>
                <span className="text-xl font-bold text-yellow-400">{project.risk}</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div 
                  className="bg-yellow-500 h-2 rounded-full" 
                  style={{ width: `${(project.risk / 10) * 100}%` }}
                ></div>
              </div>
              <button className="w-full btn-secondary text-sm py-2 mt-2">
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
