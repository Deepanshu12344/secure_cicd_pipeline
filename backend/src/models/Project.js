import mongoose from 'mongoose'

const projectSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    repositoryUrl: {
      type: String,
      required: true,
      trim: true
    },
    repositoryType: {
      type: String,
      default: 'github'
    },
    language: {
      type: String,
      default: 'unknown'
    },
    githubRepoId: {
      type: String,
      default: null
    },
    isPrivate: {
      type: Boolean,
      default: false
    },
    stars: {
      type: Number,
      default: 0
    },
    forks: {
      type: Number,
      default: 0
    },
    lastScan: {
      type: Date,
      default: null
    },
    riskScore: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      default: 'active'
    }
  },
  {
    timestamps: true
  }
)

projectSchema.index(
  { ownerId: 1, githubRepoId: 1 },
  {
    name: 'owner_github_repo_unique',
    unique: true,
    partialFilterExpression: { githubRepoId: { $type: 'string' } }
  }
)

const Project = mongoose.models.Project || mongoose.model('Project', projectSchema)

export default Project
