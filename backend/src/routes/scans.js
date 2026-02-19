import express from 'express'
import mongoose from 'mongoose'
import { protect } from '../middleware/authMiddleware.js'
import Scan from '../models/Scan.js'
import Project from '../models/Project.js'

const router = express.Router()
const getOwnerId = (req) => req.user?._id || req.user?.id

const toResponse = (scanDoc) => ({
  id: String(scanDoc._id),
  ownerId: String(scanDoc.ownerId),
  projectId: String(scanDoc.projectId),
  repositoryUrl: scanDoc.repositoryUrl,
  scanType: scanDoc.scanType || 'full',
  branch: scanDoc.branch || 'main',
  status: scanDoc.status || 'queued',
  progress: Number(scanDoc.progress || 0),
  startedAt: scanDoc.startedAt || null,
  completedAt: scanDoc.completedAt || null,
  findings: Array.isArray(scanDoc.findings) ? scanDoc.findings : [],
  createdAt: scanDoc.createdAt,
  updatedAt: scanDoc.updatedAt
})

const validateOwnedProject = async (ownerId, projectId) => {
  if (!mongoose.Types.ObjectId.isValid(projectId)) return null
  return Project.findOne({ _id: projectId, ownerId })
}

router.get('/', protect, async (req, res) => {
  const filter = { ownerId: getOwnerId(req) }
  if (req.query.projectId && mongoose.Types.ObjectId.isValid(req.query.projectId)) {
    filter.projectId = req.query.projectId
  }

  const scanDocs = await Scan.find(filter).sort({ createdAt: -1 })
  res.json({
    success: true,
    count: scanDocs.length,
    data: scanDocs.map(toResponse)
  })
})

router.post('/', protect, async (req, res) => {
  const ownerId = getOwnerId(req)
  const { projectId, repositoryUrl, scanType, branch } = req.body

  if (!projectId || !repositoryUrl) {
    return res.status(400).json({
      success: false,
      error: 'projectId and repositoryUrl are required'
    })
  }

  const project = await validateOwnedProject(ownerId, projectId)
  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    })
  }

  const scan = await Scan.create({
    ownerId,
    projectId,
    repositoryUrl: String(repositoryUrl).trim(),
    scanType: scanType || 'full',
    branch: branch || 'main',
    status: 'queued',
    progress: 0,
    findings: []
  })

  res.status(201).json({
    success: true,
    data: toResponse(scan)
  })
})

router.get('/:id', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  const scan = await Scan.findOne({ _id: req.params.id, ownerId: getOwnerId(req) })
  if (!scan) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  res.json({ success: true, data: toResponse(scan) })
})

router.patch('/:id', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  const scan = await Scan.findOne({ _id: req.params.id, ownerId: getOwnerId(req) })
  if (!scan) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  const { status, progress, findings } = req.body

  if (status) scan.status = status
  if (progress !== undefined) scan.progress = Number(progress)
  if (findings !== undefined) scan.findings = Array.isArray(findings) ? findings : scan.findings

  if (status === 'running' && !scan.startedAt) {
    scan.startedAt = new Date()
  }
  if (status === 'completed') {
    scan.completedAt = new Date()
  }

  await scan.save()

  res.json({
    success: true,
    data: toResponse(scan)
  })
})

router.delete('/:id', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  const deleted = await Scan.findOneAndDelete({ _id: req.params.id, ownerId: getOwnerId(req) })
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  res.json({
    success: true,
    message: 'Scan deleted successfully'
  })
})

export default router
