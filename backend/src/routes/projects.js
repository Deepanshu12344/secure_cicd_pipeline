import express from 'express'
import mongoose from 'mongoose'
import { protect } from '../middleware/authMiddleware.js'
import Project from '../models/Project.js'

const router = express.Router()

const getOwnerId = (req) => req.user?._id || req.user?.id

const toResponse = (projectDoc) => ({
  id: String(projectDoc._id),
  ownerId: String(projectDoc.ownerId),
  name: projectDoc.name,
  fullName: projectDoc.fullName,
  description: projectDoc.description || '',
  repositoryUrl: projectDoc.repositoryUrl,
  repositoryType: projectDoc.repositoryType || 'github',
  language: projectDoc.language || 'unknown',
  githubRepoId: projectDoc.githubRepoId || null,
  isPrivate: Boolean(projectDoc.isPrivate),
  stars: Number(projectDoc.stars || 0),
  forks: Number(projectDoc.forks || 0),
  createdAt: projectDoc.createdAt,
  updatedAt: projectDoc.updatedAt,
  lastScan: projectDoc.lastScan || null,
  riskScore: Number(projectDoc.riskScore || 0),
  status: projectDoc.status || 'active'
})

router.get('/', protect, async (req, res) => {
  const ownerId = getOwnerId(req)
  const projectDocs = await Project.find({ ownerId }).sort({ updatedAt: -1 })

  res.json({
    success: true,
    count: projectDocs.length,
    data: projectDocs.map(toResponse)
  })
})

router.post('/', protect, async (req, res) => {
  const ownerId = getOwnerId(req)
  const {
    name,
    description,
    repositoryUrl,
    repositoryType,
    language,
    isPrivate,
    stars,
    forks,
    githubRepoId,
    fullName
  } = req.body

  if (!name || !repositoryUrl) {
    return res.status(400).json({
      success: false,
      error: 'name and repositoryUrl are required'
    })
  }

  let project
  try {
    project = await Project.create({
      ownerId,
      name: String(name).trim(),
      fullName: fullName ? String(fullName).trim() : String(name).trim(),
      description: description || '',
      repositoryUrl: String(repositoryUrl).trim(),
      repositoryType: repositoryType || 'github',
      language: language || 'unknown',
      githubRepoId: githubRepoId ? String(githubRepoId) : null,
      isPrivate: Boolean(isPrivate),
      stars: Number(stars || 0),
      forks: Number(forks || 0),
      status: 'active'
    })
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Repository already imported'
      })
    }
    throw error
  }

  res.status(201).json({
    success: true,
    data: toResponse(project)
  })
})

router.post('/import/github', protect, async (req, res) => {
  const ownerId = getOwnerId(req)
  const { repo } = req.body

  if (!repo?.id || !repo?.name || !repo?.htmlUrl) {
    return res.status(400).json({
      success: false,
      error: 'repo.id, repo.name, and repo.htmlUrl are required'
    })
  }

  const repoId = String(repo.id)

  const existing = await Project.findOne({
    ownerId,
    githubRepoId: repoId
  })

  if (existing) {
    return res.json({
      success: true,
      message: 'Repository already imported',
      data: toResponse(existing)
    })
  }

  let project
  try {
    project = await Project.create({
      ownerId,
      name: repo.name,
      fullName: repo.fullName || repo.name,
      description: repo.description || '',
      repositoryUrl: repo.htmlUrl,
      repositoryType: 'github',
      language: repo.language || 'unknown',
      githubRepoId: repoId,
      isPrivate: Boolean(repo.private),
      stars: Number(repo.stars || 0),
      forks: Number(repo.forks || 0),
      status: 'active'
    })
  } catch (error) {
    if (error?.code === 11000) {
      const alreadyImported = await Project.findOne({
        ownerId,
        githubRepoId: repoId
      })

      return res.json({
        success: true,
        message: 'Repository already imported',
        data: alreadyImported ? toResponse(alreadyImported) : null
      })
    }
    throw error
  }

  res.status(201).json({
    success: true,
    message: 'Repository imported successfully',
    data: toResponse(project)
  })
})

router.get('/:id', protect, async (req, res) => {
  const ownerId = getOwnerId(req)
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    })
  }

  const project = await Project.findOne({
    _id: req.params.id,
    ownerId
  })

  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    })
  }

  res.json({
    success: true,
    data: toResponse(project)
  })
})

router.patch('/:id', protect, async (req, res) => {
  const ownerId = getOwnerId(req)
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    })
  }

  const { name, description, riskScore, status } = req.body
  const updates = {}

  if (name) updates.name = String(name).trim()
  if (description !== undefined) updates.description = String(description || '')
  if (riskScore !== undefined) updates.riskScore = Number(riskScore)
  if (status) updates.status = status

  const project = await Project.findOneAndUpdate(
    { _id: req.params.id, ownerId },
    { $set: updates },
    { new: true }
  )

  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    })
  }

  res.json({
    success: true,
    data: toResponse(project)
  })
})

router.delete('/:id', protect, async (req, res) => {
  const ownerId = getOwnerId(req)
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    })
  }

  const deleted = await Project.findOneAndDelete({
    _id: req.params.id,
    ownerId
  })

  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    })
  }

  res.json({
    success: true,
    message: 'Project deleted successfully'
  })
})

export default router
