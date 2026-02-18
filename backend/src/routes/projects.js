import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
const projects = new Map();

const toResponse = (project) => ({
  ...project,
  isPrivate: Boolean(project.isPrivate),
  stars: Number(project.stars || 0),
  forks: Number(project.forks || 0)
});

const getUserProjects = (userId) =>
  Array.from(projects.values())
    .filter((project) => project.ownerId === userId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

router.get('/', protect, (req, res) => {
  const projectArray = getUserProjects(req.user.id).map(toResponse);
  res.json({
    success: true,
    count: projectArray.length,
    data: projectArray
  });
});

router.post('/', protect, (req, res) => {
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
  } = req.body;

  if (!name || !repositoryUrl) {
    return res.status(400).json({
      success: false,
      error: 'name and repositoryUrl are required'
    });
  }

  const now = new Date();
  const project = {
    id: uuidv4(),
    ownerId: req.user.id,
    name: String(name).trim(),
    fullName: fullName ? String(fullName).trim() : String(name).trim(),
    description: description || '',
    repositoryUrl,
    repositoryType: repositoryType || 'github',
    language: language || 'unknown',
    githubRepoId: githubRepoId || null,
    isPrivate: Boolean(isPrivate),
    stars: Number(stars || 0),
    forks: Number(forks || 0),
    createdAt: now,
    updatedAt: now,
    lastScan: null,
    riskScore: 0,
    status: 'active'
  };

  projects.set(project.id, project);

  res.status(201).json({
    success: true,
    data: toResponse(project)
  });
});

router.post('/import/github', protect, (req, res) => {
  const { repo } = req.body;

  if (!repo?.id || !repo?.name || !repo?.htmlUrl) {
    return res.status(400).json({
      success: false,
      error: 'repo.id, repo.name, and repo.htmlUrl are required'
    });
  }

  const existing = getUserProjects(req.user.id).find(
    (project) => project.githubRepoId === String(repo.id)
  );

  if (existing) {
    return res.json({
      success: true,
      message: 'Repository already imported',
      data: toResponse(existing)
    });
  }

  const now = new Date();
  const project = {
    id: uuidv4(),
    ownerId: req.user.id,
    name: repo.name,
    fullName: repo.fullName || repo.name,
    description: repo.description || '',
    repositoryUrl: repo.htmlUrl,
    repositoryType: 'github',
    language: repo.language || 'unknown',
    githubRepoId: String(repo.id),
    isPrivate: Boolean(repo.private),
    stars: Number(repo.stars || 0),
    forks: Number(repo.forks || 0),
    createdAt: now,
    updatedAt: now,
    lastScan: null,
    riskScore: 0,
    status: 'active'
  };

  projects.set(project.id, project);

  res.status(201).json({
    success: true,
    message: 'Repository imported successfully',
    data: toResponse(project)
  });
});

router.get('/:id', protect, (req, res) => {
  const project = projects.get(req.params.id);

  if (!project || project.ownerId !== req.user.id) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }

  res.json({
    success: true,
    data: toResponse(project)
  });
});

router.patch('/:id', protect, (req, res) => {
  const project = projects.get(req.params.id);

  if (!project || project.ownerId !== req.user.id) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }

  const { name, description, riskScore, status } = req.body;

  if (name) project.name = String(name).trim();
  if (description !== undefined) project.description = String(description || '');
  if (riskScore !== undefined) project.riskScore = riskScore;
  if (status) project.status = status;
  project.updatedAt = new Date();

  projects.set(req.params.id, project);

  res.json({
    success: true,
    data: toResponse(project)
  });
});

router.delete('/:id', protect, (req, res) => {
  const project = projects.get(req.params.id);
  if (!project || project.ownerId !== req.user.id) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }

  projects.delete(req.params.id);

  res.json({
    success: true,
    message: 'Project deleted successfully'
  });
});

export default router;
