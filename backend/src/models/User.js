import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    role: {
      type: String,
      enum: ['user', 'admin', 'faculty', 'student'],
      default: 'user'
    },
    studentId: {
      type: String,
      default: null,
      trim: true
    },
    institution: {
      type: String,
      default: null,
      trim: true
    },
    passwordHash: {
      type: String,
      default: null
    },
    provider: {
      type: String,
      enum: ['local', 'google', 'github'],
      default: 'local'
    },
    googleId: {
      type: String,
      default: null
    },
    githubId: {
      type: String,
      default: null
    },
    githubAccessToken: {
      type: String,
      default: null
    },
    profilePhotoUrl: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
