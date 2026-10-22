import fs from 'fs';
import path from 'path';
import { getGitRoot, isGitRepo } from '../engine/git.js';

export const HOOK_MARKER_START = '# --- BEGIN SECURE-CICD HOOK ---';
export const HOOK_MARKER_END = '# --- END SECURE-CICD HOOK ---';

export const HOOK_SCRIPT_CONTENT = `${HOOK_MARKER_START}
# Check for documented bypass environment variable
if [ "\${SECURECICD_SKIP:-0}" = "1" ]; then
  echo "⚠ SECURECICD_SKIP=1 detected. Bypassing pre-commit security scan."
  exit 0
fi

# Locate secure-cicd runner
if command -v secure-cicd >/dev/null 2>&1; then
  secure-cicd scan --staged
elif [ -f "./node_modules/.bin/secure-cicd" ]; then
  ./node_modules/.bin/secure-cicd scan --staged
elif [ -n "\${SECURECICD_BIN}" ] && [ -f "\${SECURECICD_BIN}" ]; then
  node "\${SECURECICD_BIN}" scan --staged
elif command -v npx >/dev/null 2>&1; then
  npx secure-cicd scan --staged
else
  echo "⚠ secure-cicd runner not found in PATH or project. Skipping security scan."
  exit 0
fi

SCAN_STATUS=$?
if [ $SCAN_STATUS -ne 0 ]; then
  echo "✖ Security checks failed. Commit aborted."
  echo "Tip: Fix flagged issues, or use git commit --no-verify to bypass if authorized."
  exit 1
fi
${HOOK_MARKER_END}
`;

export const installHook = ({ cwd = process.cwd() } = {}) => {
  if (!isGitRepo(cwd)) {
    return { success: false, error: 'Not inside a git repository. Run git init first.' };
  }

  const gitRoot = getGitRoot(cwd);
  const hooksDir = path.join(gitRoot, '.git', 'hooks');

  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const hookFile = path.join(hooksDir, 'pre-commit');
  let existingContent = '';
  let backupPath = null;

  if (fs.existsSync(hookFile)) {
    existingContent = fs.readFileSync(hookFile, 'utf-8');

    // If hook is already installed, update it
    if (existingContent.includes(HOOK_MARKER_START)) {
      const regex = new RegExp(`${HOOK_MARKER_START}[\\s\\S]*?${HOOK_MARKER_END}\\n?`, 'g');
      const cleanContent = existingContent.replace(regex, '').trim();
      const newContent = cleanContent
        ? `${cleanContent}\n\n${HOOK_SCRIPT_CONTENT}\n`
        : `#!/usr/bin/env bash\nset -e\n\n${HOOK_SCRIPT_CONTENT}\n`;
      fs.writeFileSync(hookFile, newContent, { mode: 0o755 });
      return { success: true, updated: true, hookPath: hookFile };
    }

    // Back up existing third-party hook
    backupPath = path.join(hooksDir, `pre-commit.backup.${Date.now()}`);
    fs.writeFileSync(backupPath, existingContent, { mode: 0o755 });
  }

  // Prepend bash shebang if fresh
  let finalContent = existingContent
    ? `${existingContent.trim()}\n\n${HOOK_SCRIPT_CONTENT}\n`
    : `#!/usr/bin/env bash\nset -e\n\n${HOOK_SCRIPT_CONTENT}\n`;

  fs.writeFileSync(hookFile, finalContent, { mode: 0o755 });

  return {
    success: true,
    installed: true,
    hookPath: hookFile,
    backedUp: backupPath
  };
};
