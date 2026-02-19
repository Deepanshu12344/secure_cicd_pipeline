import express from 'express'
import mongoose from 'mongoose'
import { protect } from '../middleware/authMiddleware.js'
import Pipeline from '../models/Pipeline.js'
import Project from '../models/Project.js'

const router = express.Router()
const getOwnerId = (req) => req.user?._id || req.user?.id

const toResponse = (pipelineDoc) => ({
  id: String(pipelineDoc._id),
  ownerId: String(pipelineDoc.ownerId),
  projectId: String(pipelineDoc.projectId),
  name: pipelineDoc.name || 'Default Pipeline',
  stages: Array.isArray(pipelineDoc.stages) ? pipelineDoc.stages : [],
  riskThreshold: pipelineDoc.riskThreshold || { critical: 0, high: 5 },
  enabled: Boolean(pipelineDoc.enabled),
  createdAt: pipelineDoc.createdAt,
  updatedAt: pipelineDoc.updatedAt
})

router.get('/', protect, async (req, res) => {
  const filter = { ownerId: getOwnerId(req) }

  if (req.query.projectId && mongoose.Types.ObjectId.isValid(req.query.projectId)) {
    filter.projectId = req.query.projectId
  }

  const pipelineDocs = await Pipeline.find(filter).sort({ updatedAt: -1 })

  res.json({
    success: true,
    count: pipelineDocs.length,
    data: pipelineDocs.map(toResponse)
  })
})

router.post('/', protect, async (req, res) => {
  const { projectId, name, stages, riskThreshold } = req.body

  if (!projectId) {
    return res.status(400).json({
      success: false,
      error: 'projectId is required'
    })
  }

  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid projectId'
    })
  }

  const project = await Project.findOne({ _id: projectId, ownerId: getOwnerId(req) })
  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    })
  }

  let pipeline
  try {
    pipeline = await Pipeline.create({
      ownerId: getOwnerId(req),
      projectId,
      name: name || 'Default Pipeline',
      stages: Array.isArray(stages) && stages.length > 0 ? stages : ['scan', 'analyze', 'decide'],
      riskThreshold: riskThreshold || { critical: 0, high: 5 },
      enabled: true
    })
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await Pipeline.findOne({ ownerId: getOwnerId(req), projectId })
      return res.json({
        success: true,
        message: 'Pipeline already exists for this project',
        data: existing ? toResponse(existing) : null
      })
    }
    throw error
  }

  res.status(201).json({
    success: true,
    data: toResponse(pipeline)
  })
})

router.get('/:id', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({
      success: false,
      error: 'Pipeline not found'
    })
  }

  const pipeline = await Pipeline.findOne({ _id: req.params.id, ownerId: getOwnerId(req) })
  if (!pipeline) {
    return res.status(404).json({
      success: false,
      error: 'Pipeline not found'
    })
  }

  res.json({
    success: true,
    data: toResponse(pipeline)
  })
})

router.patch('/:id', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({
      success: false,
      error: 'Pipeline not found'
    })
  }

  const pipeline = await Pipeline.findOne({ _id: req.params.id, ownerId: getOwnerId(req) })
  if (!pipeline) {
    return res.status(404).json({
      success: false,
      error: 'Pipeline not found'
    })
  }

  const { stages, riskThreshold, enabled, name } = req.body

  if (Array.isArray(stages)) pipeline.stages = stages
  if (riskThreshold) pipeline.riskThreshold = riskThreshold
  if (enabled !== undefined) pipeline.enabled = Boolean(enabled)
  if (name) pipeline.name = String(name).trim()

  await pipeline.save()

  res.json({
    success: true,
    data: toResponse(pipeline)
  })
})

export default router
