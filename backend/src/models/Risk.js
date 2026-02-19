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
    }
  },
  {
    timestamps: true
  }
)

riskSchema.index({ ownerId: 1, projectId: 1, severity: 1, status: 1 }, { name: 'owner_project_filter_idx' })

const Risk = mongoose.models.Risk || mongoose.model('Risk', riskSchema)

export default Risk
