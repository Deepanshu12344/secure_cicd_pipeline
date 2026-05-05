const DEFAULT_TIMEOUT_MS = 10000

const withTrailingSlashTrimmed = (value) => String(value || '').replace(/\/+$/, '')

const buildWorkflowRunUrl = () => {
  const serverUrl = String(process.env.GITHUB_SERVER_URL || 'https://github.com').trim()
  const repository = String(process.env.GITHUB_REPOSITORY || '').trim()
  const runId = String(process.env.GITHUB_RUN_ID || '').trim()

  if (!repository || !runId) return ''
  return `${withTrailingSlashTrimmed(serverUrl)}/${repository}/actions/runs/${runId}`
}

export const buildDashboardPayload = ({ report, classification }) => {
  const summary = report?.summary || {}

  return {
    projectId: String(process.env.DASHBOARD_PROJECT_ID || '').trim() || undefined,
    repositoryUrl: String(process.env.GITHUB_SERVER_URL || 'https://github.com').trim() &&
      String(process.env.GITHUB_REPOSITORY || '').trim()
      ? `${withTrailingSlashTrimmed(process.env.GITHUB_SERVER_URL || 'https://github.com')}/${String(process.env.GITHUB_REPOSITORY || '').trim()}`
      : undefined,
    repositoryFullName: String(process.env.GITHUB_REPOSITORY || '').trim() || undefined,
    branch: String(process.env.GITHUB_REF_NAME || 'main').trim() || 'main',
    commitSha: String(process.env.GITHUB_SHA || '').trim() || undefined,
    workflowRunUrl: buildWorkflowRunUrl() || undefined,
    status: classification.hasCritical ? 'failed' : 'passed',
    issueCount: Number(summary.total_issues || 0),
    severitySummary: {
      critical: Number(summary.critical_count || 0),
      high: Number(summary.high_count || 0),
      medium: Number(summary.medium_count || 0),
      low: Number(summary.low_count || 0),
      nonCritical: Number(classification.nonCriticalCount || 0)
    },
    timestamp: String(report?.scan_timestamp || new Date().toISOString()),
    source: 'github-actions',
    report
  }
}

export const updateDashboardStatus = async (payload) => {
  const dashboardUrl = withTrailingSlashTrimmed(process.env.DASHBOARD_URL || '')
  const apiKey = String(process.env.CI_INGEST_API_KEY || '').trim()

  if (!dashboardUrl) {
    console.warn('Skipping dashboard update because DASHBOARD_URL is not set.')
    return { skipped: true, reason: 'missing_dashboard_url' }
  }

  if (!apiKey) {
    console.warn('Skipping dashboard update because CI_INGEST_API_KEY is not set.')
    return { skipped: true, reason: 'missing_ci_ingest_api_key' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const response = await fetch(`${dashboardUrl}/api/ci-status`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ci-api-key': apiKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    })

    const text = await response.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { raw: text }
    }

    if (!response.ok) {
      throw new Error(`Dashboard update failed (${response.status}): ${text}`)
    }

    return { skipped: false, data }
  } finally {
    clearTimeout(timeout)
  }
}
