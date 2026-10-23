import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, it, expect } from '@jest/globals'
import {
  calculateRiskScore as backendCalculateScore,
  evaluateGate as backendEvaluateGate,
  isActivelyWaived,
  SEVERITY_WEIGHTS,
  CRITICAL_PROBABILITY_FLOOR
} from '../src/utils/scorer.js'
import {
  calculateRiskScore as cliCalculateScore,
  evaluateGate as cliEvaluateGate
} from '../../cli/src/engine/scorer.js'
import { validateConfig, DEFAULT_CONFIG } from '../../cli/src/config/index.js'
import { runScan } from '../../cli/src/engine/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesPath = path.resolve(__dirname, 'fixtures/scoring_cases.json')
const fixtureCases = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'))

describe('Step 4: Unified Scoring Engine (Raw vs Adjusted)', () => {
  it('should default score_source to "raw" in CLI and backend configurations', () => {
    expect(DEFAULT_CONFIG.score_source).toBe('raw')
    expect(DEFAULT_CONFIG.max_adjusted_risk_score).toBe(6.0)

    const config = validateConfig({})
    expect(config.score_source).toBe('raw')
    expect(config.max_adjusted_risk_score).toBe(6.0)

    const customConfig = validateConfig({ score_source: 'adjusted', max_adjusted_risk_score: 7.5 })
    expect(customConfig.score_source).toBe('adjusted')
    expect(customConfig.max_adjusted_risk_score).toBe(7.5)

    const invalidConfig = validateConfig({ score_source: 'invalid_mode' })
    expect(invalidConfig.score_source).toBe('raw')
  })

  it('should calculate raw score as linear sum of finding weights capped at 10.0', () => {
    // 1 Critical (2.5) + 1 High (1.5) + 2 Medium (2 * 0.8 = 1.6) + 1 Low (0.3) = 5.9
    const issues = [
      { severity: 'CRITICAL', title: 'Hardcoded key' },
      { severity: 'HIGH', title: 'SQL injection' },
      { severity: 'MEDIUM', title: 'Missing CORS' },
      { severity: 'MEDIUM', title: 'Weak cookie' },
      { severity: 'LOW', title: 'Info disclosure' }
    ]

    const result = backendCalculateScore(issues, { score_source: 'raw' })
    expect(result.rawScore).toBe(5.9)
    expect(result.score).toBe(5.9)
    expect(result.scoreSource).toBe('raw')

    // Test cap at 10.0 with 5 criticals (5 * 2.5 = 12.5 -> capped at 10.0)
    const heavyIssues = Array.from({ length: 5 }, () => ({ severity: 'CRITICAL' }))
    const cappedResult = backendCalculateScore(heavyIssues, { score_source: 'raw' })
    expect(cappedResult.score).toBe(10.0)
    expect(cappedResult.rawScore).toBe(10.0)
  })

  it('should calculate adjusted score weighted by P(TP) and ignore suppressed findings', () => {
    const issues = [
      // High finding in test file: false positive, suppressed -> 0 weight in adjusted
      {
        severity: 'HIGH',
        title: 'Mock DB Injection',
        probability: 0.10,
        isSuppressed: true
      },
      // Medium finding: confirmed -> 0.8 * 0.40 = 0.32
      {
        severity: 'MEDIUM',
        title: 'Weak header',
        probability: 0.40,
        isSuppressed: false
      }
    ]

    const rawRes = backendCalculateScore(issues, { score_source: 'raw' })
    const adjRes = backendCalculateScore(issues, { score_source: 'adjusted' })

    // Raw score includes High (1.5) + Medium (0.8) = 2.3
    expect(rawRes.rawScore).toBe(2.3)
    expect(rawRes.score).toBe(2.3)

    // Adjusted score ignores suppressed High, Medium is 0.8 * 0.4 = 0.32 -> rounded 0.3
    expect(adjRes.adjustedScore).toBe(0.3)
    expect(adjRes.score).toBe(0.3)
    expect(adjRes.scoreSource).toBe('adjusted')
  })

  it('should enforce CRITICAL_PROBABILITY_FLOOR (0.20) for critical findings', () => {
    const issues = [
      {
        severity: 'CRITICAL',
        title: 'Private Key in Repo',
        probability: 0.04 // Artificially low probability from ML model
      }
    ]

    const result = backendCalculateScore(issues, { score_source: 'adjusted' })
    // Minimum probability for Critical is clamped to 0.20
    // Adjusted weight = 2.5 * 0.20 = 0.5
    expect(result.adjustedScore).toBe(0.5)
    expect(result.enrichedIssues[0].clampedByFloor).toBe(true)
    expect(result.enrichedIssues[0].probability).toBe(CRITICAL_PROBABILITY_FLOOR)
  })
})

