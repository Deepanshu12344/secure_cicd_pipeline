import { useState } from 'react'

export default function ProjectDetail() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Backend API</h1>
        <p className="text-slate-400">Latest scan: 2 hours ago</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Project Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Project Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Repository URL</label>
                <p className="text-white">https://github.com/example/backend-api</p>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Language</label>
                <p className="text-white">Node.js / JavaScript</p>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Recent Scans</h2>
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                  <div>
                    <p className="text-white font-medium">Full Scan</p>
                    <p className="text-xs text-slate-400">Completed 2 hours ago</p>
                  </div>
                  <span className="badge badge-low">✓</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Risk Score</h3>
            <div className="text-center">
              <p className="text-4xl font-bold text-yellow-400 mb-2">6.2</p>
              <p className="text-sm text-slate-400">Medium Risk</p>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Risk Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Critical</span>
                <span className="text-red-400 font-bold">2</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">High</span>
                <span className="text-orange-400 font-bold">5</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Medium</span>
                <span className="text-yellow-400 font-bold">12</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
