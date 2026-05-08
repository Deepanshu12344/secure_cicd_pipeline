import fs from 'fs/promises'
import path from 'path'
import mongoose from 'mongoose'
import { fileURLToPath } from 'url'
import Project from '../models/Project.js'
import Pipeline from '../models/Pipeline.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const storageDir = path.resolve(__dirname, '../../storage')
const storageFile = path.join(storageDir, 'ci-dashboard-status.json')

const normalizeRepositoryIdentifier = (value) => {
  let normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return ''

  normalized = normalized.replace(/\.git$/i, '').replace(/\/+$/, '')
  normalized = normalized.replace(/^git@([^:]+):/, '$1/')
  normalized = normalized.replace(/^ssh:\/\//, '')
  normalized = normalized.replace(/^https?:\/\//, '')
  normalized = normalized.replace(/^www\./, '')
  normalized = normalized.replace(/^[^/]*github\.com\//, '')

  const parts = normalized.split('/').filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
  }

  return normalized
}

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const readStore = async () => {
  try {
    const raw = await fs.readFile(storageFile, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw error
  }
}

const writeStore = async (data) => {
  await fs.mkdir(storageDir, { recursive: true })
  await fs.writeFile(storageFile, JSON.stringify(data, null, 2), 'utf-8')
}

const buildStoreKey = ({ projectId, repositoryFullName, repositoryUrl }) =>
  String(projectId || '').trim() ||
  normalizeRepositoryIdentifier(repositoryFullName) ||
  normalizeRepositoryIdentifier(repositoryUrl) ||
  'default'

const resolveProject = async ({ projectId, repositoryUrl, repositoryFullName }) => {
  if (!mongoose.connection.readyState) {
    return null
  }

  if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
    const byId = await Project.findById(projectId)
    if (byId) return byId
  }

  const candidates = [
    normalizeRepositoryIdentifier(repositoryFullName),
    normalizeRepositoryIdentifier(repositoryUrl)
  ].filter(Boolean)

  if (candidates.length === 0) {
    return null
  }

  const orConditions = []
  ;[...new Set(candidates)].forEach((candidate) => {
    const escaped = escapeRegex(candidate)
    orConditions.push({ fullName: { $regex: new RegExp(`^${escaped}$`, 'i') } })
    orConditions.push({ repositoryUrl: { $regex: new RegExp(`(?:^|/)${escaped}(?:\\.git)?/?$`, 'i') } })
  })

  return Project.findOne({ $or: orConditions })
}

const normalizeStatus = (status) => (String(status || '').toLowerCase() === 'failed' ? 'failed' : 'passed')

export const saveCiDashboardStatus = async (payload) => {
  const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date()
  const normalizedPayload = {
    projectId: payload.projectId || null,
    repositoryUrl: String(payload.repositoryUrl || '').trim(),
    repositoryFullName: String(payload.repositoryFullName || '').trim(),
    branch: String(payload.branch || 'main').trim() || 'main',
    commitSha: String(payload.commitSha || '').trim(),
    workflowRunUrl: String(payload.workflowRunUrl || '').trim(),
    status: normalizeStatus(payload.status),
    issueCount: Number(payload.issueCount || 0),
    severitySummary: {
      critical: Number(payload.severitySummary?.critical || 0),
      high: Number(payload.severitySummary?.high || 0),
      medium: Number(payload.severitySummary?.medium || 0),
      low: Number(payload.severitySummary?.low || 0),
      nonCritical: Number(payload.severitySummary?.nonCritical || 0)
    },
    timestamp: timestamp.toISOString(),
    source: String(payload.source || 'ci').trim(),
    report: payload.report && typeof payload.report === 'object' ? payload.report : null
  }

  const store = await readStore()
  store[buildStoreKey(normalizedPayload)] = normalizedPayload
  await writeStore(store)

  const project = await resolveProject(normalizedPayload)
  if (!project) {
    return normalizedPayload
  }

  normalizedPayload.projectId = String(project._id)
  project.lastScan = timestamp
  if (typeof normalizedPayload.report?.overall_risk_score === 'number') {
    project.riskScore = normalizedPayload.report.overall_risk_score
  }
  await project.save()

  await Pipeline.findOneAndUpdate(
    { ownerId: project.ownerId, projectId: project._id },
    {
      $set: {
        name: 'CI/CD Security Check',
        enabled: true,
        lastScanStatus: normalizedPayload.status === 'failed' ? 'failed' : 'completed',
        lastScanStartedAt: timestamp,
        lastScanCompletedAt: timestamp,
        lastScanError:
          normalizedPayload.status === 'failed' ? 'Critical issues detected during CI/CD security check.' : '',
        lastScanSummary: {
          status: normalizedPayload.status,
          issueCount: normalizedPayload.issueCount,
          severitySummary: normalizedPayload.severitySummary,
          timestamp: normalizedPayload.timestamp,
          branch: normalizedPayload.branch,
          commitSha: normalizedPayload.commitSha,
          workflowRunUrl: normalizedPayload.workflowRunUrl
        },
        lastScanIssues: Array.isArray(normalizedPayload.report?.issues) ? normalizedPayload.report.issues : []
      },
      $setOnInsert: {
        ownerId: project.ownerId,
        projectId: project._id
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  return normalizedPayload
}

export const getLatestCiDashboardStatus = async ({ projectId, repositoryUrl, repositoryFullName } = {}) => {
  const project = await resolveProject({ projectId, repositoryUrl, repositoryFullName })
  if (project) {
    const pipeline = await Pipeline.findOne({ ownerId: project.ownerId, projectId: project._id })
    if (pipeline?.lastScanSummary) {
      return {
        projectId: String(project._id),
        ...pipeline.lastScanSummary
      }
    }
  }

  const store = await readStore()
  const key = buildStoreKey({ projectId, repositoryUrl, repositoryFullName })
  return store[key] || null
}
