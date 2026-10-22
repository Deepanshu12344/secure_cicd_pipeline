import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'

jest.setTimeout(25000)
import app from '../src/index.js'
import Risk from '../src/models/Risk.js'
import Scan from '../src/models/Scan.js'
import Project from '../src/models/Project.js'
import {
  generateFindingFingerprint,
  normalizeFilePath,
  normalizeSnippet
} from '../src/utils/fingerprint.js'
import feedbackStore, {
  saveFeedback,
  removeFeedback,
  getLatestFeedbackForFinding,
  getActiveSuppressedFingerprints,
  getAllFeedbackForTraining,
  withFileLock
} from '../src/utils/feedbackStore.js'

const TEST_JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const TEST_ADMIN_ID = '69953989203a7a41378176ca'
const TEST_DEV1_ID = '69953989203a7a41378176cb'
const TEST_DEV2_ID = '69953989203a7a41378176cc'
const TEST_VIEWER_ID = '69953989203a7a41378176cd'
const TEST_USER_ID = '69953989203a7a41378176ce'
const TEST_SEC_ID = '69953989203a7a41378176cf'

const TEST_PROJECT_A = '6999f12c5061b56fe823de9d'
const TEST_PROJECT_B = '7000f12c5061b56fe823de9e'

const adminToken = jwt.sign(
  { id: TEST_ADMIN_ID, email: 'admin@example.com', role: 'admin' },
  TEST_JWT_SECRET,
  { expiresIn: '1h' }
)
const devToken = jwt.sign(
  { id: TEST_DEV1_ID, email: 'dev1@example.com', role: 'developer' },
  TEST_JWT_SECRET,
  { expiresIn: '1h' }
)
const viewerToken = jwt.sign(
  { id: TEST_VIEWER_ID, email: 'viewer@example.com', role: 'viewer' },
  TEST_JWT_SECRET,
  { expiresIn: '1h' }
)
const plainUserToken = jwt.sign(
  { id: TEST_USER_ID, email: 'user@example.com', role: 'user' },
  TEST_JWT_SECRET,
  { expiresIn: '1h' }
)
const secToken = jwt.sign(
  { id: TEST_SEC_ID, email: 'sec@example.com', role: 'security_reviewer' },
  TEST_JWT_SECRET,
  { expiresIn: '1h' }
)

let createdRiskIds = []
let createdScanIds = []

beforeAll(async () => {
  const start = Date.now()
  while (mongoose.connection && mongoose.connection.readyState !== 1 && Date.now() - start < 5000) {
    await new Promise((r) => setTimeout(r, 100))
  }
})

afterAll(async () => {
  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      if (createdRiskIds.length > 0) {
        await Risk.deleteMany({ _id: { $in: createdRiskIds } })
      }
      if (createdScanIds.length > 0) {
        await Scan.deleteMany({ _id: { $in: createdScanIds } })
      }
    }
  } catch {}
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.connection.close()
  }
})

describe('Fingerprinting & Identity Resilience', () => {
  it('should generate identical fingerprints regardless of line numbers', () => {
    const fp1 = generateFindingFingerprint({
      ruleId: 'SEC-001',
      file: 'src/config/keys.js',
      line: 12,
      snippet: 'const API_KEY = "12345";'
    })

    const fp2 = generateFindingFingerprint({
      ruleId: 'SEC-001',
      file: 'src/config/keys.js',
      line: 99,
      snippet: 'const API_KEY = "12345";'
    })

    expect(fp1).toBe(fp2)
  })

  it('should normalize whitespace in code snippets', () => {
    const fp1 = generateFindingFingerprint({
      ruleId: 'SQL-001',
      file: 'src/db.js',
      snippet: 'SELECT *   FROM  users WHERE id = 1;'
    })

    const fp2 = generateFindingFingerprint({
      ruleId: 'SQL-001',
      file: 'src/db.js',
      snippet: 'SELECT * FROM users WHERE id = 1;'
    })

    expect(fp1).toBe(fp2)
  })

  it('should strip temporary repo path prefixes across environments', () => {
    const norm1 = normalizeFilePath('temp_repo/src/controllers/auth.js')
    const norm2 = normalizeFilePath('/temp_repo/src/controllers/auth.js')
    const norm3 = normalizeFilePath('src/controllers/auth.js')

    expect(norm1).toBe('src/controllers/auth.js')
    expect(norm2).toBe('src/controllers/auth.js')
    expect(norm3).toBe('src/controllers/auth.js')
  })

  it('should differentiate between different vulnerability rules', () => {
    const fp1 = generateFindingFingerprint({
      ruleId: 'SQL-001',
      file: 'src/app.js',
      snippet: 'query'
    })
    const fp2 = generateFindingFingerprint({
      ruleId: 'XSS-001',
      file: 'src/app.js',
      snippet: 'query'
    })
    expect(fp1).not.toBe(fp2)
  })
})

