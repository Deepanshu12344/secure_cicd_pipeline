import path from 'path';
import { getStagedFiles, getAllFiles, readFileContent, isBinaryOrLarge } from './git.js';
import { scanSecrets } from './rules/secrets.js';
import { scanSqlInjection } from './rules/sqli.js';
import { scanXss } from './rules/xss.js';
import { scanCrypto } from './rules/crypto.js';
import { scanConfig } from './rules/config.js';
import { scanDependencies } from './rules/dependencies.js';
import { scanWithMlEngine } from './mlClient.js';
import { calculateRiskScore, evaluateGate } from './scorer.js';
import { computeContentHash, loadCache, saveCache } from './cache.js';

const isPathIgnored = (filePath, ignorePatterns = []) => {
  const norm = filePath.replace(/\\/g, '/');
  // Built-in ignores
  if (
    norm.startsWith('.git/') ||
    norm.includes('node_modules/') ||
    norm.startsWith('dist/') ||
    norm.startsWith('build/') ||
    norm.endsWith('.min.js') ||
    norm.endsWith('.min.css') ||
    norm === '.securecicd_cache.json'
  ) {
    return true;
  }

  for (const pattern of ignorePatterns) {
    const cleanPattern = pattern.replace(/^\.\//, '').replace(/\\/g, '/');
    if (cleanPattern.endsWith('/**')) {
      const prefix = cleanPattern.slice(0, -3);
      if (norm === prefix || norm.startsWith(`${prefix}/`)) return true;
    } else if (cleanPattern.startsWith('*.')) {
      const ext = cleanPattern.slice(1);
      if (norm.endsWith(ext)) return true;
    } else if (norm === cleanPattern || norm.includes(cleanPattern)) {
      return true;
    }
  }

  return false;
};

const isAllowlisted = (issue, allowlist = []) => {
  if (!Array.isArray(allowlist) || allowlist.length === 0) return false;
  return allowlist.some((item) => {
    const matchRule = !item.rule || item.rule === issue.id || item.rule === issue.threatType;
    const matchPath = !item.path || issue.file.includes(item.path.replace(/\\/g, '/'));
    return matchRule && matchPath;
  });
};

export const runScan = async ({
  cwd = process.cwd(),
  staged = true,
  config = {}
} = {}) => {
  const scope = staged ? 'staged' : 'all';
  const targetFiles = staged ? getStagedFiles(cwd) : getAllFiles(cwd);
  const ignorePatterns = config.ignore?.paths || [];
  const ignoredRules = new Set(config.ignore?.rules || []);
  const allowlist = config.allowlist || [];

  const filesToScan = targetFiles.filter((f) => !isPathIgnored(f, ignorePatterns));
  const cache = staged ? loadCache(cwd) : {};
  const newCache = { ...cache };

  const filesWithContent = [];
  for (const relPath of filesToScan) {
    const content = readFileContent(relPath, { staged, cwd });
    if (content === null || isBinaryOrLarge(content)) {
      continue;
    }
    filesWithContent.push({ path: relPath.replace(/\\/g, '/'), content });
  }

  let mode = 'offline-fallback';
  let issues = [];

  // 1. Run comprehensive local rule engine (deterministic, instant, zero dependencies)
  for (const item of filesWithContent) {
    const contentHash = computeContentHash(item.content);
    if (cache[item.path]?.hash === contentHash && cache[item.path]?.clean) {
      // Cached clean file
      continue;
    }

    const fileIssues = [
      ...scanSecrets(item.path, item.content),
      ...scanSqlInjection(item.path, item.content),
      ...scanXss(item.path, item.content),
      ...scanCrypto(item.path, item.content),
      ...scanConfig(item.path, item.content),
      ...scanDependencies(item.path, item.content)
    ];

    if (fileIssues.length === 0) {
      newCache[item.path] = { hash: contentHash, clean: true };
    } else {
      delete newCache[item.path];
      issues.push(...fileIssues);
    }
  }

  if (staged) {
    saveCache(newCache, cwd);
  }

  // 2. Try online ML-engine scan if configured to supplement analysis
  if (config.ml_engine_url) {
    const mlFindings = await scanWithMlEngine({
      filesWithContent,
      mlEngineUrl: config.ml_engine_url
    });
    if (mlFindings !== null) {
      mode = 'online';
      // Merge unique ML findings
      const existingSignatures = new Set(issues.map((i) => `${i.file}:${i.line}:${i.id || i.threatType}`));
      for (const finding of mlFindings) {
        const sig = `${finding.file}:${finding.line}:${finding.id || finding.threatType}`;
        if (!existingSignatures.has(sig)) {
          issues.push(finding);
          existingSignatures.add(sig);
        }
      }
    }
  }

  // Filter out ignored rules and allowlisted items
  const activeIssues = issues.filter((issue) => {
    if (ignoredRules.has(issue.id) || ignoredRules.has(issue.threatType)) {
      return false;
    }
    if (isAllowlisted(issue, allowlist)) {
      return false;
    }
    return true;
  });

  const { score, rawScore, adjustedScore, scoreSource, riskLevel, counts } = calculateRiskScore(activeIssues, {
    score_source: config.score_source || 'raw'
  });
  const gate = evaluateGate({ score, counts, config, issues: activeIssues });

  return {
    scanTimestamp: new Date().toISOString(),
    mode,
    scanScope: scope,
    scannedFilesCount: filesWithContent.length,
    issues: activeIssues,
    overall_risk_score: score,
    raw_risk_score: rawScore,
    adjusted_risk_score: adjustedScore,
    score_source: scoreSource,
    riskLevel,
    summary: {
      total_issues: activeIssues.length,
      critical_count: counts.critical,
      high_count: counts.high,
      medium_count: counts.medium,
      low_count: counts.low
    },
    gate
  };
};
