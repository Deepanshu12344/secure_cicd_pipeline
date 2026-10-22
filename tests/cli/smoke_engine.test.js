import assert from 'assert';
import { runScan } from '../../cli/src/engine/index.js';
import { maskSecret } from '../../cli/src/engine/rules/secrets.js';
import { calculateRiskScore, evaluateGate } from '../../cli/src/engine/scorer.js';

console.log('Running Engine Smoke Tests...');

// 1. Masking test
const masked = maskSecret('AKIAIOSFODNN7EXAMPLE');
assert(masked.includes('...****...'), 'Secret should be masked with asterisks');
assert(!masked.includes('IOSFODNN7'), 'Middle secret characters should never appear');
console.log('✓ Secret masking test passed');

// 2. Scorer test
const testIssues = [
  { severity: 'CRITICAL', threatType: 'Secret Exposure' },
  { severity: 'HIGH', threatType: 'SQL Injection' }
];
const { score, riskLevel, counts } = calculateRiskScore(testIssues);
assert.strictEqual(score, 4.0, '2.5 + 1.5 should equal 4.0');
assert.strictEqual(counts.critical, 1);
assert.strictEqual(counts.high, 1);
console.log('✓ Scorer test passed');

// 3. Gate evaluation test
const gateBlock = evaluateGate({
  score,
  counts,
  config: { fail_on: 'high', max_risk_score: 6.0, mode: 'block' },
  issues: testIssues
});
assert.strictEqual(gateBlock.blocked, true, 'Should block on high severity finding');

const gateWarn = evaluateGate({
  score,
  counts,
  config: { fail_on: 'high', max_risk_score: 6.0, mode: 'warn' },
  issues: testIssues
});
assert.strictEqual(gateWarn.blocked, false, 'Warn mode should never block');
assert.strictEqual(gateWarn.warnOnly, true);
console.log('✓ Gate evaluation test passed');

console.log('All Step 1 Engine Smoke Tests Passed!');
