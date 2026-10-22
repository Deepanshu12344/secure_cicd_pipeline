import { execSync } from 'child_process';

const DEFAULT_TIMEOUT_MS = 3000;

const getRepoInfo = (cwd = process.cwd()) => {
  try {
    const remoteUrl = execSync('git config --get remote.origin.url', {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8'
    }).trim();

    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8'
    }).trim() || 'main';

    const commitSha = execSync('git rev-parse HEAD', {
      cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf-8'
    }).trim() || 'local-commit';

    return { repositoryUrl: remoteUrl, branch, commitSha };
  } catch {
    return { repositoryUrl: '', branch: 'main', commitSha: 'local-commit' };
  }
};

export const reportToDashboard = async ({ report, config, isBypass = false, cwd = process.cwd() }) => {
  const dashboardConfig = config.dashboard || {};
  if (!dashboardConfig.enabled || !dashboardConfig.url) {
    return { skipped: true, reason: 'dashboard_disabled' };
  }

  const apiKeyEnv = dashboardConfig.api_key_env || 'CI_INGEST_API_KEY';
  const apiKey = String(process.env[apiKeyEnv] || '').trim();
  const cleanUrl = dashboardConfig.url.replace(/\/+$/, '');
  const { repositoryUrl, branch, commitSha } = getRepoInfo(cwd);

  const payload = {
    repositoryUrl,
    repositoryFullName: repositoryUrl ? repositoryUrl.split('/').slice(-2).join('/').replace(/\.git$/, '') : undefined,
    branch,
    commitSha,
    status: isBypass ? 'passed' : report?.gate?.blocked ? 'failed' : 'passed',
    issueCount: Number(report?.summary?.total_issues || 0),
    severitySummary: {
      critical: Number(report?.summary?.critical_count || 0),
      high: Number(report?.summary?.high_count || 0),
      medium: Number(report?.summary?.medium_count || 0),
      low: Number(report?.summary?.low_count || 0),
      nonCritical: Number((report?.summary?.medium_count || 0) + (report?.summary?.low_count || 0))
    },
    timestamp: new Date().toISOString(),
    source: 'pre-commit',
    isBypass,
    report
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['x-ci-api-key'] = apiKey;
    }

    const res = await fetch(`${cleanUrl}/api/ci-status`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);
    return { skipped: false, ok: res.ok, status: res.status };
  } catch (error) {
    // Non-blocking: network failures must never block commits
    return { skipped: true, error: error.message };
  }
};
