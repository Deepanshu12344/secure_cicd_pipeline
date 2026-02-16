import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Mock data
const risks = new Map();

// Get all risks
router.get('/', (req, res) => {
  const { severity, status, projectId } = req.query;
  
  let riskArray = Array.from(risks.values());
  
  if (severity) {
    riskArray = riskArray.filter(r => r.severity === severity);
  }
  if (status) {
    riskArray = riskArray.filter(r => r.status === status);
  }
  if (projectId) {
    riskArray = riskArray.filter(r => r.projectId === projectId);
  }

  res.json({
    success: true,
    count: riskArray.length,
    data: riskArray
  });
});

// Create risk
router.post('/', (req, res) => {
  const { projectId, title, description, severity, riskScore, file, line } = req.body;
  
  const risk = {
    id: uuidv4(),
    projectId,
    title,
    description,
    severity: severity || 'medium',
    riskScore: riskScore || 5,
    file,
    line,
    status: 'open',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  risks.set(risk.id, risk);

  res.status(201).json({
    success: true,
    data: risk
  });
});

// Get risk by ID
router.get('/:id', (req, res) => {
  const risk = risks.get(req.params.id);
  
  if (!risk) {
    return res.status(404).json({
      success: false,
      error: 'Risk not found'
    });
  }

  res.json({
    success: true,
    data: risk
  });
});

// Update risk
router.patch('/:id', (req, res) => {
  const risk = risks.get(req.params.id);
  
  if (!risk) {
    return res.status(404).json({
      success: false,
      error: 'Risk not found'
    });
  }

  const { status, notes } = req.body;
  
  if (status) risk.status = status;
  if (notes) risk.notes = notes;
  risk.updatedAt = new Date();

  risks.set(req.params.id, risk);

  res.json({
    success: true,
    data: risk
  });
});

export default router;
