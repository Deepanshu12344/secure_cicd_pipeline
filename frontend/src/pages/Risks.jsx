import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { risksApi } from '../services/api'

const severityClass = (severity) => {
  const normalized = String(severity || '').toLowerCase()
  if (normalized === 'critical') return 'bg-[#ffe4e6] text-[#be123c]'
  if (normalized === 'high') return 'bg-[#fff1e6] text-[#c2410c]'
  if (normalized === 'medium') return 'bg-[#fff8dc] text-[#8a6d00]'
  return 'bg-[#e6f6ea] text-[#108548]'
}

export default function Risks() {
  const [risks, setRisks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    const loadRisks = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await risksApi.getAll()
        if (mounted) {
          setRisks(response.data?.data || [])
        }
      } catch (err) {
        if (mounted) {
          setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load risks')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadRisks()

    return () => {
      mounted = false
    }
  }, [])

  if (loading) {
    return <div className="bg-white min-h-[calc(100vh-48px)] p-6 text-[#666]">Loading risks...</div>
  }

  return (
    <div className="bg-white min-h-[calc(100vh-48px)]">
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-2 text-sm text-[#6e49cb]">
          <Link to="/" className="hover:underline">Your work</Link>
          <span className="text-gray-400">/</span>
          <span className="text-[#303030]">Risks</span>
        </div>
      </div>

      <div className="p-6">
      <h1 className="text-2xl font-normal text-[#303030] mb-6">Identified Risks</h1>

      {error ? <div className="mb-4 px-4 py-3 text-sm bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] rounded">{error}</div> : null}

      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#f8f8f8] border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Risk Title</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Severity</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Project ID</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Location</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {risks.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-[#666]">No risks available.</td>
              </tr>
            ) : (
              risks.map((risk) => (
                <tr key={risk.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-[#303030]">{risk.title || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${severityClass(risk.severity)}`}>
                      {String(risk.severity || 'unknown')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[#666]">{risk.projectId || '-'}</td>
                  <td className="px-6 py-4 text-[#666] text-sm">{risk.file ? `${risk.file}:${risk.line || '-'}` : '-'}</td>
                  <td className="px-6 py-4 text-[#666] text-sm">{risk.status || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  )
}
