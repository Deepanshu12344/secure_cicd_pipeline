/**
 * Risk Scoring & Decision Logic
 * Standardized on 0–10 scale matching ml-engine and CI Pipeline
 */

export const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export const SEVERITY_WEIGHTS = {
  CRITICAL: 2.5,
  HIGH: 1.5,
  MEDIUM: 0.8,
  LOW: 0.3
};

export const CRITICAL_PROBABILITY_FLOOR = 0.20;

export const normalizeScoreThreshold = (val, defaultVal = 6.0) => {
  if (val === null || val === undefined || val === '') return defaultVal;
  const num = Number(val);
  if (!Number.isFinite(num)) return defaultVal;
  // If user provided a 0-100 scale value (e.g. 80 or 60), normalize to 0-10 (8.0 or 6.0)
  return num > 10 ? num / 10 : num;
};

export const calculateRiskScore = (issues = [], options = {}) => {
  const scoreSource = String(options.score_source || options.scoreSource || 'raw').toLowerCase() === 'adjusted'
    ? 'adjusted'
    : 'raw';
  const criticalFloor = options.critical_probability_floor !== undefined
    ? Number(options.critical_probability_floor)
    : CRITICAL_PROBABILITY_FLOOR;

  if (!issues || issues.length === 0) {
    return {
      score: 0.0,
      rawScore: 0.0,
      adjustedScore: 0.0,
      scoreSource,
      riskLevel: 'LOW',
      counts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 }
    };
  }

  let totalRawWeight = 0;
  let totalAdjustedWeight = 0;
  const counts = { critical: 0, high: 0, medium: 0, low: 0, total: issues.length };

  issues.forEach((issue) => {
    const sev = String(issue.severity || 'LOW').toUpperCase();
    const weight = SEVERITY_WEIGHTS[sev] || SEVERITY_WEIGHTS.LOW;

    if (sev === 'CRITICAL') {
      counts.critical++;
    } else if (sev === 'HIGH') {
      counts.high++;
    } else if (sev === 'MEDIUM') {
      counts.medium++;
    } else {
      counts.low++;
    }

    totalRawWeight += weight;

    // True positive probability P(TP)
    let prob = issue.model_prediction ?? issue.modelPrediction ?? issue.probability ?? issue.tp_probability;
    if (prob === undefined || prob === null) {
      prob = sev === 'CRITICAL' ? 0.95 : sev === 'HIGH' ? 0.75 : sev === 'MEDIUM' ? 0.50 : 0.25;
    } else {
      prob = Number(prob);
    }

    // Safety policy: Critical findings floor protection
    if (sev === 'CRITICAL' && prob < criticalFloor) {
      prob = criticalFloor;
    }

    // Auto-suppressed finding check: suppressed findings have 0 weight in adjusted score
    const isSuppressed = Boolean(issue.is_suppressed || issue.isSuppressed);
    if (!isSuppressed) {
      totalAdjustedWeight += weight * prob;
    }
  });

  const rawScore = Number(Math.min(10.0, Math.round(totalRawWeight * 10) / 10).toFixed(1));
  const adjustedScore = Number(Math.min(10.0, Math.round(totalAdjustedWeight * 10) / 10).toFixed(1));
  const score = scoreSource === 'adjusted' ? adjustedScore : rawScore;

  let riskLevel = 'LOW';
  if (score >= 8.0 || counts.critical > 0) {
    riskLevel = 'CRITICAL';
  } else if (score >= 6.0 || counts.high > 0) {
    riskLevel = 'HIGH';
  } else if (score >= 4.0 || counts.medium > 0) {
    riskLevel = 'MEDIUM';
  }

  return {
    score,
    rawScore,
    adjustedScore,
    scoreSource,
    riskLevel,
    counts
  };
};

export const evaluateGate = ({ score, counts, config = {}, issues = [] }) => {
  const mode = String(config.mode || 'block').toLowerCase();
  if (mode === 'off') {
    return { blocked: false, warnOnly: false, reason: 'Scanning mode is turned off.' };
  }

  const failOn = String(config.fail_on || 'high').toUpperCase();
  const maxScore = normalizeScoreThreshold(config.max_risk_score, 6.0);

  let violatesThreshold = false;
  let reason = '';

  // Severity gate: ALWAYS enforces fail_on, so critical findings still block regardless of score_source!
  const failIndex = SEVERITY_ORDER.indexOf(failOn);
  if (failIndex !== -1) {
    for (let i = 0; i <= failIndex; i++) {
      const sev = SEVERITY_ORDER[i];
      const count = counts[sev.toLowerCase()] || 0;
      if (count > 0) {
        violatesThreshold = true;
        reason = `Found ${count} ${sev} severity finding(s) (configured fail_on: ${failOn.toLowerCase()}).`;
        break;
      }
    }
  }

  // Risk score gate
  if (!violatesThreshold && score > maxScore) {
    violatesThreshold = true;
    reason = `Overall risk score ${score}/10 exceeds maximum configured threshold ${maxScore}/10.`;
  }

  if (mode === 'warn') {
    return {
      blocked: false,
      warnOnly: true,
      reason: violatesThreshold ? `[WARN MODE] ${reason}` : 'All checks passed.'
    };
  }

  return {
    blocked: violatesThreshold,
    warnOnly: false,
    reason: violatesThreshold ? reason : 'All checks passed.'
  };
};
