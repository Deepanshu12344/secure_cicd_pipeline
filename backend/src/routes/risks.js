import express from 'express'
import mongoose from 'mongoose'
import { protect } from '../middleware/authMiddleware.js'
import Risk from '../models/Risk.js'
import Project from '../models/Project.js'
import Scan from '../models/Scan.js'

const router = express.Router()
const getOwnerId = (req) => req.user?._id || req.user?.id
const normalizeThreatType = (value) => {
  const raw = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*&\s*/g, ' & ')
    .trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (lower === 'complexity and maintainability' || lower === 'complexity & maintainability') {
    return 'Complexity & Maintainability'
  }
  return raw
}

const toResponse = (riskDoc) => ({
  id: String(riskDoc._id),
  ownerId: String(riskDoc.ownerId),
  projectId:
    typeof riskDoc.projectId === 'object' && riskDoc.projectId?._id
      ? String(riskDoc.projectId._id)
      : String(riskDoc.projectId),
  projectName:
    typeof riskDoc.projectId === 'object' && riskDoc.projectId?.name ? String(riskDoc.projectId.name) : null,
  projectFullName:
    typeof riskDoc.projectId === 'object' && riskDoc.projectId?.fullName ? String(riskDoc.projectId.fullName) : null,
  scanId: riskDoc.scanId ? String(riskDoc.scanId) : null,
  title: riskDoc.title,
  description: riskDoc.description || '',
  severity: riskDoc.severity || 'medium',
  riskScore: Number(riskDoc.riskScore || 0),
  file: riskDoc.file || null,
  line: riskDoc.line ?? null,
  status: riskDoc.status || 'open',
  notes: riskDoc.notes || '',
  source: riskDoc.source || 'manual',
  sourceIssueId: riskDoc.sourceIssueId || null,
  threatType: riskDoc.threatType || '',
  remediation: riskDoc.remediation || '',
  createdAt: riskDoc.createdAt,
  updatedAt: riskDoc.updatedAt
})

const buildDeduplicationKey = (risk) =>
  [
    String(risk.projectId || ''),
    String(risk.title || '').trim().toLowerCase(),
    String(risk.severity || '').trim().toLowerCase(),
    String(risk.file || '').trim().toLowerCase(),
    String(risk.line ?? ''),
    String(risk.source || '').trim().toLowerCase(),
    normalizeThreatType(risk.threatType).toLowerCase()
  ].join('|')

const toObjectId = (value) => (mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null)
const normalizeSeverity = (value) => {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'critical') return 'critical'
  if (normalized === 'high') return 'high'
  if (normalized === 'medium') return 'medium'
  return 'low'
}
const severityToScore = (severity) => {
  if (severity === 'critical') return 95
  if (severity === 'high') return 80
  if (severity === 'medium') return 55
  return 25
}

router.get('/', protect, async (req, res) => {
  const { severity, status, projectId, source } = req.query
  const ownerId = getOwnerId(req)
  const filter = { ownerId }
  const shouldDedupe = String(req.query.dedupe ?? 'true').toLowerCase() !== 'false'

  // Auto-clean orphaned scan-generated risks so Risks stays consistent with Scans.
  const ownerScanIds = await Scan.find({ ownerId }).distinct('_id')
  await Risk.deleteMany({
    ownerId,
    source: { $in: ['analyzer', 'cicd'] },
    $or: [{ scanId: null }, { scanId: { $nin: ownerScanIds } }]
  })

  if (severity) filter.severity = severity
  if (status) filter.status = status
  if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
    filter.projectId = projectId
  }
  if (source) {
    const sourceList = String(source)
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
    if (sourceList.length === 1) {
      filter.source = sourceList[0]
    } else if (sourceList.length > 1) {
      filter.source = { $in: sourceList }
    }
  }

  const riskDocs = await Risk.find(filter).populate('projectId', 'name fullName').sort({ updatedAt: -1 })
  const mapped = riskDocs.map((riskDoc) => ({
    ...toResponse(riskDoc),
    occurrenceCount: 1
  }))
  const deduped = []

  if (shouldDedupe) {
    const indexByKey = new Map()
    mapped.forEach((risk) => {
      const key = buildDeduplicationKey(risk)
      if (indexByKey.has(key)) {
        const idx = indexByKey.get(key)
        deduped[idx].occurrenceCount += 1
        return
      }
      indexByKey.set(key, deduped.length)
      deduped.push(risk)
    })
  } else {
    deduped.push(...mapped)
  }

  res.json({
    success: true,
    count: deduped.length,
    deduplicated: shouldDedupe,
    data: deduped
  })
})

router.post('/', protect, async (req, res) => {
  const { projectId, scanId, title, description, severity, riskScore, file, line } = req.body

  if (!projectId || !title) {
    return res.status(400).json({
      success: false,
      error: 'projectId and title are required'
    })
  }

  const projectObjectId = toObjectId(projectId)
  if (!projectObjectId) {
    return res.status(400).json({ success: false, error: 'Invalid projectId' })
  }

  const project = await Project.findOne({ _id: projectObjectId, ownerId: getOwnerId(req) })
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' })
  }

  let scanObjectId = null
  if (scanId) {
    scanObjectId = toObjectId(scanId)
    if (!scanObjectId) {
      return res.status(400).json({ success: false, error: 'Invalid scanId' })
    }

    const scan = await Scan.findOne({ _id: scanObjectId, ownerId: getOwnerId(req) })
    if (!scan) {
      return res.status(404).json({ success: false, error: 'Scan not found' })
    }
  }

  const risk = await Risk.create({
    ownerId: getOwnerId(req),
    projectId: projectObjectId,
    scanId: scanObjectId,
    title: String(title).trim(),
    description: description || '',
    severity: severity || 'medium',
    riskScore: riskScore ?? 5,
    file: file || null,
    line: line ?? null,
    status: 'open'
  })

  res.status(201).json({
    success: true,
    data: toResponse(risk)
  })
})

