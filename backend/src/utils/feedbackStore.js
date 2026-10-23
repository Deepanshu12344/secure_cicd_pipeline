import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'
import Feedback from '../models/Feedback.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fallbackDataDir = path.resolve(__dirname, '../../data')
const fallbackFile = path.join(fallbackDataDir, 'feedback_store.json')
const lockFile = path.join(fallbackDataDir, 'feedback_store.lock')

export const ensureFallbackDir = () => {
  if (!fs.existsSync(fallbackDataDir)) {
    fs.mkdirSync(fallbackDataDir, { recursive: true })
  }
  if (!fs.existsSync(fallbackFile)) {
    fs.writeFileSync(fallbackFile, '[]', 'utf8')
  }
}

export const withFileLock = (fn) => {
  ensureFallbackDir()
  const maxWait = 2500
  const start = Date.now()
  let fd = null

  while (Date.now() - start < maxWait) {
    try {
      fd = fs.openSync(lockFile, 'wx')
      break
    } catch (err) {
      if (err.code === 'EEXIST') {
        try {
          const stats = fs.statSync(lockFile)
          if (Date.now() - stats.mtimeMs > 5000) {
            fs.unlinkSync(lockFile)
            continue
          }
        } catch {}
        const waitTill = Date.now() + 25
        while (Date.now() < waitTill) {}
      } else {
        throw err
      }
    }
  }

  if (!fd) {
    return fn()
  }

  try {
    return fn()
  } finally {
    try {
      fs.closeSync(fd)
      fs.unlinkSync(lockFile)
    } catch {}
  }
}

export const readFallbackStore = () => {
  try {
    ensureFallbackDir()
    return JSON.parse(fs.readFileSync(fallbackFile, 'utf8'))
  } catch {
    return []
  }
}

export const writeFallbackStore = (data) => {
  try {
    ensureFallbackDir()
    const tmpFile = path.join(fallbackDataDir, `.feedback_store.${process.pid}.${Date.now()}.tmp`)
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tmpFile, fallbackFile)
  } catch (err) {
    console.error('Failed to write feedback fallback store atomically:', err.message)
    throw err
  }
}

export const isMongoReady = () => mongoose.connection && mongoose.connection.readyState === 1

