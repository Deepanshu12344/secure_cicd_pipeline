import mongoose from 'mongoose'

const riskSchema = new mongoose.Schema(
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
    scanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Scan',
      default: null,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    severity: {
      type: String,
      default: 'medium'
    },
    riskScore: {
      type: Number,
      default: 5
    },
    file: {
      type: String,
      default: null
    },
    line: {
      type: Number,
      default: null
    },
    status: {
      type: String,
      default: 'open'
    },
    notes: {
      type: String,
      default: ''
    },
    source: {
      type: String,
      default: 'manual',
      index: true
    },
    sourceIssueId: {
      type: String,
      default: null
    },
    threatType: {
      type: String,
      default: ''
    },
    remediation: {
      type: String,
      default: ''
    },
    fingerprint: {
      type: String,
      default: null,
      index: true
    },
    modelPrediction: {
      type: Number,
      default: null
    },
    modelVersion: {
      type: String,
      default: null
    },
    feedbackStatus: {
      type: String,
      enum: ['unreviewed', 'false_positive', 'confirmed', 'waived', 'disputed'],
      default: 'unreviewed',
      index: true
    },
    isSuppressed: {
      type: Boolean,
      default: false,
      index: true
    },
    suppressionReason: {
      type: String,
      default: ''
    },
    waiver: {
      isWaived: { type: Boolean, default: false, index: true },
      waivedBy: { type: String, default: null },
      waivedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      waivedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null, index: true },
      reason: { type: String, default: '' },
      auditLog: [
        {
          action: { type: String, enum: ['grant', 'revoke', 'expire'] },
          userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          userName: { type: String, default: '' },
          timestamp: { type: Date, default: Date.now },
          reason: { type: String, default: '' },
          expiresAt: { type: Date, default: null }
        }
      ]
    }
  },
  {
    timestamps: true
  }
)

riskSchema.index({ ownerId: 1, projectId: 1, severity: 1, status: 1 }, { name: 'owner_project_filter_idx' })
riskSchema.index({ projectId: 1, fingerprint: 1 }, { name: 'project_fingerprint_idx' })

const Risk = mongoose.models.Risk || mongoose.model('Risk', riskSchema)

export default Risk
