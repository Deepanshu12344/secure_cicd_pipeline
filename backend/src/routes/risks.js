import express from 'express'
import mongoose from 'mongoose'
import { protect } from '../middleware/authMiddleware.js'
import Risk from '../models/Risk.js'
import Project from '../models/Project.js'
import Scan from '../models/Scan.js'

const router = express.Router()
const getOwnerId = (req) => req.user?._id || req.user?.id

const toResponse = (riskDoc) => ({
  id: String(riskDoc._id),
  ownerId: String(riskDoc.ownerId),
  projectId: String(riskDoc.projectId),
  scanId: riskDoc.scanId ? String(riskDoc.scanId) : null,
  title: riskDoc.title,
  description: riskDoc.description || '',
  severity: riskDoc.severity || 'medium',
  riskScore: Number(riskDoc.riskScore || 0),
  file: riskDoc.file || null,
  line: riskDoc.line ?? null,
  status: riskDoc.status || 'open',
  notes: riskDoc.notes || '',
  createdAt: riskDoc.createdAt,
  updatedAt: riskDoc.updatedAt
})

const toObjectId = (value) => (mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null)

router.get('/', protect, async (req, res) => {
  const { severity, status, projectId } = req.query
  const filter = { ownerId: getOwnerId(req) }

  if (severity) filter.severity = severity
  if (status) filter.status = status
  if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
    filter.projectId = projectId
  }

  const riskDocs = await Risk.find(filter).sort({ updatedAt: -1 })

  res.json({
    success: true,
    count: riskDocs.length,
    data: riskDocs.map(toResponse)
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
