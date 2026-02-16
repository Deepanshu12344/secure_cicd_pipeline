import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Mock data storage
const scans = new Map();

// Get all scans
router.get('/', (req, res) => {
  const scanArray = Array.from(scans.values());
  res.json({
    success: true,
    count: scanArray.length,
    data: scanArray
  });
});

// Create new scan
router.post('/', (req, res) => {
  const { projectId, repositoryUrl, scanType, branch } = req.body;
  
  if (!projectId || !repositoryUrl) {
    return res.status(400).json({
      success: false,
      error: 'projectId and repositoryUrl are required'
    });
  }

  const scan = {
    id: uuidv4(),
    projectId,
    repositoryUrl,
    scanType: scanType || 'full',
    branch: branch || 'main',
    status: 'queued',
    progress: 0,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null,
    findings: []
  };

  scans.set(scan.id, scan);

  res.status(201).json({
    success: true,
    data: scan
  });
});

// Get scan by ID
router.get('/:id', (req, res) => {
  const scan = scans.get(req.params.id);
  
  if (!scan) {
    return res.status(404).json({
      success: false,
      error: 'Scan not found'
    });
  }

  res.json({
    success: true,
    data: scan
  });
});

// Update scan status
router.patch('/:id', (req, res) => {
  const scan = scans.get(req.params.id);
  
  if (!scan) {
    return res.status(404).json({
      success: false,
      error: 'Scan not found'
    });
  }

  const { status, progress, findings } = req.body;
  
  if (status) scan.status = status;
  if (progress !== undefined) scan.progress = progress;
  if (findings) scan.findings = findings;
  
  if (status === 'running' && !scan.startedAt) {
    scan.startedAt = new Date();
  }
  if (status === 'completed') {
    scan.completedAt = new Date();
  }

  scans.set(req.params.id, scan);

  res.json({
    success: true,
    data: scan
  });
});

// Delete scan
router.delete('/:id', (req, res) => {
  if (!scans.has(req.params.id)) {
    return res.status(404).json({
      success: false,
      error: 'Scan not found'
    });
  }

  scans.delete(req.params.id);

  res.json({
    success: true,
    message: 'Scan deleted successfully'
  });
});

export default router;