describe('Dual Feedback Store (Atomic Locking & Project Scoping)', () => {
  const testFindingId = '6501a1b2c3d4e5f6a1b2c3d4'
  const testFp = 'test_fingerprint_hash_abc_123'

  it('should save and retrieve feedback with file lock', async () => {
    const record = await saveFeedback({
      findingId: testFindingId,
      fingerprint: testFp,
      projectId: TEST_PROJECT_A,
      userId: TEST_ADMIN_ID,
      userRole: 'admin',
      label: 'false_positive',
      note: 'Sanitized by custom wrapper'
    })

    expect(record).toBeDefined()
    expect(record.label).toBe('false_positive')
    expect(record.fingerprint).toBe(testFp)

    const latest = await getLatestFeedbackForFinding(testFindingId)
    expect(latest).toBeDefined()
    expect(latest.label).toBe('false_positive')
  })

  it('should isolate suppressed fingerprints strictly to the same project', async () => {
    const suppressedInA = await getActiveSuppressedFingerprints(TEST_PROJECT_A)
    const suppressedInB = await getActiveSuppressedFingerprints(TEST_PROJECT_B)

    expect(suppressedInA.has(testFp)).toBe(true)
    // Project B must NEVER inherit Project A's suppression
    expect(suppressedInB.has(testFp)).toBe(false)
  })

  it('should revert suppression when feedback is removed', async () => {
    await removeFeedback({
      findingId: testFindingId,
      userId: TEST_ADMIN_ID
    })

    await saveFeedback({
      findingId: testFindingId,
      fingerprint: testFp,
      projectId: TEST_PROJECT_A,
      userId: TEST_ADMIN_ID,
      userRole: 'admin',
      label: 'confirmed',
      note: 'Confirmed by security review'
    })

    const suppressed = await getActiveSuppressedFingerprints(TEST_PROJECT_A)
    expect(suppressed.has(testFp)).toBe(false)
  })
})

describe('Consensus Suppression Rule & Project Isolation (Gap 3)', () => {
  const testRunId = Date.now()
  const consensusFp = `fp_consensus_${testRunId}`

  it('should not suppress on single non-privileged developer vote', async () => {
    await saveFeedback({
      findingId: new mongoose.Types.ObjectId(),
      fingerprint: consensusFp,
      projectId: TEST_PROJECT_A,
      userId: TEST_DEV1_ID,
      userRole: 'developer',
      label: 'false_positive'
    })

    const suppressed = await getActiveSuppressedFingerprints(TEST_PROJECT_A)
    expect(suppressed.has(consensusFp)).toBe(false)
  })

  it('should suppress when >=2 developers agree in the same project', async () => {
    await saveFeedback({
      findingId: new mongoose.Types.ObjectId(),
      fingerprint: consensusFp,
      projectId: TEST_PROJECT_A,
      userId: TEST_DEV2_ID,
      userRole: 'developer',
      label: 'false_positive'
    })

    const suppressedA = await getActiveSuppressedFingerprints(TEST_PROJECT_A)
    const suppressedB = await getActiveSuppressedFingerprints(TEST_PROJECT_B)

    expect(suppressedA.has(consensusFp)).toBe(true)
    expect(suppressedB.has(consensusFp)).toBe(false)
  })

  it('should immediately suppress on 1 vote from authorized privileged role', async () => {
    const privilegedFp = `fp_privileged_${testRunId}`
    await saveFeedback({
      findingId: new mongoose.Types.ObjectId(),
      fingerprint: privilegedFp,
      projectId: TEST_PROJECT_A,
      userId: TEST_SEC_ID,
      userRole: 'security_reviewer',
      label: 'false_positive'
    })

    const suppressed = await getActiveSuppressedFingerprints(TEST_PROJECT_A)
    expect(suppressed.has(privilegedFp)).toBe(true)
  })
})

