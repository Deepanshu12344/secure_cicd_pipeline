import mongoose from 'mongoose'

const feedbackSchema = new mongoose.Schema(
  {
    findingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Risk',
      required: true,
      index: true
    },
    fingerprint: {
      type: String,
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
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    userName: {
      type: String,
      default: ''
    },
    userRole: {
      type: String,
      default: 'developer'
    },
    label: {
      type: String,
      enum: ['false_positive', 'confirmed'],
      required: true
    },
    note: {
      type: String,
      default: '',
      trim: true
    },
    featureSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    source: {
      type: String,
      enum: ['user', 'seed', 'bulk'],
      default: 'user'
    }
  },
  {
    timestamps: true
  }
)

feedbackSchema.index({ projectId: 1, fingerprint: 1, userId: 1 }, { name: 'proj_fingerprint_user_idx' })
feedbackSchema.index({ fingerprint: 1, createdAt: -1 }, { name: 'fingerprint_created_idx' })

const Feedback = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema)

export default Feedback
