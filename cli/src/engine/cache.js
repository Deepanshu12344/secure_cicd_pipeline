import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const CACHE_FILE_NAME = '.securecicd_cache.json';

export const computeContentHash = (content) => {
  return crypto.createHash('sha256').update(content || '', 'utf-8').digest('hex');
};

export const loadCache = (rootDir = process.cwd()) => {
  const cachePath = path.join(rootDir, CACHE_FILE_NAME);
  try {
    if (fs.existsSync(cachePath)) {
      return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    }
  } catch {
    // Ignore corrupt cache
  }
  return {};
};

export const saveCache = (cache, rootDir = process.cwd()) => {
  const cachePath = path.join(rootDir, CACHE_FILE_NAME);
  try {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
  } catch {
    // Non-fatal if cache save fails
  }
};
