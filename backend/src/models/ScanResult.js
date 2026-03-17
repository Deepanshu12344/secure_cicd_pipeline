import mongoose from 'mongoose'

const scanResultSchema = new mongoose.Schema(
  {
    repository: { type: String, required: true, index: true },
    owner: { type: String, default: '' },
    repoName: { type: String, default: '' },
    branch: { type: String, default: '' },
    commit: { type: String, default: '' },
    actor: { type: String, default: '' },
    runId: { type: String, default: '' },
    workflow: { type: String, default: '' },
    riskScore: { type: Number, default: 0 },
    critical: { type: Number, default: 0 },
    high: { type: Number, default: 0 },
    medium: { type: Number, default: 0 },
    low: { type: Number, default: 0 },
    vulnerabilities: { type: Array, default: [] },
    reportPath: { type: String, default: '' },
    reportFileName: { type: String, default: '' },
    rawReport: { type: Object, default: null }
  },
  { timestamps: true }
)

scanResultSchema.index({ repository: 1, createdAt: -1 }, { name: 'repo_recent_idx' })

const ScanResult = mongoose.models.ScanResult || mongoose.model('ScanResult', scanResultSchema)

export default ScanResult
