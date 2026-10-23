import express from 'express'
import { protect, requireRole } from '../middleware/authMiddleware.js'
import { getAllFeedbackForTraining } from '../utils/feedbackStore.js'

const router = express.Router()
const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:5001'

router.get('/info', async (req, res, next) => {
  try {
    const mlRes = await fetch(`${ML_ENGINE_URL}/api/model/info`)
    if (mlRes.ok) {
      const mlData = await mlRes.json()
      return res.json(mlData)
    }
    return res.status(mlRes.status).json({ success: false, error: 'ML engine returned error' })
  } catch (err) {
    return res.status(503).json({ success: false, error: 'ML engine unavailable: ' + err.message })
  }
})

router.post('/retrain', protect, requireRole('admin', 'lead', 'security_reviewer'), async (req, res, next) => {
  try {
    const allFeedback = await getAllFeedbackForTraining()
    const realFeedback = allFeedback.filter((f) => f.source !== 'seed')
    const confirmedCount = realFeedback.filter((f) => f.label === 'confirmed').length
    const fpCount = realFeedback.filter((f) => f.label === 'false_positive').length
    const force = Boolean(req.body.force || req.body.force_promote)

    if (force) {
      if (process.env.ALLOW_FORCE_RETRAIN !== 'true') {
        return res.status(403).json({
          success: false,
          error: 'Force retrain is disabled. ALLOW_FORCE_RETRAIN=true must be explicitly configured in the environment.'
        })
      }
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Force retrain is restricted to administrators only.'
        })
      }
      console.info(
        `[AUDIT] Force retrain executed by user=${req.user?.username || req.user?.email || 'admin'} role=${req.user?.role} reason=${req.body?.reason || 'unspecified'}`
      )
    }

    if (!force && (confirmedCount < 3 || fpCount < 3)) {
      return res.status(400).json({
        success: false,
        error: `Insufficient real training feedback: Found ${confirmedCount} confirmed and ${fpCount} false_positive samples. Retraining requires at least 3 samples per class to prevent dataset skew.`
      })
    }

    const mlRes = await fetch(`${ML_ENGINE_URL}/api/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feedback: realFeedback,
        force_promote: force
      })
    })

    const mlData = await mlRes.json()
    if (!mlRes.ok) {
      return res.status(mlRes.status).json(mlData)
    }

    res.json(mlData)
  } catch (err) {
    res.status(503).json({ success: false, error: 'ML engine error: ' + err.message })
  }
})

router.post('/rollback', protect, requireRole('admin', 'lead'), async (req, res, next) => {
  try {
    const { version } = req.body || {}
    if (!version) {
      return res.status(400).json({ success: false, error: 'Version string is required' })
    }

    const mlRes = await fetch(`${ML_ENGINE_URL}/api/model/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version })
    })

    const mlData = await mlRes.json()
    if (!mlRes.ok) {
      return res.status(mlRes.status).json(mlData)
    }

    res.json(mlData)
  } catch (err) {
    res.status(503).json({ success: false, error: 'ML engine error: ' + err.message })
  }
})

export default router
