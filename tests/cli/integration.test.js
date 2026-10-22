import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync, execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliBinPath = path.resolve(__dirname, '../../cli/bin/secure-cicd.js');

console.log('Running End-to-End CLI Integration Tests...');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'securecicd-integration-test-'));

try {
  // 1. Initialize fresh git repo
  execSync('git init -b main', { cwd: tempDir, stdio: 'ignore' });
  execSync('git config user.name "Test Dev"', { cwd: tempDir, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'ignore' });

  // 2. Initialize secure-cicd in the repo
  const initProc = spawnSync('node', [cliBinPath, 'init'], {
    cwd: tempDir,
    encoding: 'utf-8'
  });
  assert.strictEqual(initProc.status, 0, `Init should succeed: ${initProc.stderr}`);
  assert(fs.existsSync(path.join(tempDir, '.securecicd.yaml')), '.securecicd.yaml must be created');
  assert(fs.existsSync(path.join(tempDir, '.git', 'hooks', 'pre-commit')), 'Git pre-commit hook must be created');
  console.log('✓ CLI init command succeeded in fresh repo');

  // 3. Stage a clean file -> scan must pass with exit code 0
  fs.writeFileSync(path.join(tempDir, 'clean.js'), 'export const greet = (name) => `Hello, ${name}!`;\n', 'utf-8');
  execSync('git add clean.js', { cwd: tempDir, stdio: 'ignore' });

  const cleanScan = spawnSync('node', [cliBinPath, 'scan', '--staged'], {
    cwd: tempDir,
    encoding: 'utf-8'
  });
  assert.strictEqual(cleanScan.status, 0, `Clean scan should pass: ${cleanScan.stdout}`);
  assert(/commit allowed/i.test(cleanScan.stdout), 'Output should indicate commit allowed');
  console.log('✓ Clean staged scan passed with exit code 0');

  // Commit clean file
  execSync('git commit -m "feat: add greet helper"', { cwd: tempDir, stdio: 'ignore' });

  // 4. Stage a vulnerable file with hardcoded secret and SQL injection
  const vulnContent = `
const db = require('./db');
// AWS production access key
const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";

function getUser(id) {
  // Vulnerable dynamic query concatenation
  const query = "SELECT * FROM users WHERE id = '" + id + "'";
  return db.query(query);
}
module.exports = { getUser };
`;
  fs.writeFileSync(path.join(tempDir, 'vuln.js'), vulnContent, 'utf-8');
  execSync('git add vuln.js', { cwd: tempDir, stdio: 'ignore' });

  const vulnScan = spawnSync('node', [cliBinPath, 'scan', '--staged'], {
    cwd: tempDir,
    encoding: 'utf-8'
  });

  // Must be blocked with exit code 1
  assert.strictEqual(vulnScan.status, 1, 'Vulnerable staged file must return exit code 1 (blocked)');
  assert(vulnScan.stdout.includes('COMMIT BLOCKED'), 'Terminal output must announce COMMIT BLOCKED');
  assert(vulnScan.stdout.includes('...****...'), 'Sensitive credentials must be masked in terminal output');
  assert(!vulnScan.stdout.includes('IOSFODNN7'), 'Unmasked raw secret must NEVER appear in output');
  assert(vulnScan.stdout.includes('SQL') || vulnScan.stdout.includes('Injection'), 'SQL Injection must be flagged');
  console.log('✓ Vulnerable commit correctly blocked with masked findings');

  // 5. Test JSON format output
  const jsonScan = spawnSync('node', [cliBinPath, 'scan', '--staged', '--format', 'json'], {
    cwd: tempDir,
    encoding: 'utf-8'
  });
  assert.strictEqual(jsonScan.status, 1, 'JSON scan should also return exit code 1');
  const parsedJson = JSON.parse(jsonScan.stdout);
  assert(parsedJson.overall_risk_score > 0, 'Risk score must be greater than 0');
  assert(parsedJson.issues.length >= 2, 'Must detect at least 2 issues');
  assert.strictEqual(parsedJson.gate.blocked, true, 'Gate must be blocked in JSON output');
  console.log('✓ JSON formatter produced valid schema with gate status');

  // 6. Test SARIF format output
  const sarifScan = spawnSync('node', [cliBinPath, 'scan', '--staged', '--format', 'sarif'], {
    cwd: tempDir,
    encoding: 'utf-8'
  });
  const parsedSarif = JSON.parse(sarifScan.stdout);
  assert.strictEqual(parsedSarif.version, '2.1.0', 'SARIF version must be 2.1.0');
  assert(parsedSarif.runs && parsedSarif.runs.length > 0, 'SARIF runs must be present');
  console.log('✓ SARIF 2.1.0 formatter validated');

  // 7. Test bypass via SECURECICD_SKIP=1
  const skipScan = spawnSync('node', [cliBinPath, 'scan', '--staged'], {
    cwd: tempDir,
    encoding: 'utf-8',
    env: { ...process.env, SECURECICD_SKIP: '1' }
  });
  assert.strictEqual(skipScan.status, 0, 'SECURECICD_SKIP=1 must bypass the gate and return exit code 0');
  assert(skipScan.stdout.includes('SECURECICD_SKIP=1'), 'Bypass reason must be logged');
  console.log('✓ SECURECICD_SKIP=1 bypass successfully verified');

  // 8. Fix the vulnerability and verify the commit passes
  const fixedContent = `
const db = require("./db");

function getUser(id) {
  // Safe parameterized query
  const query = "SELECT * FROM users WHERE id = ?";
  return db.query(query, [id]);
}
module.exports = { getUser };
`;
  fs.writeFileSync(path.join(tempDir, 'vuln.js'), fixedContent, 'utf-8');
  execSync('git add vuln.js', { cwd: tempDir, stdio: 'ignore' });

  const fixedScan = spawnSync('node', [cliBinPath, 'scan', '--staged'], {
    cwd: tempDir,
    encoding: 'utf-8'
  });
  assert.strictEqual(fixedScan.status, 0, `Fixed scan must pass with exit code 0: ${fixedScan.stdout}`);
  assert(/commit allowed/i.test(fixedScan.stdout), 'Commit should now be allowed');

  // Verify git commit completes with 0 errors
  execSync('git commit -m "feat: add getUser with safe parameterized query"', { cwd: tempDir, stdio: 'ignore' });
  console.log('✓ Fixed file successfully scanned and committed');

  console.log('All End-to-End CLI Integration Tests Passed Successfully!\n');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
