import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Check if the target directory is inside a git work tree
 */
export const isGitRepo = (cwd = process.cwd()) => {
  try {
    const res = execSync('git rev-parse --is-inside-work-tree', {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8'
    });
    return res.trim() === 'true';
  } catch {
    return false;
  }
};

/**
 * Get repo root directory
 */
export const getGitRoot = (cwd = process.cwd()) => {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8'
    }).trim();
  } catch {
    return cwd;
  }
};

/**
 * Get list of staged files (added, copied, modified) from git index
 */
export const getStagedFiles = (cwd = process.cwd()) => {
  if (!isGitRepo(cwd)) return [];

  try {
    // -z uses null-byte delimiter to handle spaces and special chars
    // --diff-filter=ACMR: Added, Copied, Modified, Renamed (ignores Deleted)
    const raw = execSync('git diff --cached --name-status -z --diff-filter=ACMR', {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8'
    });

    if (!raw) return [];
    const tokens = raw.split('\0').filter(Boolean);
    const files = [];

    for (let i = 0; i < tokens.length; i++) {
      const status = tokens[i];
      if (!status) continue;

      if (status.startsWith('R') || status.startsWith('C')) {
        // For rename/copy, git outputs status, source, destination
        i += 2;
        if (tokens[i]) files.push(tokens[i]);
      } else {
        i += 1;
        if (tokens[i]) files.push(tokens[i]);
      }
    }

    return files;
  } catch {
    return [];
  }
};

/**
 * Get all files in project tracked by git or working tree
 */
export const getAllFiles = (cwd = process.cwd()) => {
  if (!isGitRepo(cwd)) {
    // Fallback: list non-ignored directory files recursively
    return listFilesRecursive(cwd, cwd);
  }

  try {
    const raw = execSync('git ls-files -z', {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8'
    });
    return raw.split('\0').filter(Boolean);
  } catch {
    return listFilesRecursive(cwd, cwd);
  }
};

const listFilesRecursive = (dir, rootDir) => {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (['node_modules', '.git', 'dist', 'build', 'coverage', '.next'].includes(entry.name)) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath, rootDir));
    } else {
      results.push(path.relative(rootDir, fullPath).replace(/\\/g, '/'));
    }
  }

  return results;
};

/**
 * Read file content directly from git index or disk
 */
export const readFileContent = (filePath, { staged = true, cwd = process.cwd() } = {}) => {
  const normalizedPath = filePath.replace(/\\/g, '/');

  if (staged && isGitRepo(cwd)) {
    try {
      // Read staged version from index
      return execSync(`git show :${JSON.stringify(normalizedPath)}`, {
        cwd,
        stdio: ['pipe', 'pipe', 'ignore'],
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
      });
    } catch {
      // Fall through to filesystem read if not in index yet
    }
  }

  const fullPath = path.resolve(cwd, normalizedPath);
  if (!fs.existsSync(fullPath)) return null;

  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
};

/**
 * Check if content is binary or exceeds maximum size
 */
export const isBinaryOrLarge = (content, maxSizeBytes = 1024 * 1024) => {
  if (content === null || content === undefined) return true;
  if (Buffer.byteLength(content, 'utf-8') > maxSizeBytes) return true;
  // Null byte indicates binary content (e.g. images, compiled binaries)
  return content.includes('\0');
};
