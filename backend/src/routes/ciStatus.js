import express from 'express'
import { getLatestCiDashboardStatus, saveCiDashboardStatus } from '../utils/ciDashboardStore.js'

import { protect } from '../middleware/authMiddleware.js'

const router = express.Router()

const requireCiApiKey = (req, res, next) => {
  const expectedApiKey = String(process.env.CI_INGEST_API_KEY || '').trim()
  const providedApiKey = String(req.headers['x-ci-api-key'] || '').trim()

  if (expectedApiKey && providedApiKey === expectedApiKey) {
    return next()
  }

  // Allow Bearer token authorization if present
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return protect(req, res, next)
  }

  // In non-production environments, allow pre-commit CLI to report without requiring a hardcoded key
  if (process.env.NODE_ENV !== 'production' && req.body?.source === 'pre-commit') {
    return next()
  }

  if (!expectedApiKey) {
    return res.status(503).json({
      success: false,
      error: 'CI dashboard ingestion is disabled. Set CI_INGEST_API_KEY on the backend.'
    })
  }

  return res.status(401).json({
    success: false,
    error: 'Unauthorized CI dashboard update request'
  })
}

router.post('/', requireCiApiKey, async (req, res, next) => {
  try {
    const payload = req.body || {}
    const status = String(payload.status || '').trim().toLowerCase()
    const issueCount = Number(payload.issueCount || 0)

    if (!['passed', 'failed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'status must be "passed" or "failed"' })
    }

    if (!Number.isFinite(issueCount) || issueCount < 0) {
      return res.status(400).json({ success: false, error: 'issueCount must be a non-negative number' })
    }

    const saved = await saveCiDashboardStatus(payload)
    res.status(201).json({ success: true, data: saved })
  } catch (error) {
    next(error)
  }
})

router.get('/latest', async (req, res, next) => {
  try {
    const data = await getLatestCiDashboardStatus({
      projectId: req.query.projectId,
      repositoryUrl: req.query.repositoryUrl,
      repositoryFullName: req.query.repositoryFullName
    })

    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})

export default router
