import { loadConfig } from '../config/index.js';
import { runScan } from '../engine/index.js';
import { formatTable } from '../formatters/table.js';
import { formatJson } from '../formatters/json.js';
import { formatSarif } from '../formatters/sarif.js';
import { reportToDashboard } from '../reporters/dashboard.js';

export const scanCommand = async ({
  staged = null,
  all = false,
  format = 'table',
  configPath = null,
  cwd = process.cwd()
} = {}) => {
  // Check bypass environment variable
  if (process.env.SECURECICD_SKIP === '1' || process.env.SECURECICD_SKIP === 'true') {
    console.log('⚠ SECURECICD_SKIP=1 detected. Bypassing pre-commit scan.');
    const { config } = await loadConfig(configPath, cwd);
    if (config.dashboard?.enabled) {
      await reportToDashboard({
        report: null,
        config,
        isBypass: true,
        cwd
      });
    }
    return { exitCode: 0, bypassed: true };
  }

  const { config } = await loadConfig(configPath, cwd);

  // Determine scan scope
  let scanStaged = true;
  if (all) {
    scanStaged = false;
  } else if (staged !== null) {
    scanStaged = Boolean(staged);
  } else {
    scanStaged = config.scan_scope !== 'all';
  }

  const report = await runScan({
    cwd,
    staged: scanStaged,
    config
  });

  // Report to dashboard if enabled (non-blocking)
  if (config.dashboard?.enabled) {
    reportToDashboard({
      report,
      config,
      isBypass: false,
      cwd
    }).catch(() => {});
  }

  // Format and print report
  const normalizedFormat = String(format || 'table').toLowerCase();
  if (normalizedFormat === 'json') {
    console.log(formatJson(report));
  } else if (normalizedFormat === 'sarif') {
    console.log(formatSarif(report));
  } else {
    console.log(formatTable(report));
  }

  const exitCode = report.gate.blocked ? 1 : 0;
  return { exitCode, report };
};