router.post('/sync-from-scan', protect, async (req, res) => {
  const ownerId = getOwnerId(req)
  const scanObjectId = toObjectId(req.body?.scanId)
  if (!scanObjectId) {
    return res.status(400).json({ success: false, error: 'Invalid scanId' })
  }

  const scan = await Scan.findOne({ _id: scanObjectId, ownerId })
  if (!scan) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  const project = await Project.findOne({ _id: scan.projectId, ownerId })
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' })
  }

  const findings = Array.isArray(scan.findings) ? scan.findings : []
  await Risk.deleteMany({
    ownerId,
    scanId: scanObjectId,
    source: { $in: ['analyzer', 'cicd'] }
  })

  const docs = findings
    .map((finding) => {
      const title = String(finding?.issue || finding?.title || '').trim()
      if (!title) return null

      const severity = normalizeSeverity(finding?.severity)
      const locationText = String(finding?.location || '')
      const match = locationText.match(/:(\d+)(?!.*:\d+)/)
      const line = match ? Number(match[1]) : null
      const fileFromLocation = match ? locationText.slice(0, match.index) : locationText
      const file = String(finding?.file || '').trim() || (fileFromLocation && !fileFromLocation.includes(' ') ? fileFromLocation : null)
      const source = String(finding?.source || '').toLowerCase() === 'cicd' ? 'cicd' : 'analyzer'

      return {
        ownerId,
        projectId: project._id,
        scanId: scanObjectId,
        title,
        description: String(finding?.reason || ''),
        severity,
        riskScore: severityToScore(severity),
        file,
        line,
        status: 'open',
        source,
        sourceIssueId: String(finding?.sourceIssueId || finding?.id || '') || null,
        threatType: normalizeThreatType(finding?.threat_type || finding?.category_label || finding?.category || ''),
        remediation: String(finding?.remediation || '')
      }
    })
    .filter(Boolean)

  if (docs.length > 0) {
    await Risk.insertMany(docs, { ordered: false })
  }

  const synced = await Risk.find({ ownerId, scanId: scanObjectId }).sort({ updatedAt: -1 })
  res.json({
    success: true,
    count: synced.length,
    data: synced.map(toResponse)
  })
})

router.get('/project/:projectId/details', protect, async (req, res) => {
  const ownerId = getOwnerId(req)
  const { projectId } = req.params
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    return res.status(404).json({ success: false, error: 'Project not found' })
  }

  const project = await Project.findOne({ _id: projectId, ownerId }).select('name fullName')
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found' })
  }

  const riskDocs = await Risk.find({ ownerId, projectId }).populate('projectId', 'name fullName').sort({ updatedAt: -1 })
  const items = riskDocs.map(toResponse)
  const summary = items.reduce(
    (acc, risk) => {
      const severity = String(risk.severity || '').toLowerCase()
      if (severity === 'critical') acc.critical += 1
      else if (severity === 'high') acc.high += 1
      else if (severity === 'medium') acc.medium += 1
      else acc.low += 1
      return acc
    },
    { total: items.length, critical: 0, high: 0, medium: 0, low: 0 }
  )

  res.json({
    success: true,
    data: {
      project: {
        id: String(project._id),
        name: project.name || '',
        fullName: project.fullName || ''
      },
      summary,
      occurrences: items
    }
  })
})

router.get('/:id/details', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Risk not found' })
  }

  const ownerId = getOwnerId(req)
  const risk = await Risk.findOne({ _id: req.params.id, ownerId }).populate('projectId', 'name fullName')
  if (!risk) {
    return res.status(404).json({ success: false, error: 'Risk not found' })
  }

  const matchFilter = {
    ownerId,
    projectId: risk.projectId?._id || risk.projectId,
    title: risk.title,
    severity: risk.severity,
    file: risk.file,
    line: risk.line,
    source: risk.source,
    threatType: risk.threatType
  }

  const occurrences = await Risk.find(matchFilter).populate('projectId', 'name fullName').sort({ updatedAt: -1 })
  const occurrenceItems = occurrences.map(toResponse)

  res.json({
    success: true,
    data: {
      risk: toResponse(risk),
      totalOccurrences: occurrenceItems.length,
      occurrences: occurrenceItems
    }
  })
})

router.get('/:id', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Risk not found' })
  }

  const risk = await Risk.findOne({ _id: req.params.id, ownerId: getOwnerId(req) })
  if (!risk) {
    return res.status(404).json({ success: false, error: 'Risk not found' })
  }

  res.json({ success: true, data: toResponse(risk) })
})

router.patch('/:id', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Risk not found' })
  }

  const risk = await Risk.findOne({ _id: req.params.id, ownerId: getOwnerId(req) })
  if (!risk) {
    return res.status(404).json({ success: false, error: 'Risk not found' })
  }

  const { status, notes } = req.body

  if (status) risk.status = status
  if (notes !== undefined) risk.notes = String(notes || '')

  await risk.save()

  res.json({
    success: true,
    data: toResponse(risk)
  })
})

export default router