describe('Label Lifecycle (Gap 4)', () => {
  const lifecycleRunId = Date.now()
  const findingId = new mongoose.Types.ObjectId()
  const lifecycleFp = `fp_lifecycle_${lifecycleRunId}`

  it('should maintain history when label is updated, keeping latest active', async () => {
    await saveFeedback({
      findingId,
      fingerprint: lifecycleFp,
      projectId: TEST_PROJECT_A,
      userId: TEST_DEV1_ID,
      label: 'false_positive'
    })

    await saveFeedback({
      findingId,
      fingerprint: lifecycleFp,
      projectId: TEST_PROJECT_A,
      userId: TEST_DEV1_ID,
      label: 'confirmed'
    })

    const latest = await getLatestFeedbackForFinding(findingId)
    expect(latest.label).toBe('confirmed')
  })

  it('should isolate user labels on delete and revert to unreviewed when all removed', async () => {
    await saveFeedback({
      findingId,
      fingerprint: lifecycleFp,
      projectId: TEST_PROJECT_A,
      userId: TEST_DEV2_ID,
      label: 'false_positive'
    })

    // User 2 deletes their label
    await removeFeedback({ findingId, userId: TEST_DEV2_ID })

    // User 1's confirmed label must remain intact
    const remaining = await getLatestFeedbackForFinding(findingId)
    expect(remaining).not.toBeNull()
    expect(remaining.label).toBe('confirmed')

    // User 1 deletes their label
    await removeFeedback({ findingId, userId: TEST_DEV1_ID })
    const empty = await getLatestFeedbackForFinding(findingId)
    expect(empty).toBeNull()
  })
})

describe('Role-Based Access Control (Gap 1)', () => {
  it('should reject unauthenticated requests with 401', async () => {
    const resFeedback = await request(app)
      .post('/api/risks/6501a1b2c3d4e5f6a1b2c3d4/feedback')
      .send({ label: 'false_positive' })
    expect(resFeedback.status).toBe(401)

    const resBulk = await request(app)
      .post('/api/risks/feedback/bulk')
      .send({ items: [] })
    expect(resBulk.status).toBe(401)

    const resRetrain = await request(app)
      .post('/api/ml/retrain')
      .send({})
    expect(resRetrain.status).toBe(401)
  })

  it('should reject viewer and user roles with 403 on feedback, bulk and retrain', async () => {
    for (const token of [viewerToken, plainUserToken]) {
      const resFeedback = await request(app)
        .post('/api/risks/6501a1b2c3d4e5f6a1b2c3d4/feedback')
        .set('Authorization', `Bearer ${token}`)
        .send({ label: 'false_positive' })
      expect(resFeedback.status).toBe(403)

      const resBulk = await request(app)
        .post('/api/risks/feedback/bulk')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ findingId: '6501a1b2c3d4e5f6a1b2c3d4', label: 'false_positive' }] })
      expect(resBulk.status).toBe(403)

      const resRetrain = await request(app)
        .post('/api/ml/retrain')
        .set('Authorization', `Bearer ${token}`)
        .send({})
      expect(resRetrain.status).toBe(403)
    }
  })

  it('should allow developer role on feedback but reject developer on retrain with 403', async () => {
    // Developer calling retrain gets 403
    const resRetrain = await request(app)
      .post('/api/ml/retrain')
      .set('Authorization', `Bearer ${devToken}`)
      .send({})
    expect(resRetrain.status).toBe(403)

    // Developer calling feedback does not get 403 (gets 404 for missing dummy finding, verifying auth passed)
    const resFeedback = await request(app)
      .post('/api/risks/000000000000000000000000/feedback')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ label: 'confirmed' })
    expect(resFeedback.status).toBe(404)
  })

  it('should allow admin and security_reviewer roles on retrain', async () => {
    // Both pass authorization on retrain (if insufficient data, 400 not 403)
    const resSec = await request(app)
      .post('/api/ml/retrain')
      .set('Authorization', `Bearer ${secToken}`)
      .send({ force: false })
    expect(resSec.status).not.toBe(403)

    const resAdmin = await request(app)
      .post('/api/ml/retrain')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ force: false })
    expect(resAdmin.status).not.toBe(403)
  })
})

