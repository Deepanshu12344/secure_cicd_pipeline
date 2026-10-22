import fs from 'fs';
import path from 'path';
import { isGitRepo, getGitRoot } from '../engine/git.js';
import { loadConfig } from '../config/index.js';
import { checkMlEngineHealth } from '../engine/mlClient.js';
import { HOOK_MARKER_START } from './installHook.js';

export const doctorCommand = async ({ configPath = null, cwd = process.cwd() } = {}) => {
  console.log('\n🔍 Running Secure CI/CD Doctor Diagnostics...\n');

  // 1. Git Repository Check
  const inGit = isGitRepo(cwd);
  if (inGit) {
    const gitRoot = getGitRoot(cwd);
    console.log(`✔ Git Repository: Found at ${gitRoot}`);
  } else {
    console.log(`✖ Git Repository: Not inside a git work tree. (Run git init)`);
  }

  // 2. Config File Check
  const { config, configPath: foundConfigPath, isDefault } = await loadConfig(configPath, cwd);
  if (!isDefault && foundConfigPath) {
    console.log(`✔ Config File: Loaded from ${foundConfigPath}`);
  } else {
    console.log(`ℹ Config File: No .securecicd.yaml found. Using built-in defaults. (Run secure-cicd init to create)`);
  }

  // 3. Git Hook Check
  if (inGit) {
    const gitRoot = getGitRoot(cwd);
    const hookFile = path.join(gitRoot, '.git', 'hooks', 'pre-commit');
    if (fs.existsSync(hookFile)) {
      const hookContent = fs.readFileSync(hookFile, 'utf-8');
      if (hookContent.includes(HOOK_MARKER_START)) {
        console.log(`✔ Pre-Commit Hook: Installed and active in ${hookFile}`);
      } else {
        console.log(`⚠ Pre-Commit Hook: File exists at ${hookFile} but does not contain secure-cicd. (Run secure-cicd install-hook)`);
      }
    } else {
      console.log(`✖ Pre-Commit Hook: Not installed. (Run secure-cicd install-hook)`);
    }
  }

  // 4. ML Engine Connectivity
  if (config.ml_engine_url) {
    process.stdout.write(`ℹ Checking ML Engine (${config.ml_engine_url})... `);
    const isHealthy = await checkMlEngineHealth(config.ml_engine_url);
    if (isHealthy) {
      console.log(`✔ Connected (Online mode active)`);
    } else {
      console.log(`⚠ Unreachable. Scanner will transparently use local offline rules.`);
    }
  } else {
    console.log(`ℹ ML Engine: Not configured. Scanner runs in 100% offline rule mode.`);
  }

  // 5. Dashboard Connectivity
  if (config.dashboard?.enabled && config.dashboard?.url) {
    const apiKeyEnv = config.dashboard.api_key_env || 'CI_INGEST_API_KEY';
    const hasKey = Boolean(process.env[apiKeyEnv]);
    console.log(`ℹ Dashboard: URL configured (${config.dashboard.url}), API Key env (${apiKeyEnv}): ${hasKey ? '✔ Set' : '⚠ Missing'}`);
  } else {
    console.log(`ℹ Dashboard Integration: Disabled in config.`);
  }

  console.log('\nDoctor diagnosis completed.\n');
  return { success: true };
};
