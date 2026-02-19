import { useEffect, useState } from 'react'
import { scansApi } from '../services/api'

const statusClass = (status) => {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'completed') return 'bg-[#e6f6ea] text-[#108548]'
  if (normalized === 'running') return 'bg-[#fff6de] text-[#8a6d00]'
  if (normalized === 'failed') return 'bg-[#ffe4e6] text-[#be123c]'
  return 'bg-[#f1f1f1] text-[#666]'
}

export default function Scans() {
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    const loadScans = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await scansApi.getAll()
        if (mounted) {
          setScans(response.data?.data || [])
        }
      } catch (err) {
        if (mounted) {
          setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load scans')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadScans()

    return () => {
      mounted = false
    }
  }, [])

  if (loading) {
    return <div className="bg-white min-h-[calc(100vh-48px)] p-6 text-[#666]">Loading scans...</div>
  }

  return (
    <div className="bg-white min-h-[calc(100vh-48px)] p-6">
      <h1 className="text-2xl font-normal text-[#303030] mb-6">Scans</h1>

      {error ? <div className="mb-4 px-4 py-3 text-sm bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] rounded">{error}</div> : null}

      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f8f8f8] border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Scan ID</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Project ID</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Type</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Status</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Progress</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Findings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {scans.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-sm text-[#666]">No scans available.</td>
              </tr>
            ) : (
              scans.map((scan) => {
                const progress = Number(scan.progress || 0)
                const findingsCount = Array.isArray(scan.findings) ? scan.findings.length : Number(scan.findings || 0)

                return (
                  <tr key={scan.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-[#303030] text-sm">{scan.id}</td>
                    <td className="px-6 py-4 text-[#666] text-sm">{scan.projectId || '-'}</td>
                    <td className="px-6 py-4 text-[#666] text-sm">{scan.scanType || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${statusClass(scan.status)}`}>
                        {String(scan.status || 'unknown')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div className="bg-[#1f75cb] h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}></div>
                        </div>
                        <span className="text-sm text-[#666]">{Math.max(0, Math.min(progress, 100))}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-[#303030]">{findingsCount}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
