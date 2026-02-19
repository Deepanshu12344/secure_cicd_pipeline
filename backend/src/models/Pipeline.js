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