describe('Step 4 A1: Pre-Change Scoring Formula Regression', () => {
  it('should strictly match pre-change CI scanner scores scaled to 0-10', () => {
    const regressionFixtures = fixtureCases.filter((c) => c.pre_change_ci_score !== undefined)
    for (const fixture of regressionFixtures) {
      const resBackend = backendCalculateScore(fixture.issues, { score_source: 'raw' })
      const resCli = cliCalculateScore(fixture.issues, { score_source: 'raw' })

      expect(resBackend.rawScore).toBe(fixture.expected_raw_score)
      expect(resCli.rawScore).toBe(fixture.expected_raw_score)

      const expectedFromOldCI = Number(Math.min(10.0, fixture.pre_change_ci_score / 10.0).toFixed(1))
      expect(resBackend.rawScore).toBe(expectedFromOldCI)
    }
  })
})

describe('Step 4 A2: Scorer Parity (Backend vs CLI) Using Shared Fixtures', () => {
  it('should produce identical raw, adjusted scores, and allow/warn/block decisions', () => {
    const testConfigs = [
      { mode: 'block', fail_on: 'high', max_risk_score: 6.0 },
      { mode: 'warn', fail_on: 'high', max_risk_score: 6.0 },
      { mode: 'block', fail_on: 'critical', max_risk_score: 3.0 }
    ]

    for (const fixture of fixtureCases) {
      for (const source of ['raw', 'adjusted']) {
        const backendRes = backendCalculateScore(fixture.issues, { score_source: source })
        const cliRes = cliCalculateScore(fixture.issues, { score_source: source })

        expect(cliRes.rawScore).toBe(backendRes.rawScore)
        expect(cliRes.adjustedScore).toBe(backendRes.adjustedScore)
        expect(cliRes.score).toBe(backendRes.score)
        expect(cliRes.riskLevel).toBe(backendRes.riskLevel)

        for (const cfg of testConfigs) {
          const backendGate = backendEvaluateGate({
            score: backendRes.score,
            counts: backendRes.counts,
            config: cfg,
            issues: fixture.issues,
            scoreSource: source
          })
          const cliGate = cliEvaluateGate({
            score: cliRes.score,
            counts: cliRes.counts,
            config: cfg,
            issues: fixture.issues,
            scoreSource: source
          })

          expect(cliGate.blocked).toBe(backendGate.blocked)
          expect(cliGate.warnOnly).toBe(backendGate.warnOnly)
          expect(cliGate.effectiveCounts).toEqual(backendGate.effectiveCounts)
        }
      }
    }
  })
})

