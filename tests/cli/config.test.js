import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, DEFAULT_CONFIG_YAML, DEFAULT_CONFIG, validateConfig } from '../../cli/src/config/index.js';

console.log('Running CLI Config Unit Tests...');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'securecicd-config-test-'));

async function runTests() {
  try {
    // 1. Default config fallback when file doesn't exist
    const { config: emptyConfig, isDefault } = await loadConfig(null, tempDir);
    assert.strictEqual(isDefault, true, 'isDefault should be true');
    assert.strictEqual(emptyConfig.mode, 'block', 'Default mode should be block');
    assert.strictEqual(emptyConfig.fail_on, 'high', 'Default fail_on should be high');
    assert.strictEqual(emptyConfig.max_risk_score, 6.0, 'Default max_risk_score should be 6.0');
    assert.strictEqual(emptyConfig.scan_scope, 'staged', 'Default scan_scope should be staged');
    console.log('✓ Default config fallback passed');

    // 2. Custom YAML configuration loading
    const customYaml = `
scan_scope: all
fail_on: critical
max_risk_score: 8.5
mode: warn
ml_engine_url: http://localhost:5001
dashboard:
  enabled: true
  url: http://localhost:5000
  api_key_env: CUSTOM_API_KEY
ignore:
  paths:
    - "legacy/**"
    - "*.test.js"
  rules:
    - "WEAK_HASH"
allowlist:
  - path: "config/dummy.js"
    rule: "SECRET_PASSWORD"
    reason: "Dummy test fixture"
`;

    fs.writeFileSync(path.join(tempDir, '.securecicd.yaml'), customYaml, 'utf-8');
    const { config: loaded, isDefault: isCustomDefault } = await loadConfig(null, tempDir);
    assert.strictEqual(isCustomDefault, false, 'isDefault should be false');
    assert.strictEqual(loaded.scan_scope, 'all');
    assert.strictEqual(loaded.fail_on, 'critical');
    assert.strictEqual(loaded.max_risk_score, 8.5);
    assert.strictEqual(loaded.mode, 'warn');
    assert.strictEqual(loaded.ml_engine_url, 'http://localhost:5001');
    assert.strictEqual(loaded.dashboard.enabled, true);
    assert.strictEqual(loaded.dashboard.api_key_env, 'CUSTOM_API_KEY');
    assert(loaded.ignore.paths.includes('legacy/**'));
    assert(loaded.ignore.rules.includes('WEAK_HASH'));
    assert.strictEqual(loaded.allowlist.length, 1);
    assert.strictEqual(loaded.allowlist[0].rule, 'SECRET_PASSWORD');
    console.log('✓ Custom YAML config loading passed');

    // 3. Fallback for invalid values via validateConfig
    const sanitized = validateConfig({
      mode: 'invalid_mode',
      fail_on: 'ultra_critical',
      max_risk_score: -5,
      scan_scope: 'everything'
    });
    assert.strictEqual(sanitized.mode, 'block', 'Invalid mode should fall back to block');
    assert.strictEqual(sanitized.fail_on, 'high', 'Invalid fail_on should fall back to high');
    assert.strictEqual(sanitized.max_risk_score, 6.0, 'Invalid max_risk_score should fall back to 6.0');
    assert.strictEqual(sanitized.scan_scope, 'staged', 'Invalid scan_scope should fall back to staged');
    console.log('✓ Invalid values sanitization & fallback passed');

    // 4. Default template generation
    assert(DEFAULT_CONFIG_YAML.includes('max_risk_score: 6.0'), 'Template must include max_risk_score');
    assert(DEFAULT_CONFIG_YAML.includes('fail_on: high'), 'Template must include fail_on');
    console.log('✓ Default config template check passed');

    console.log('All Config Unit Tests Passed Successfully!\n');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
