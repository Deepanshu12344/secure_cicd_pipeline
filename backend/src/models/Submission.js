import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    repoName: {
      type: String,
      required: true,
      trim: true
    },
    commitHash: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    riskScore: {
      type: Number,
      required: true,
      min: 0
    },
    vulnerabilities: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    autoGrade: {
      type: String,
      enum: ['A', 'B', 'C', 'Fail'],
      required: true
    },
    facultyGrade: {
      type: String,
      enum: ['A', 'B', 'C', 'Fail'],
      default: null
    },
    facultyFeedback: {
      type: String,
      default: null
    },
    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    gradedAt: {
      type: Date,
      default: null
    },
    reportFilePath: {
      type: String,
      default: null
    }
  },
  {
    versionKey: false
  }
);

const Submission = mongoose.models.Submission || mongoose.model('Submission', submissionSchema);

export default Submission;
