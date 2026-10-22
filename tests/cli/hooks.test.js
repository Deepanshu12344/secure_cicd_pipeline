import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { installHook, HOOK_MARKER_START, HOOK_MARKER_END } from '../../cli/src/commands/installHook.js';
import { uninstallHook } from '../../cli/src/commands/uninstallHook.js';

console.log('Running CLI Hooks Unit Tests...');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'securecicd-hooks-test-'));

try {
  // 1. Error when not in a git repo
  const nonGitResult = installHook({ cwd: tempDir });
  assert.strictEqual(nonGitResult.success, false, 'Should fail outside git repo');
  console.log('✓ Outside git repository guard passed');

  // Initialize a real git repo in tempDir
  execSync('git init -b main', { cwd: tempDir, stdio: 'ignore' });

  // 2. Fresh installation
  const installResult = installHook({ cwd: tempDir });
  assert.strictEqual(installResult.success, true);
  assert.strictEqual(installResult.installed, true);
  assert(fs.existsSync(installResult.hookPath), 'Hook file must exist');

  const hookContent = fs.readFileSync(installResult.hookPath, 'utf-8');
  assert(hookContent.includes(HOOK_MARKER_START), 'Should contain start marker');
  assert(hookContent.includes(HOOK_MARKER_END), 'Should contain end marker');
  console.log('✓ Fresh hook installation passed');

  // 3. Re-installation updates without duplication
  const updateResult = installHook({ cwd: tempDir });
  assert.strictEqual(updateResult.success, true);
  assert.strictEqual(updateResult.updated, true);
  const updatedContent = fs.readFileSync(installResult.hookPath, 'utf-8');
  const occurrences = (updatedContent.match(new RegExp(HOOK_MARKER_START, 'g')) || []).length;
  assert.strictEqual(occurrences, 1, 'Should not duplicate hook block');
  console.log('✓ Idempotent re-installation passed');

  // 4. Uninstall clean hook
  const uninstallResult = uninstallHook({ cwd: tempDir });
  assert.strictEqual(uninstallResult.success, true);
  assert.strictEqual(uninstallResult.removed, true);
  assert(!fs.existsSync(installResult.hookPath), 'Hook file should be deleted when no other hooks exist');
  console.log('✓ Clean uninstall passed');

  // 5. Existing third-party hook backup and chaining
  const hooksDir = path.join(tempDir, '.git', 'hooks');
  const hookFile = path.join(hooksDir, 'pre-commit');
  const thirdPartyScript = '#!/usr/bin/env bash\necho "Running lint-staged"';
  fs.writeFileSync(hookFile, thirdPartyScript, { mode: 0o755 });

  const chainedInstall = installHook({ cwd: tempDir });
  assert.strictEqual(chainedInstall.success, true);
  assert(chainedInstall.backedUp !== null, 'Backup must be created');
  assert(fs.existsSync(chainedInstall.backedUp), 'Backup file must exist on disk');

  const chainedContent = fs.readFileSync(hookFile, 'utf-8');
  assert(chainedContent.includes('Running lint-staged'), 'Chained hook must retain existing commands');
  assert(chainedContent.includes(HOOK_MARKER_START), 'Chained hook must append secure-cicd');
  console.log('✓ Third-party hook backup and chaining passed');

  // 6. Uninstall restores backup or preserves other hooks
  const chainedUninstall = uninstallHook({ cwd: tempDir });
  assert.strictEqual(chainedUninstall.success, true);
  assert.strictEqual(chainedUninstall.removed, true);
  const restoredContent = fs.readFileSync(hookFile, 'utf-8');
  assert(restoredContent.includes('Running lint-staged'), 'Original hook must be preserved or restored');
  assert(!restoredContent.includes(HOOK_MARKER_START), 'secure-cicd block must be removed');
  console.log('✓ Uninstall with restoration passed');

  console.log('All Hooks Unit Tests Passed Successfully!\n');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
