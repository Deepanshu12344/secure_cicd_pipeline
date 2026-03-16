import mongoose from 'mongoose'

const pipelineSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true
    },
    name: {
      type: String,
      default: 'Default Pipeline',
      trim: true
    },
    stages: {
      type: [String],
      default: ['scan', 'analyze', 'decide']
    },
    riskThreshold: {
      type: mongoose.Schema.Types.Mixed,
      default: { critical: 0, high: 5 }
    },
    enabled: {
      type: Boolean,
      default: true
    },
    lastScanStatus: {
      type: String,
      enum: ['never', 'running', 'completed', 'failed'],
      default: 'never'
    },
    lastScanStartedAt: {
      type: Date,
      default: null
    },
    lastScanCompletedAt: {
      type: Date,
      default: null
    },
    lastScanError: {
      type: String,
      default: ''
    },
    lastScanSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    lastScanIssues: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    lastScanReportFiles: {
      jsonPath: { type: String, default: null },
      pdfPath: { type: String, default: null }
    }
  },
  {
    timestamps: true
  }
)

pipelineSchema.index(
  { ownerId: 1, projectId: 1 },
  { name: 'owner_project_pipeline_unique', unique: true }
)

const Pipeline = mongoose.models.Pipeline || mongoose.model('Pipeline', pipelineSchema)

export default Pipeline
