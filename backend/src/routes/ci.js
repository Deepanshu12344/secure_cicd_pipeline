import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import ScanResult from '../models/ScanResult.js'

const router = express.Router()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsRoot = path.resolve(__dirname, '../../uploads/ci-reports')

const normalizeRepo = (value) => String(value || '').trim()
const parseOwnerRepo = (repository) => {
  const clean = normalizeRepo(repository)
  const parts = clean.split('/').filter(Boolean)
  if (parts.length >= 2) {
    return { owner: parts[0], repoName: parts[1] }
  }
  return { owner: '', repoName: clean }
}

const safeRepoFolder = (repository) =>
  normalizeRepo(repository).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'unknown'

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const repo = safeRepoFolder(req.body.repository || '')
    const dest = path.join(uploadsRoot, repo)
    fs.mkdirSync(dest, { recursive: true })
    cb(null, dest)
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now()
    const base = path.basename(file.originalname || 'scan-report.json')
    const safe = base.replace(/[^a-zA-Z0-9._-]+/g, '_')
    cb(null, `${timestamp}-${safe}`)
  }
})

const upload = multer({ storage })

const toNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const extractCounts = (report) => {
  const summary = report?.summary || {}
  return {
    riskScore: toNumber(report?.riskScore ?? report?.overall_risk_score ?? 0),
    critical: toNumber(report?.critical ?? summary.critical_count ?? 0),
    high: toNumber(report?.high ?? summary.high_count ?? 0),
    medium: toNumber(report?.medium ?? summary.medium_count ?? 0),
    low: toNumber(report?.low ?? summary.low_count ?? 0)
  }
}

router.post('/ingest', upload.single('report'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'report file is required' })
  }

  const repository = normalizeRepo(req.body.repository)
  if (!repository) {
    return res.status(400).json({ success: false, error: 'repository is required' })
  }

  let reportJson = null
  try {
    reportJson = JSON.parse(fs.readFileSync(req.file.path, 'utf8'))
  } catch (error) {
    return res.status(400).json({ success: false, error: `Invalid report JSON: ${error.message}` })
  }

  const { owner, repoName } = parseOwnerRepo(repository)
  const counts = extractCounts(reportJson)
  const vulnerabilities =
    reportJson?.vulnerabilities || reportJson?.issues || reportJson?.critical_issues || []

  const scan = await ScanResult.create({
    repository,
    owner,
    repoName,
    branch: String(req.body.branch || ''),
    commit: String(req.body.commit || ''),
    actor: String(req.body.actor || ''),
    runId: String(req.body.runId || ''),
    workflow: String(req.body.workflow || ''),
    riskScore: counts.riskScore,
    critical: counts.critical,
    high: counts.high,
    medium: counts.medium,
    low: counts.low,
    vulnerabilities,
    reportPath: req.file.path,
    reportFileName: path.basename(req.file.path),
    rawReport: reportJson?.rawReport || reportJson || null
  })

  return res.status(201).json({
    success: true,
    message: 'Scan report ingested',
    data: {
      id: String(scan._id),
      repository: scan.repository,
      createdAt: scan.createdAt
    }
  })
})

router.get('/projects', async (_req, res) => {
  const latest = await ScanResult.aggregate([
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$repository',
        repository: { $first: '$repository' },
        owner: { $first: '$owner' },
        repoName: { $first: '$repoName' },
        riskScore: { $first: '$riskScore' },
        critical: { $first: '$critical' },
        high: { $first: '$high' },
        medium: { $first: '$medium' },
        low: { $first: '$low' },
        lastScanAt: { $first: '$createdAt' },
        totalScans: { $sum: 1 }
      }
    },
    { $sort: { lastScanAt: -1 } }
  ])

  res.json({ success: true, data: latest })
})

router.get('/projects/:repo/scans', async (req, res) => {
  const repo = String(req.params.repo || '')
  if (!repo) {
    return res.status(400).json({ success: false, error: 'repository is required' })
  }
  const limit = Math.min(Number(req.query.limit || 20), 100)
  const scans = await ScanResult.find({ repository: repo }).sort({ createdAt: -1 }).limit(limit)
  res.json({ success: true, data: scans })
})

router.get('/report/:id', async (req, res) => {
  const id = String(req.params.id || '')
  const scan = await ScanResult.findById(id)
  if (!scan) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }
  const reportPath = scan.reportPath
  if (!reportPath || !fs.existsSync(reportPath)) {
    return res.status(404).json({ success: false, error: 'Report not found' })
  }
  res.download(reportPath, scan.reportFileName || path.basename(reportPath))
})

router.get('/summary', async (_req, res) => {
  const totalProjects = await ScanResult.distinct('repository').then((items) => items.length)
  const totalScans = await ScanResult.countDocuments()

  const recent = await ScanResult.find().sort({ createdAt: -1 }).limit(200)
  const criticalRisks = recent.reduce((sum, scan) => sum + (scan.critical || 0), 0)
  const successRate =
    totalScans === 0
      ? 100
      : Math.round(
          (recent.filter((scan) => Number(scan.riskScore || 0) < 80).length / Math.max(recent.length, 1)) * 1000
        ) / 10

  const trendBuckets = {}
  recent.forEach((scan) => {
    const date = new Date(scan.createdAt)
    const key = `${date.getUTCFullYear()}-W${Math.ceil((date.getUTCDate() + 6 - date.getUTCDay()) / 7)}`
    if (!trendBuckets[key]) {
      trendBuckets[key] = { critical: 0, high: 0, medium: 0, low: 0 }
    }
    trendBuckets[key].critical += scan.critical || 0
    trendBuckets[key].high += scan.high || 0
    trendBuckets[key].medium += scan.medium || 0
    trendBuckets[key].low += scan.low || 0
  })

  const riskTrend = Object.entries(trendBuckets)
    .map(([week, counts]) => ({ week, ...counts }))
    .slice(0, 8)

  const vulnTypeCounts = {}
  recent.forEach((scan) => {
    const vulns = Array.isArray(scan.vulnerabilities) ? scan.vulnerabilities : []
    vulns.forEach((vuln) => {
      const type = String(vuln?.threat_type || vuln?.category_label || vuln?.category || 'Other')
      vulnTypeCounts[type] = (vulnTypeCounts[type] || 0) + 1
    })
  })

  const vulnTypes = Object.entries(vulnTypeCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  res.json({
    success: true,
    data: {
      metrics: {
        totalProjects,
        totalScans,
        activeScans: 0,
        criticalRisks,
        successRate
      },
      riskTrend,
      vulnTypes
    }
  })
})

export default router