describe('Critical Finding Immunity (Gap 2)', () => {
  it('should never auto-suppress critical findings even when marked false_positive', async () => {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const critRisk = await Risk.create({
        ownerId: TEST_ADMIN_ID,
        projectId: TEST_PROJECT_A,
        title: 'Hardcoded Production Private Key',
        severity: 'critical',
        riskScore: 9.8,
        file: 'config/master.key',
        status: 'open'
      })
      createdRiskIds.push(critRisk._id)

      const res = await request(app)
        .post(`/api/risks/${critRisk._id}/feedback`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ label: 'false_positive', note: 'Testing critical safety' })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.feedbackStatus).toBe('false_positive')
      expect(res.body.data.isSuppressed).toBe(false)
      expect(res.body.data.suppressionReason).toContain('Critical finding: suppression prohibited by safety policy')

      const updated = await Risk.findById(critRisk._id)
      expect(updated.isSuppressed).toBe(false)
    }
  })
})

describe('Bulk Triage Happy Path & Anti-Poisoning Limits (Gap 5)', () => {
  it('should reject bulk requests exceeding 50 findings with 400', async () => {
    const overFifty = Array.from({ length: 51 }, (_, i) => ({
      findingId: `6501a1b2c3d4e5f6a1b2c${String(i).padStart(3, '0')}`,
      label: i % 2 === 0 ? 'confirmed' : 'false_positive'
    }))

    const res = await request(app)
      .post('/api/risks/feedback/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: overFifty })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Maximum 50 findings')
  })

  it('should enforce anti-poisoning policy (>90% single class blocked)', async () => {
    const skewedItems = Array.from({ length: 10 }, (_, i) => ({
      findingId: `6501a1b2c3d4e5f6a1b2d${String(i).padStart(3, '0')}`,
      label: 'false_positive'
    }))

    const res = await request(app)
      .post('/api/risks/feedback/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ items: skewedItems })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('Anti-poisoning policy')
  })

  it('should accept balanced mixed labels on happy path', async () => {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const risks = await Risk.insertMany([
        { ownerId: TEST_ADMIN_ID, projectId: TEST_PROJECT_A, title: 'R1', severity: 'medium', file: 'a.js' },
        { ownerId: TEST_ADMIN_ID, projectId: TEST_PROJECT_A, title: 'R2', severity: 'medium', file: 'b.js' },
        { ownerId: TEST_ADMIN_ID, projectId: TEST_PROJECT_A, title: 'R3', severity: 'medium', file: 'c.js' },
        { ownerId: TEST_ADMIN_ID, projectId: TEST_PROJECT_A, title: 'R4', severity: 'medium', file: 'd.js' },
        { ownerId: TEST_ADMIN_ID, projectId: TEST_PROJECT_A, title: 'R5', severity: 'medium', file: 'e.js' }
      ])
      risks.forEach((r) => createdRiskIds.push(r._id))

      const items = [
        { findingId: String(risks[0]._id), label: 'confirmed' },
        { findingId: String(risks[1]._id), label: 'confirmed' },
        { findingId: String(risks[2]._id), label: 'confirmed' },
        { findingId: String(risks[3]._id), label: 'false_positive' },
        { findingId: String(risks[4]._id), label: 'false_positive' }
      ]

      const res = await request(app)
        .post('/api/risks/feedback/bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.triagedCount).toBe(5)
    }
  }, 15000)
})

describe('Retrain Success Path via API & Model Metrics Integration (Gap 6)', () => {
  it('should return promoted/rejected status with reason and update metrics', async () => {
    const resRetrain = await request(app)
      .post('/api/ml/retrain')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ force: true })

    expect(resRetrain.status).toBe(200)
    expect(resRetrain.body.success).toBe(true)
    expect(resRetrain.body.data).toBeDefined()
    expect(typeof resRetrain.body.data.promoted).toBe('boolean')
    expect(resRetrain.body.data.version).toBeDefined()

    const resMetrics = await request(app).get('/api/dashboard/model/metrics')
    expect(resMetrics.status).toBe(200)
    expect(resMetrics.body.success).toBe(true)
    expect(resMetrics.body.data.activeVersion).toBeDefined()
    expect(resMetrics.body.data.confidence).toBeDefined()
    expect(resMetrics.body.data.realFeedbackStats).toBeDefined()
  }, 15000)
})

