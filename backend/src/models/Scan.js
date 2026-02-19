import mongoose from 'mongoose'

const scanSchema = new mongoose.Schema(
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
    repositoryUrl: {
      type: String,
      required: true,
      trim: true
    },
    scanType: {
      type: String,
      default: 'full'
    },
    branch: {
      type: String,
      default: 'main'
    },
    status: {
      type: String,
      default: 'queued'
    },
    progress: {
      type: Number,
      default: 0
    },
    startedAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    },
    findings: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    }
  },
  {
    timestamps: true
  }
)

scanSchema.index({ ownerId: 1, projectId: 1, createdAt: -1 }, { name: 'owner_project_created_idx' })

const Scan = mongoose.models.Scan || mongoose.model('Scan', scanSchema)

export default Scan
