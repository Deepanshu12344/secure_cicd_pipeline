/**
 * Unified Risk Scoring & Gate Evaluation Logic
 * Standardized on 0–10 scale shared across Pre-Commit CLI and CI Pipeline
 */

export const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

export const SEVERITY_WEIGHTS = {
  CRITICAL: 2.5,
  HIGH: 1.5,
  MEDIUM: 0.8,
  LOW: 0.3
}

export const CRITICAL_PROBABILITY_FLOOR = 0.20

export const normalizeScoreThreshold = (val, defaultVal = 6.0) => {
  if (val === null || val === undefined || val === '') return defaultVal
  const num = Number(val)
  if (!Number.isFinite(num)) return defaultVal
  return num > 10 ? num / 10 : num
}

export const calculateRiskScore = (issues = [], options = {}) => {
  const scoreSource = String(options.score_source || options.scoreSource || 'raw').toLowerCase() === 'adjusted'
    ? 'adjusted'
    : 'raw'
  const criticalFloor = options.critical_probability_floor !== undefined
    ? Number(options.critical_probability_floor)
    : CRITICAL_PROBABILITY_FLOOR

  if (!issues || issues.length === 0) {
    return {
      score: 0.0,
      rawScore: 0.0,
      adjustedScore: 0.0,
      scoreSource,
      riskLevel: 'LOW',
      counts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      enrichedIssues: []
    }
  }

  let totalRawWeight = 0.0
  let totalAdjustedWeight = 0.0
  const counts = { critical: 0, high: 0, medium: 0, low: 0, total: issues.length }
  const enrichedIssues = []

  for (const issue of issues) {
    const sev = String(issue.severity || 'LOW').toUpperCase()
    const weight = SEVERITY_WEIGHTS[sev] || SEVERITY_WEIGHTS.LOW

    if (sev === 'CRITICAL') counts.critical++
    else if (sev === 'HIGH') counts.high++
    else if (sev === 'MEDIUM') counts.medium++
    else counts.low++

    totalRawWeight += weight

    // Extract true positive probability
    let prob = issue.model_prediction ?? issue.modelPrediction ?? issue.probability ?? issue.tp_probability
    if (prob === undefined || prob === null) {
      prob = sev === 'CRITICAL' ? 0.95 : sev === 'HIGH' ? 0.75 : sev === 'MEDIUM' ? 0.50 : 0.25
    } else {
      prob = Number(prob)
    }

    // Safety policy: CRITICAL floor clamp
    let clampedByFloor = false
    if (sev === 'CRITICAL' && prob < criticalFloor) {
      prob = criticalFloor
      clampedByFloor = true
    }

    // Check suppression: suppressed findings have 0 weight in adjusted calculation
    const isSuppressed = Boolean(issue.is_suppressed || issue.isSuppressed)
    if (!isSuppressed) {
      totalAdjustedWeight += weight * prob
    }

    enrichedIssues.push({
      ...issue,
      baseWeight: weight,
      probability: prob,
      clampedByFloor,
      isSuppressed
    })
  }

  const rawScore = Number(Math.min(10.0, Math.round(totalRawWeight * 10) / 10).toFixed(1))
  const adjustedScore = Number(Math.min(10.0, Math.round(totalAdjustedWeight * 10) / 10).toFixed(1))
  const score = scoreSource === 'adjusted' ? adjustedScore : rawScore

  let riskLevel = 'LOW'
  if (score >= 8.0 || counts.critical > 0) {
    riskLevel = 'CRITICAL'
  } else if (score >= 6.0 || counts.high > 0) {
    riskLevel = 'HIGH'
  } else if (score >= 4.0 || counts.medium > 0) {
    riskLevel = 'MEDIUM'
  }

  return {
    score,
    rawScore,
    adjustedScore,
    scoreSource,
    riskLevel,
    counts,
    enrichedIssues
  }
}

export const evaluateGate = ({ score, counts, config = {}, issues = [] }) => {
  const mode = String(config.mode || 'block').toLowerCase()
  if (mode === 'off') {
    return { blocked: false, warnOnly: false, reason: 'Scanning mode is turned off.' }
  }

  const failOn = String(config.fail_on || 'high').toUpperCase()
  const maxScore = normalizeScoreThreshold(config.max_risk_score, 6.0)

  let violatesThreshold = false
  let reason = ''

  // 1. Severity gate: Unconditionally checks fail_on severity counts
  // Active unsuppressed critical findings will always block if fail_on is HIGH or CRITICAL
  const failIndex = SEVERITY_ORDER.indexOf(failOn)
  if (failIndex !== -1) {
    for (let i = 0; i <= failIndex; i++) {
      const sev = SEVERITY_ORDER[i]
      const count = counts[sev.toLowerCase()] || 0
      if (count > 0) {
        violatesThreshold = true
        reason = `Found ${count} ${sev} severity finding(s) (configured fail_on: ${failOn.toLowerCase()}).`
        break
      }
    }
  }

  // 2. Score threshold gate
  if (!violatesThreshold && score > maxScore) {
    violatesThreshold = true
    reason = `Overall risk score ${score}/10 exceeds maximum configured threshold ${maxScore}/10.`
  }

  if (mode === 'warn') {
    return {
      blocked: false,
      warnOnly: true,
      reason: violatesThreshold ? `[WARN MODE] ${reason}` : 'All checks passed.'
    }
  }

  return {
    blocked: violatesThreshold,
    warnOnly: false,
    reason: violatesThreshold ? reason : 'All checks passed.'
  }
}