describe('Explainable Score Endpoints & Fallback Resilience (Gap 7)', () => {
  it('should return 404 for invalid risk or scan IDs', async () => {
    const resRisk = await request(app)
      .get('/api/risks/000000000000000000000000/explanation')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(resRisk.status).toBe(404)

    const resScan = await request(app)
      .get('/api/scans/000000000000000000000000/explanation')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(resScan.status).toBe(404)
  })

  it('should return structured explanation and factor attribution for valid risk and scan', async () => {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const scan = await Scan.create({
        ownerId: TEST_ADMIN_ID,
        projectId: TEST_PROJECT_A,
        repositoryUrl: 'https://github.com/org/test-repo',
        status: 'completed',
        findingsCount: 1,
        riskScore: 7.5,
        rawRiskScore: 7.5,
        adjustedRiskScore: 7.5
      })
      createdScanIds.push(scan._id)

      const risk = await Risk.create({
        ownerId: TEST_ADMIN_ID,
        projectId: TEST_PROJECT_A,
        scanId: scan._id,
        title: 'SQL Injection in Query Builder',
        severity: 'high',
        riskScore: 7.5,
        file: 'src/db/users.js',
        description: "SELECT * FROM users WHERE name = '" + "req.name"
      })
      createdRiskIds.push(risk._id)

      // Test risk explanation endpoint
      const resRisk = await request(app)
        .get(`/api/risks/${risk._id}/explanation`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(resRisk.status).toBe(200)
      expect(resRisk.body.success).toBe(true)
      expect(resRisk.body.data.explanation).toBeDefined()
      expect(typeof resRisk.body.data.explanation.probability).toBe('number')
      expect(resRisk.body.data.explanation.verdict).toBeDefined()
      expect(Array.isArray(resRisk.body.data.explanation.top_positive_factors)).toBe(true)

      // Test scan explanation endpoint
      const resScan = await request(app)
        .get(`/api/scans/${scan._id}/explanation`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(resScan.status).toBe(200)
      expect(resScan.body.success).toBe(true)
      expect(resScan.body.data.scanId).toBe(String(scan._id))
      expect(resScan.body.data.modelInfo).toBeDefined()
      expect(Array.isArray(resScan.body.data.topContributingRisks)).toBe(true)
    }
  }, 15000)
})
