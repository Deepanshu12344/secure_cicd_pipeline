import fs from 'fs';
import path from 'path';

export const DEFAULT_CONFIG = {
  version: 1,
  scan_scope: 'staged',
  fail_on: 'high',
  max_risk_score: 6.0,
  score_source: 'raw',
  mode: 'block',
  ml_engine_url: 'http://localhost:5001',
  dashboard: {
    enabled: false,
    url: '',
    api_key_env: 'CI_INGEST_API_KEY'
  },
  ignore: {
    paths: ['node_modules/**', 'dist/**', 'build/**', '*.min.js', '*.min.css'],
    rules: []
  },
  allowlist: []
};

export const DEFAULT_CONFIG_YAML = `# Secure CI/CD Pre-Commit Scanner Configuration
version: 1

# Scan scope: 'staged' (fast, only files about to be committed) or 'all' (entire repository)
scan_scope: staged

# Minimum finding severity that triggers a commit block: 'critical' | 'high' | 'medium' | 'low'
fail_on: high

# Maximum allowed overall risk score on a 0-10 scale (blocks commit if score exceeds this)
max_risk_score: 6.0

# Score source: 'raw' (default, deterministic severity sum) or 'adjusted' (ML probability-weighted)
score_source: raw

# Operating mode: 'block' (block commit), 'warn' (show report but allow commit), or 'off' (disable)
mode: block

# Optional URL to the AI/ML scanning engine; seamlessly falls back to offline rules if unreachable
ml_engine_url: http://localhost:5001

# Optional CI Dashboard integration for tracking local pre-commit activity & policy bypasses
dashboard:
  enabled: false
  url: "http://localhost:5000"
  api_key_env: CI_INGEST_API_KEY

# Ignore file paths and specific rule IDs
ignore:
  paths:
    - "node_modules/**"
    - "dist/**"
    - "build/**"
    - "*.min.js"
    - "*.min.css"
  rules: []

# Known false-positive exceptions (rule and path are required, along with a documented reason)
allowlist:
  # - rule: "SEC-004"
  #   path: "tests/fixtures/sample.js"
  #   reason: "Dummy test fixture credential"
`;

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * Basic YAML parser fallback if js-yaml is not installed
 */