export const saveFeedback = async ({
  findingId,
  fingerprint,
  projectId,
  scanId = null,
  userId,
  userName = '',
  userRole = 'developer',
  label,
  note = '',
  featureSnapshot = {},
  source = 'user'
}) => {
  if (isMongoReady()) {
    const record = await Feedback.create({
      findingId,
      fingerprint,
      projectId,
      scanId,
      userId,
      userName,
      userRole,
      label,
      note,
      featureSnapshot,
      source
    })
    return record
  }

  return withFileLock(() => {
    const store = readFallbackStore()
    const record = {
      _id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      findingId: String(findingId),
      fingerprint,
      projectId: String(projectId),
      scanId: scanId ? String(scanId) : null,
      userId: String(userId),
      userName,
      userRole,
      label,
      note,
      featureSnapshot,
      source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    store.push(record)
    writeFallbackStore(store)
    return record
  })
}

export const removeFeedback = async ({ findingId, userId }) => {
  if (isMongoReady()) {
    const res = await Feedback.deleteMany({ findingId, userId })
    return { deletedCount: res.deletedCount || 0 }
  }

  return withFileLock(() => {
    const store = readFallbackStore()
    const filtered = store.filter(
      (item) => !(String(item.findingId) === String(findingId) && String(item.userId) === String(userId))
    )
    const deletedCount = store.length - filtered.length
    writeFallbackStore(filtered)
    return { deletedCount }
  })
}

export const getLatestFeedbackForFinding = async (findingId) => {
  if (isMongoReady()) {
    return Feedback.findOne({ findingId }).sort({ createdAt: -1, _id: -1 })
  }
  const store = readFallbackStore()
  return (
    store
      .filter((item) => String(item.findingId) === String(findingId))
      .sort((a, b) => {
        const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        if (timeDiff !== 0) return timeDiff
        return String(b._id || '').localeCompare(String(a._id || ''))
      })[0] || null
  )
}

const PRIVILEGED_ROLES = new Set(['admin', 'lead', 'security_reviewer'])

export const getActiveSuppressedFingerprints = async (projectId) => {
  if (isMongoReady()) {
    const feedbacks = await Feedback.find({ projectId }).sort({ createdAt: 1 })
    const latestByUserAndFingerprint = new Map()
    for (const fb of feedbacks) {
      const key = `${fb.fingerprint}::${fb.userId}`
      latestByUserAndFingerprint.set(key, {
        fingerprint: fb.fingerprint,
        label: fb.label,
        userRole: fb.userRole || 'developer'
      })
    }

    const votesByFingerprint = new Map()
    for (const entry of latestByUserAndFingerprint.values()) {
      if (!votesByFingerprint.has(entry.fingerprint)) {
        votesByFingerprint.set(entry.fingerprint, {
          fp: 0,
          confirmed: 0,
          hasPrivilegedFp: false,
          hasPrivilegedConfirmed: false
        })
      }
      const state = votesByFingerprint.get(entry.fingerprint)
      const isPrivileged = PRIVILEGED_ROLES.has(entry.userRole)

      if (entry.label === 'false_positive') {
        state.fp += 1
        if (isPrivileged) state.hasPrivilegedFp = true
      } else if (entry.label === 'confirmed') {
        state.confirmed += 1
        if (isPrivileged) state.hasPrivilegedConfirmed = true
      }
    }

    const suppressed = new Set()
    for (const [fingerprint, state] of votesByFingerprint.entries()) {
      const meetsRule = (state.hasPrivilegedFp && !state.hasPrivilegedConfirmed) ||
        (state.fp >= 2 && state.fp > state.confirmed)
      if (meetsRule) {
        suppressed.add(fingerprint)
      }
    }
    return suppressed
  }

  return withFileLock(() => {
    const store = readFallbackStore()
    const projectItems = store.filter((i) => String(i.projectId) === String(projectId))
    const latestByUserAndFingerprint = new Map()
    for (const fb of projectItems) {
      const key = `${fb.fingerprint}::${fb.userId}`
      latestByUserAndFingerprint.set(key, {
        fingerprint: fb.fingerprint,
        label: fb.label,
        userRole: fb.userRole || 'developer'
      })
    }

    const votesByFingerprint = new Map()
    for (const entry of latestByUserAndFingerprint.values()) {
      if (!votesByFingerprint.has(entry.fingerprint)) {
        votesByFingerprint.set(entry.fingerprint, {
          fp: 0,
          confirmed: 0,
          hasPrivilegedFp: false,
          hasPrivilegedConfirmed: false
        })
      }
      const state = votesByFingerprint.get(entry.fingerprint)
      const isPrivileged = PRIVILEGED_ROLES.has(entry.userRole)

      if (entry.label === 'false_positive') {
        state.fp += 1
        if (isPrivileged) state.hasPrivilegedFp = true
      } else if (entry.label === 'confirmed') {
        state.confirmed += 1
        if (isPrivileged) state.hasPrivilegedConfirmed = true
      }
    }

    const suppressed = new Set()
    for (const [fingerprint, state] of votesByFingerprint.entries()) {
      const meetsRule = (state.hasPrivilegedFp && !state.hasPrivilegedConfirmed) ||
        (state.fp >= 2 && state.fp > state.confirmed)
      if (meetsRule) {
        suppressed.add(fingerprint)
      }
    }
    return suppressed
  })
}

export const getAllFeedbackForTraining = async () => {
  if (isMongoReady()) {
    return Feedback.find({}).sort({ createdAt: 1 })
  }
  return readFallbackStore()
}

export default {
  ensureFallbackDir,
  withFileLock,
  readFallbackStore,
  writeFallbackStore,
  isMongoReady,
  saveFeedback,
  removeFeedback,
  getLatestFeedbackForFinding,
  getActiveSuppressedFingerprints,
  getAllFeedbackForTraining
}
