import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Mock data storage
const projects = new Map();

// Get all projects
router.get('/', (req, res) => {
  const projectArray = Array.from(projects.values());
  res.json({
    success: true,
    count: projectArray.length,
    data: projectArray
  });
});

// Create new project
router.post('/', (req, res) => {
  const { name, description, repositoryUrl, repositoryType, language } = req.body;
  
  if (!name || !repositoryUrl) {
    return res.status(400).json({
      success: false,
      error: 'name and repositoryUrl are required'
    });
  }

  const project = {
    id: uuidv4(),
    name,
    description: description || '',
    repositoryUrl,
    repositoryType: repositoryType || 'github',
    language: language || 'javascript',
    createdAt: new Date(),
    lastScan: null,
    riskScore: 0,
    status: 'active'
  };

  projects.set(project.id, project);

  res.status(201).json({
    success: true,
    data: project
  });
});

// Get project by ID
router.get('/:id', (req, res) => {
  const project = projects.get(req.params.id);
  
  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }

  res.json({
    success: true,
    data: project
  });
});

// Update project
router.patch('/:id', (req, res) => {
  const project = projects.get(req.params.id);
  
  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }

  const { name, description, riskScore, status } = req.body;
  
  if (name) project.name = name;
  if (description) project.description = description;
  if (riskScore !== undefined) project.riskScore = riskScore;
  if (status) project.status = status;

  projects.set(req.params.id, project);

  res.json({
    success: true,
    data: project
  });
});

// Delete project
router.delete('/:id', (req, res) => {
  if (!projects.has(req.params.id)) {
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
