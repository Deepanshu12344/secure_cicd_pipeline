import fs from 'fs';
import path from 'path';
import { getGitRoot, isGitRepo } from '../engine/git.js';
import { HOOK_MARKER_START, HOOK_MARKER_END } from './installHook.js';

export const uninstallHook = ({ cwd = process.cwd() } = {}) => {
  if (!isGitRepo(cwd)) {
    return { success: false, error: 'Not inside a git repository.' };
  }

  const gitRoot = getGitRoot(cwd);
  const hookFile = path.join(gitRoot, '.git', 'hooks', 'pre-commit');

  if (!fs.existsSync(hookFile)) {
    return { success: true, removed: false, message: 'No pre-commit hook file found.' };
  }

  const content = fs.readFileSync(hookFile, 'utf-8');
  if (!content.includes(HOOK_MARKER_START)) {
    return { success: true, removed: false, message: 'pre-commit hook does not contain secure-cicd hook block.' };
  }

  const regex = new RegExp(`${HOOK_MARKER_START}[\\s\\S]*?${HOOK_MARKER_END}\\n?`, 'g');
  const remaining = content.replace(regex, '').trim();

  // Check if any backup exists to restore
  const hooksDir = path.dirname(hookFile);
  const backups = fs.readdirSync(hooksDir).filter((f) => f.startsWith('pre-commit.backup.')).sort().reverse();

  const remainingCode = remaining
    .replace(/^#!.*$/gm, '')
    .replace(/^set\s+-[eEuxo\s]+/gm, '')
    .trim();

  if (remainingCode) {
    // Keep other hooks intact
    fs.writeFileSync(hookFile, `${remaining}\n`, { mode: 0o755 });
    return { success: true, removed: true, restored: false, message: 'Removed secure-cicd block, preserved other hooks.' };
  } else if (backups.length > 0) {
    const latestBackup = path.join(hooksDir, backups[0]);
    fs.copyFileSync(latestBackup, hookFile);
    fs.unlinkSync(latestBackup);
    return { success: true, removed: true, restored: true, message: `Restored original pre-commit hook from backup: ${backups[0]}` };
  } else {
    fs.unlinkSync(hookFile);
    return { success: true, removed: true, restored: false, message: 'Cleanly removed pre-commit hook file.' };
  }
};
