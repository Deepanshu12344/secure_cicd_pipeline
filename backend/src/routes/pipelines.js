import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Mock data
const pipelines = new Map();

// Get all pipelines
router.get('/', (req, res) => {
  const pipelineArray = Array.from(pipelines.values());
  res.json({
    success: true,
    count: pipelineArray.length,
    data: pipelineArray
  });
});

// Create pipeline config
router.post('/', (req, res) => {
  const { projectId, name, stages, riskThreshold } = req.body;
  
  const pipeline = {
    id: uuidv4(),
    projectId,
    name: name || 'Default Pipeline',
    stages: stages || ['scan', 'analyze', 'decide'],
    riskThreshold: riskThreshold || { critical: 0, high: 5 },
    enabled: true,
    createdAt: new Date()
  };

  pipelines.set(pipeline.id, pipeline);

  res.status(201).json({
    success: true,
    data: pipeline
  });
});

// Get pipeline by ID
router.get('/:id', (req, res) => {
  const pipeline = pipelines.get(req.params.id);
  
  if (!pipeline) {
    return res.status(404).json({
      success: false,
      error: 'Pipeline not found'
    });
  }

  res.json({
    success: true,
    data: pipeline
  });
});

// Update pipeline
router.patch('/:id', (req, res) => {
  const pipeline = pipelines.get(req.params.id);
  
  if (!pipeline) {
    return res.status(404).json({
      success: false,
      error: 'Pipeline not found'
    });
  }

  const { stages, riskThreshold, enabled } = req.body;
  
  if (stages) pipeline.stages = stages;
  if (riskThreshold) pipeline.riskThreshold = riskThreshold;
  if (enabled !== undefined) pipeline.enabled = enabled;

  pipelines.set(req.params.id, pipeline);

  res.json({
    success: true,
    data: pipeline
  });
});

export default router;