describe('Step 4 A3 & A4: Waiver Effects and Gate Exclusions', () => {
  it('should ALWAYS block on unsuppressed un-waived critical findings', () => {
    const issues = [
      {
        severity: 'CRITICAL',
        title: 'Critical CVE in Auth Module',
        probability: 0.05
      }
    ]

    const rawScore = backendCalculateScore(issues, { score_source: 'raw' })
    const rawGate = backendEvaluateGate({
      score: rawScore.score,
      counts: rawScore.counts,
      config: { fail_on: 'high', max_risk_score: 6.0, mode: 'block' },
      issues
    })
    expect(rawGate.blocked).toBe(true)

    const adjScore = backendCalculateScore(issues, { score_source: 'adjusted' })
    const adjGate = backendEvaluateGate({
      score: adjScore.score,
      counts: adjScore.counts,
      config: { fail_on: 'high', max_risk_score: 6.0, mode: 'block' },
      issues,
      scoreSource: 'adjusted'
    })
    expect(adjGate.blocked).toBe(true)
  })

  it('should exclude actively waived critical findings from blocking the gate', () => {
    const activelyWaivedCritical = [
      {
        severity: 'CRITICAL',
        title: 'Critical DB Expose',
        waiver: {
          isWaived: true,
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          reason: 'Authorized waiver during maintenance window'
        }
      }
    ]

    expect(isActivelyWaived(activelyWaivedCritical[0])).toBe(true)

    // Raw mode evaluation: Actively waived finding is excluded from gate blocking!
    const rawScore = backendCalculateScore(activelyWaivedCritical, { score_source: 'raw' })
    const rawGate = backendEvaluateGate({
      score: rawScore.score,
      counts: rawScore.counts,
      config: { fail_on: 'critical', max_risk_score: 6.0, mode: 'block' },
      issues: activelyWaivedCritical,
      scoreSource: 'raw'
    })
    expect(rawGate.blocked).toBe(false)
    expect(rawGate.effectiveCounts.critical).toBe(0)

    // Adjusted mode evaluation: Excluded as well
    const adjScore = backendCalculateScore(activelyWaivedCritical, { score_source: 'adjusted' })
    const adjGate = backendEvaluateGate({
      score: adjScore.score,
      counts: adjScore.counts,
      config: { fail_on: 'critical', max_risk_score: 6.0, mode: 'block' },
      issues: activelyWaivedCritical,
      scoreSource: 'adjusted'
    })
    expect(adjGate.blocked).toBe(false)
    expect(adjScore.adjustedScore).toBe(0.0)
  })

  it('should NOT exclude expired waivers from blocking the gate', () => {
    const expiredWaivedCritical = [
      {
        severity: 'CRITICAL',
        title: 'Expired waiver issue',
        waiver: {
          isWaived: true,
          expiresAt: new Date(Date.now() - 3600000).toISOString(), // Expired 1 hour ago
          reason: 'Past maintenance window'
        }
      }
    ]

    expect(isActivelyWaived(expiredWaivedCritical[0])).toBe(false)

    const rawScore = backendCalculateScore(expiredWaivedCritical, { score_source: 'raw' })
    const rawGate = backendEvaluateGate({
      score: rawScore.score,
      counts: rawScore.counts,
      config: { fail_on: 'critical', max_risk_score: 6.0, mode: 'block' },
      issues: expiredWaivedCritical,
      scoreSource: 'raw'
    })
    expect(rawGate.blocked).toBe(true)
    expect(rawGate.effectiveCounts.critical).toBe(1)
  })

  it('should honor max_adjusted_risk_score independently from max_risk_score', () => {
    // 2 High issues with score 3.0
    const issues = [
      { severity: 'HIGH', title: 'Finding 1' },
      { severity: 'HIGH', title: 'Finding 2' }
    ]

    const score = backendCalculateScore(issues, { score_source: 'adjusted' }) // Adjusted = 3.0 * 0.75 = 2.3
    // Set fail_on to 'critical' so fail_on count doesn't trip, only score threshold
    const config = {
      fail_on: 'critical',
      mode: 'block',
      max_risk_score: 2.0, // Strict raw threshold
      max_adjusted_risk_score: 4.0 // Generous adjusted threshold
    }

    // Evaluated with raw mode: score 3.0 > 2.0 -> BLOCKS
    const rawGate = backendEvaluateGate({
      score: 3.0,
      counts: score.counts,
      config,
      issues,
      scoreSource: 'raw'
    })
    expect(rawGate.blocked).toBe(true)
    expect(rawGate.reason).toContain('exceeds maximum configured threshold 2/10')

    // Evaluated with adjusted mode: score 2.3 <= 4.0 -> PASSES
    const adjGate = backendEvaluateGate({
      score: 2.3,
      counts: score.counts,
      config,
      issues,
      scoreSource: 'adjusted'
    })
    expect(adjGate.blocked).toBe(false)
  })
})

describe('Step 4 A6: Pre-Commit CLI Engine ML Fallback', () => {
  it('should fall back to raw score and record fallback_reason when ML engine is unreachable', async () => {
    const report = await runScan({
      cwd: path.resolve(__dirname, '..'),
      staged: false,
      config: {
        scan_scope: 'all',
        score_source: 'adjusted',
        ml_engine_url: 'http://127.0.0.1:59999' // Dead port
      }
    })

    expect(report.score_source).toBe('raw')
    expect(report.fallback_reason).toBeDefined()
    expect(report.fallback_reason).toContain('ML engine unreachable')
  })
})
