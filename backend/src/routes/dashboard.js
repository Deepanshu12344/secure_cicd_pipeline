import express from 'express';

const router = express.Router();

// Get dashboard metrics
router.get('/', (req, res) => {
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
      averageRiskScore: 6.2
    }
  });
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

export default router;
