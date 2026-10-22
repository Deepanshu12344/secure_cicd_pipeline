import express from 'express';
import { getLatestCiDashboardStatus } from '../utils/ciDashboardStore.js';
import { protect, requireRole } from '../middleware/authMiddleware.js';
import { getAllFeedbackForTraining } from '../utils/feedbackStore.js';

const router = express.Router();
const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:5001';

// Get dashboard metrics
router.get('/', async (req, res, next) => {
  try {
    const latestCiStatus = await getLatestCiDashboardStatus({
      projectId: req.query.projectId,
      repositoryUrl: req.query.repositoryUrl,
      repositoryFullName: req.query.repositoryFullName
    })

    res.json({
    success: true,
    data: {
      totalProjects: 24,
      activeScans: 5,
      criticalRisks: 3,
      highRisks: 12,
      mediumRisks: 45,
      lowRisks: 89,
      falsePositives: 2,
      scansCompleted: 156,
      pipelineSuccessRate: 94.5,
      averageRiskScore: 6.2,
      latestCiStatus
    }
  });
  } catch (error) {
    next(error)
  }
});

// Get risk trends
router.get('/risks/trend', (req, res) => {
  res.json({
    success: true,
    data: {
      labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'],
      critical: [2, 3, 2, 1, 3],
      high: [8, 10, 9, 12, 15],
      medium: [40, 45, 48, 50, 42],
      low: [85, 88, 92, 95, 89]
    }
  });
});

// Get scan statistics
router.get('/scans/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      totalScans: 156,
      successfulScans: 147,
      failedScans: 9,
      averageScanDuration: 8.5,
      lastScanTime: new Date().toISOString()
    }
  });
});

// Get vulnerabilities by type
router.get('/vulnerabilities/types', (req, res) => {
  res.json({
    success: true,
    data: {
      'SQL Injection': 15,
      'Cross-Site Scripting (XSS)': 28,
      'Insecure Dependencies': 42,
      'Authentication Bypass': 8,
      'Data Exposure': 12,
      'Configuration Issues': 35
    }
  });
});

router.get('/ci-status', async (req, res, next) => {
  try {
    const data = await getLatestCiDashboardStatus({
      projectId: req.query.projectId,
      repositoryUrl: req.query.repositoryUrl,
      repositoryFullName: req.query.repositoryFullName
    })

    res.json({
      success: true,
      data
    })
  } catch (error) {
    next(error)
  }
})

// Get ML Model KPIs, False Positive Rate trends, and version history
router.get('/model/metrics', async (req, res, next) => {
  try {
    let mlInfo = {
      active_version: 'v1',
      confidence: 'bootstrap',
      data_provenance: {
        total_samples: 60,
        seed_samples: 60,
        real_feedback_samples: 0,
        disclaimer: 'Synthetic bootstrap baseline'
      },
      current_metrics: { f1: 0.95, fpr: 0.05 },
      version_history: []
    }

    try {
      const mlRes = await fetch(`${ML_ENGINE_URL}/api/model/info`)
      if (mlRes.ok) {
        const mlJson = await mlRes.json()
        mlInfo = mlJson.data || mlInfo
      }
    } catch (err) {
      console.warn('[DashboardMetrics] ML engine info call failed:', err.message)
    }

    // Query feedback store to compute real production stats
    const allFeedback = await getAllFeedbackForTraining()
    const realFeedback = allFeedback.filter((f) => f.source !== 'seed')
    const confirmedCount = realFeedback.filter((f) => f.label === 'confirmed').length
    const fpCount = realFeedback.filter((f) => f.label === 'false_positive').length
    const totalReal = realFeedback.length
    const measuredFpr = totalReal > 0 ? Number((fpCount / totalReal).toFixed(4)) : 0.0

    // Compute FPR trend by grouping feedback into buckets
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    const buckets = [
      { label: '30d ago', start: now - 30 * dayMs, end: now - 21 * dayMs },
      { label: '21d ago', start: now - 21 * dayMs, end: now - 14 * dayMs },
      { label: '14d ago', start: now - 14 * dayMs, end: now - 7 * dayMs },
      { label: '7d ago', start: now - 7 * dayMs, end: now - 1 * dayMs },
      { label: 'Current', start: now - 1 * dayMs, end: now + dayMs }
    ]

    const trend = buckets.map((b) => {
      const inBucket = realFeedback.filter((f) => {
        const t = new Date(f.createdAt).getTime()
        return t >= b.start && t < b.end
      })
      const bFp = inBucket.filter((f) => f.label === 'false_positive').length
      const bTotal = inBucket.length
      const bFpr = bTotal > 0 ? Number((bFp / bTotal).toFixed(4)) : measuredFpr
      return {
        period: b.label,
        fpr: bFpr,
        totalFeedback: bTotal,
        falsePositives: bFp
      }
    })

    res.json({
      success: true,
      data: {
        activeVersion: mlInfo.active_version,
        confidence: mlInfo.confidence,
        dataProvenance: mlInfo.data_provenance,
        currentMetrics: mlInfo.current_metrics,
        coefficients: mlInfo.coefficients || {},
        versionHistory: mlInfo.version_history || [],
        realFeedbackStats: {
          total: totalReal,
          confirmed: confirmedCount,
          falsePositive: fpCount,
          measuredFpr
        },
        fprTrend: trend
      }
    })
  } catch (error) {
    next(error)
  }
})

// Trigger model retraining with anti-poisoning checks and promotion gating
router.post('/model/retrain', protect, requireRole('admin', 'lead', 'security_reviewer'), async (req, res, next) => {
  try {
    const allFeedback = await getAllFeedbackForTraining()
    const realFeedback = allFeedback.filter((f) => f.source !== 'seed')
    const confirmedCount = realFeedback.filter((f) => f.label === 'confirmed').length
    const fpCount = realFeedback.filter((f) => f.label === 'false_positive').length
    const force = Boolean(req.body.force || req.body.force_promote)

    // Anti-poisoning check: minimum counts per class required
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

    if (!mlRes.ok) {
      const errJson = await mlRes.json()
      return res.status(mlRes.status).json({
        success: false,
        error: errJson.error || 'ML engine retraining failed'
      })
    }

    const mlData = await mlRes.json()
    res.json({
      success: true,
      data: mlData.data
    })
  } catch (error) {
    next(error)
  }
})

export default router;
