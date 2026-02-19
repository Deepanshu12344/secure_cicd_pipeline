import { useEffect, useState } from 'react'
import { pipelinesApi } from '../services/api'

const getThresholdLabel = (riskThreshold) => {
  if (!riskThreshold || typeof riskThreshold !== 'object') return '-'
  const critical = riskThreshold.critical ?? '-'
  const high = riskThreshold.high ?? '-'
  return `critical: ${critical}, high: ${high}`
}

export default function Pipelines() {
  const [pipelines, setPipelines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    const loadPipelines = async () => {
      setLoading(true)
      setError('')

      try {
        const response = await pipelinesApi.getAll()
        if (mounted) {
          setPipelines(response.data?.data || [])
        }
      } catch (err) {
        if (mounted) {
          setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load pipelines')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadPipelines()

    return () => {
      mounted = false
    }
  }, [])

  if (loading) {
    return <div className="bg-white min-h-[calc(100vh-48px)] p-6 text-[#666]">Loading pipelines...</div>
  }

  return (
    <div className="bg-white min-h-[calc(100vh-48px)] p-6">
      <h1 className="text-2xl font-normal text-[#303030] mb-6">CI/CD Pipelines</h1>

      {error ? <div className="mb-4 px-4 py-3 text-sm bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] rounded">{error}</div> : null}

      {pipelines.length === 0 ? (
        <div className="border border-gray-200 rounded p-8 text-center text-sm text-[#666] bg-white">
          No pipelines available.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {pipelines.map((pipeline) => {
            const stages = Array.isArray(pipeline.stages) ? pipeline.stages : []
            return (
              <div key={pipeline.id} className="border border-gray-200 rounded p-5 bg-white">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-[#303030]">{pipeline.name || 'Pipeline'}</h3>
                    <p className="text-sm text-[#666]">Project ID: {pipeline.projectId || '-'}</p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      pipeline.enabled ? 'bg-[#e6f6ea] text-[#108548]' : 'bg-[#f1f1f1] text-[#666]'
                    }`}
                  >
                    {pipeline.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>

                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-sm text-[#666] mb-1">Risk Threshold</label>
                    <p className="text-[#303030] text-sm">{getThresholdLabel(pipeline.riskThreshold)}</p>
                  </div>
                  <div>
                    <label className="block text-sm text-[#666] mb-2">Pipeline Stages</label>
                    {stages.length === 0 ? (
                      <p className="text-sm text-[#666]">No stages configured.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {stages.map((stage) => (
                          <span key={`${pipeline.id}-${stage}`} className="px-2 py-1 text-xs border border-gray-300 rounded text-[#303030]">
                            {stage}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
