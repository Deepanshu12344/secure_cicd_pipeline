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

  try {
    const ciStatusResponse = await fetch(`${dashboardUrl}/api/ci-status`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ci-api-key': apiKey
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    })

    const ciStatusText = await ciStatusResponse.text()
    let ciStatusData = null
    try {
      ciStatusData = ciStatusText ? JSON.parse(ciStatusText) : null
    } catch {
      ciStatusData = { raw: ciStatusText }
    }

    if (!ciStatusResponse.ok) {
      throw new Error(`Dashboard CI status update failed (${ciStatusResponse.status}): ${ciStatusText}`)
    }

    const ingestPayload = {
      projectId: payload.projectId,
      repositoryUrl: payload.repositoryUrl,
      repositoryFullName: payload.repositoryFullName,
      branch: payload.branch,
      commitSha: payload.commitSha,
      workflowRunUrl: payload.workflowRunUrl,
      reportFileName: 'report.json',
      report: payload.report
    }

    const scansIngestResponse = await fetch(`${dashboardUrl}/api/scans/ci-ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ci-api-key': apiKey
      },
      body: JSON.stringify(ingestPayload),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    })

    const scansIngestText = await scansIngestResponse.text()
    let scansIngestData = null
    try {
      scansIngestData = scansIngestText ? JSON.parse(scansIngestText) : null
    } catch {
      scansIngestData = { raw: scansIngestText }
    }

    if (!scansIngestResponse.ok) {
      throw new Error(`Dashboard scans ingest failed (${scansIngestResponse.status}): ${scansIngestText}`)
    }

    return {
      skipped: false,
      data: {
        ciStatus: ciStatusData,
        scansIngest: scansIngestData
      }
    }
  } catch (error) {
    throw new Error(error?.message || 'Dashboard update failed')
  }
}