const parseYamlSimple = (yamlText) => {
  const result = {
    ...DEFAULT_CONFIG,
    dashboard: { ...DEFAULT_CONFIG.dashboard },
    ignore: { paths: [], rules: [] },
    allowlist: []
  };

  const lines = yamlText.split(/\r?\n/);
  let currentSection = null;
  let currentSubsection = null;
  let currentObject = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    if (indent === 0) {
      currentObject = null;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx !== -1) {
        const key = trimmed.slice(0, colonIdx).trim();
        const val = trimmed.slice(colonIdx + 1).trim();
        if (['dashboard', 'ignore', 'allowlist'].includes(key)) {
          currentSection = key;
          currentSubsection = null;
        } else {
          currentSection = null;
          if (val) {
            if (val === 'true') result[key] = true;
            else if (val === 'false') result[key] = false;
            else if (!isNaN(Number(val))) result[key] = Number(val);
            else result[key] = val.replace(/^['"]|['"]$/g, '');
          }
        }
      }
    } else if (currentSection === 'dashboard') {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx !== -1) {
        const k = trimmed.slice(0, colonIdx).trim();
        const v = trimmed.slice(colonIdx + 1).trim();
        if (v === 'true') result.dashboard[k] = true;
        else if (v === 'false') result.dashboard[k] = false;
        else result.dashboard[k] = v.replace(/^['"]|['"]$/g, '');
      }
    } else if (currentSection === 'ignore') {
      const colonIdx = trimmed.indexOf(':');
      if (trimmed.startsWith('-')) {
        const item = trimmed.replace(/^-\s*/, '').trim().replace(/^['"]|['"]$/g, '');
        if (currentSubsection === 'paths') result.ignore.paths.push(item);
        else if (currentSubsection === 'rules') result.ignore.rules.push(item);
      } else if (colonIdx !== -1) {
        currentSubsection = trimmed.slice(0, colonIdx).trim();
      }
    } else if (currentSection === 'allowlist') {
      if (trimmed.startsWith('-')) {
        currentObject = {};
        result.allowlist.push(currentObject);
        const rest = trimmed.replace(/^-\s*/, '').trim();
        const colonIdx = rest.indexOf(':');
        if (colonIdx !== -1) {
          const k = rest.slice(0, colonIdx).trim();
          const v = rest.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
          currentObject[k] = v;
        }
      } else if (currentObject) {
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx !== -1) {
          const k = trimmed.slice(0, colonIdx).trim();
          const v = trimmed.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
          currentObject[k] = v;
        }
      }
    }
  }

  if (result.ignore.paths.length === 0) {
    result.ignore.paths = [...DEFAULT_CONFIG.ignore.paths];
  }

  return result;
};

/**
 * Load and validate YAML config
 */
export const loadConfig = async (configPath = null, cwd = process.cwd()) => {
  const candidates = configPath
    ? [path.resolve(cwd, configPath)]
    : [
        path.join(cwd, '.securecicd.yaml'),
        path.join(cwd, '.securecicd.yml')
      ];

  const foundPath = candidates.find((p) => fs.existsSync(p));
  if (!foundPath) {
    return { config: { ...DEFAULT_CONFIG }, configPath: null, isDefault: true };
  }

  const raw = fs.readFileSync(foundPath, 'utf-8');
  let parsed = null;

  try {
    let yamlLoad = null;
    try {
      const yaml = require('js-yaml');
      if (yaml && typeof yaml.load === 'function') yamlLoad = yaml.load;
    } catch {}

    if (!yamlLoad) {
      const yamlModule = await import('js-yaml').catch(() => null);
      if (yamlModule && yamlModule.default && typeof yamlModule.default.load === 'function') {
        yamlLoad = yamlModule.default.load;
      }
    }

    if (yamlLoad) {
      parsed = yamlLoad(raw);
    } else {
      parsed = parseYamlSimple(raw);
    }
  } catch {
    parsed = parseYamlSimple(raw);
  }

  const validated = validateConfig(parsed || {});
  return { config: validated, configPath: foundPath, isDefault: false };
};

export const validateConfig = (userConfig = {}) => {
  const config = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    dashboard: { ...DEFAULT_CONFIG.dashboard, ...(userConfig.dashboard || {}) },
    ignore: {
      paths: Array.isArray(userConfig.ignore?.paths) ? userConfig.ignore.paths : DEFAULT_CONFIG.ignore.paths,
      rules: Array.isArray(userConfig.ignore?.rules) ? userConfig.ignore.rules : DEFAULT_CONFIG.ignore.rules
    },
    allowlist: Array.isArray(userConfig.allowlist) ? userConfig.allowlist : []
  };

  // Validate scan_scope
  if (!['staged', 'all'].includes(String(config.scan_scope).toLowerCase())) {
    config.scan_scope = 'staged';
  }

  // Validate fail_on
  if (!['critical', 'high', 'medium', 'low'].includes(String(config.fail_on).toLowerCase())) {
    config.fail_on = 'high';
  }

  // Validate mode
  if (!['block', 'warn', 'off'].includes(String(config.mode).toLowerCase())) {
    config.mode = 'block';
  }

  // Validate max_risk_score
  const scoreNum = Number(config.max_risk_score);
  config.max_risk_score = Number.isFinite(scoreNum) && scoreNum >= 0 ? scoreNum : 6.0;

  // Validate score_source (default 'raw', option 'adjusted')
  if (!['raw', 'adjusted'].includes(String(config.score_source || '').toLowerCase())) {
    config.score_source = 'raw';
  } else {
    config.score_source = String(config.score_source).toLowerCase();
  }

  return config;
};
