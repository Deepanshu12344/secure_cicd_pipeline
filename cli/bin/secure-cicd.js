#!/usr/bin/env node

import { initCommand } from '../src/commands/init.js';
import { scanCommand } from '../src/commands/scan.js';
import { installHook } from '../src/commands/installHook.js';
import { uninstallHook } from '../src/commands/uninstallHook.js';
import { doctorCommand } from '../src/commands/doctor.js';

const VERSION = '1.0.0';

const printHelp = () => {
  console.log(`
🛡️  secure-cicd (v${VERSION}) - Pre-commit security scanner and CI/CD gate

USAGE:
  $ secure-cicd <command> [options]
  $ npx secure-cicd <command> [options]

COMMANDS:
  init            Create .securecicd.yaml and install Git pre-commit hook
  scan            Run security scan on staged files or repository
  install-hook    Install or update the Git pre-commit hook
  uninstall-hook  Cleanly remove or restore previous Git pre-commit hook
  doctor          Run diagnostics on Git repo, config, hook, and services

OPTIONS (for scan):
  --staged        Scan only git staged files (default, ultra-fast)
  --all           Scan all files in the repository
  --format <fmt>  Output format: table (default) | json | sarif
  --config <path> Custom path to configuration YAML file
  -h, --help      Display this help menu
  -v, --version   Display version

EXAMPLES:
  $ npx secure-cicd init
  $ npx secure-cicd scan --staged
  $ npx secure-cicd scan --all --format json
  $ npx secure-cicd doctor
`);
};

const parseArgs = (argv) => {
  const args = argv.slice(2);
  let command = 'scan'; // default if flags provided directly
  let staged = null;
  let all = false;
  let format = 'table';
  let configPath = null;
  let help = false;
  let version = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['init', 'scan', 'install-hook', 'uninstall-hook', 'doctor'].includes(arg)) {
      command = arg;
    } else if (arg === '--staged') {
      staged = true;
    } else if (arg === '--all') {
      all = true;
    } else if (arg === '--format' && args[i + 1]) {
      format = args[++i];
    } else if (arg.startsWith('--format=')) {
      format = arg.split('=')[1];
    } else if (arg === '--config' && args[i + 1]) {
      configPath = args[++i];
    } else if (arg.startsWith('--config=')) {
      configPath = arg.split('=')[1];
    } else if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '-v' || arg === '--version') {
      version = true;
    }
  }

  return { command, staged, all, format, configPath, help, version };
};

const main = async () => {
  const { command, staged, all, format, configPath, help, version } = parseArgs(process.argv);

  if (help) {
    printHelp();
    process.exit(0);
  }

  if (version) {
    console.log(`secure-cicd v${VERSION}`);
    process.exit(0);
  }

  try {
    if (command === 'init') {
      const res = await initCommand();
      process.exit(res.success ? 0 : 1);
    } else if (command === 'install-hook') {
      const res = installHook();
      if (res.success) {
        console.log(`✔ Git pre-commit hook installed at ${res.hookPath}`);
        process.exit(0);
      } else {
        console.error(`✖ Failed to install Git hook: ${res.error}`);
        process.exit(1);
      }
    } else if (command === 'uninstall-hook') {
      const res = uninstallHook();
      console.log(res.message);
      process.exit(res.success ? 0 : 1);
    } else if (command === 'doctor') {
      await doctorCommand({ configPath });
      process.exit(0);
    } else if (command === 'scan') {
      const res = await scanCommand({ staged, all, format, configPath });
      process.exit(res.exitCode);
    } else {
      printHelp();
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n✖ Fatal error: ${error.message}`);
    process.exit(1);
  }
};

main();
