import fs from 'fs';
import path from 'path';
import { DEFAULT_CONFIG_YAML } from '../config/index.js';
import { installHook } from './installHook.js';

export const initCommand = async ({ cwd = process.cwd() } = {}) => {
  console.log('🚀 Initializing Secure CI/CD pre-commit scanner...');

  const configPath = path.join(cwd, '.securecicd.yaml');
  let configCreated = false;

  if (!fs.existsSync(configPath) && !fs.existsSync(path.join(cwd, '.securecicd.yml'))) {
    fs.writeFileSync(configPath, DEFAULT_CONFIG_YAML, 'utf-8');
    configCreated = true;
    console.log(`✔ Created configuration file: ${configPath}`);
  } else {
    console.log(`ℹ Configuration file already exists at ${configPath}`);
  }

  const hookResult = installHook({ cwd });
  if (hookResult.success) {
    if (hookResult.backedUp) {
      console.log(`✔ Backed up existing hook to: ${hookResult.backedUp}`);
    }
    console.log(`✔ Installed Git pre-commit hook in: ${hookResult.hookPath}`);
  } else {
    console.warn(`⚠ Could not install Git hook: ${hookResult.error}`);
  }

  console.log('\n🎉 Setup complete! From now on, `git commit` will automatically scan staged files.');
  console.log('Tips:');
  console.log('  - Run a manual scan anytime: `npx secure-cicd scan`');
  console.log('  - Check diagnostic status:   `npx secure-cicd doctor`');
  console.log('  - Temporary emergency bypass: `git commit --no-verify` or `SECURECICD_SKIP=1 git commit`\n');

  return { success: true, configCreated, hookInstalled: hookResult.success };
};
