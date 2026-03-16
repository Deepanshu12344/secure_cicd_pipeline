import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { risksApi } from '../services/api'

export default function Risks() {
  const [risks, setRisks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await risksApi.getAll({ dedupe: true, source: 'analyzer,cicd' })
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
    load()
    return () => {
      mounted = false
    }
  }, [])

  const projectRows = useMemo(() => {
    const groups = new Map()
    for (const risk of risks) {
      const projectId = String(risk.projectId || '')
      if (!projectId) continue
      if (!groups.has(projectId)) {
        groups.set(projectId, {
          projectId,
          projectName: risk.projectFullName || risk.projectName || '-',
          total: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          updatedAt: risk.updatedAt || null
        })
      }
      const row = groups.get(projectId)
      row.total += Number(risk.occurrenceCount || 1)
      const severity = String(risk.severity || '').toLowerCase()
      if (severity === 'critical') row.critical += Number(risk.occurrenceCount || 1)
      else if (severity === 'high') row.high += Number(risk.occurrenceCount || 1)
      else if (severity === 'medium') row.medium += Number(risk.occurrenceCount || 1)
      else row.low += Number(risk.occurrenceCount || 1)

      if (!row.updatedAt || new Date(risk.updatedAt).getTime() > new Date(row.updatedAt).getTime()) {
        row.updatedAt = risk.updatedAt
      }
    }
    return Array.from(groups.values()).sort((a, b) => b.total - a.total)
  }, [risks])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return projectRows
    return projectRows.filter((row) => {
      const text = [row.projectName, row.projectId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return text.includes(query)
    })
  }, [projectRows, search])

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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
          <h1 className="text-2xl font-normal text-[#303030]">Risks</h1>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search risk, project, source..."
            className="w-full md:w-80 border border-gray-300 rounded px-3 py-2 text-sm text-[#303030] focus:outline-none focus:border-[#1f75cb]"
          />
        </div>

        {error ? <div className="mb-4 px-4 py-3 text-sm bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] rounded">{error}</div> : null}

        <div className="border border-gray-200 rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-[#f8f8f8] border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Project Name</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Project ID</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Total Risks</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Severity Split</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-[#303030]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-[#666]">No risks found.</td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.projectId} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-[#303030] font-medium">{row.projectName || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#666]">
                        <div className="text-xs text-[#999] mt-1">{row.projectId || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#303030]">{row.total}</td>
                      <td className="px-6 py-4 text-sm text-[#666]">
                        C:{row.critical} H:{row.high} M:{row.medium} L:{row.low}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          to={`/risks/${row.projectId}`}
                          className="inline-flex px-3 py-1.5 text-xs border border-[#d4d4d4] rounded bg-white hover:bg-[#f8f8f8] text-[#303030]"
                        >
                          Full View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
