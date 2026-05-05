import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { buildDashboardPayload, updateDashboardStatus } from './dashboard-updater.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const scannerDir = path.join(repoRoot, 'capci_cd')
const scannerEntry = path.join(scannerDir, 'run_secure_pipeline.py')
const reportPath = path.join(scannerDir, 'reports', 'report.json')

const classifyIssues = (report) => {
  const summary = report?.summary || {}
  const criticalCount = Number(summary.critical_count || 0)
  const totalIssues = Number(summary.total_issues || 0)

  return {
    hasCritical: criticalCount > 0,
    criticalCount,
    nonCriticalCount: Math.max(0, totalIssues - criticalCount)
  }
}

const readJsonFile = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf-8'))

const runScanner = () =>
  new Promise((resolve, reject) => {
    const pythonCommand = process.env.PYTHON || 'python'
    const child = spawn(pythonCommand, [scannerEntry], {
      cwd: scannerDir,
      stdio: 'inherit',
      shell: false
    })

    child.on('error', reject)
    child.on('close', (code) => resolve(code ?? 1))
  })

const main = async () => {
  if (!fs.existsSync(scannerEntry)) {
    console.error(`Security scanner entry not found: ${scannerEntry}`)
    process.exit(1)
  }

  await runScanner()

  if (!fs.existsSync(reportPath)) {
    console.error(`Security report not found: ${reportPath}`)
    process.exit(1)
  }

  const report = readJsonFile(reportPath)
  const classification = classifyIssues(report)
  const payload = buildDashboardPayload({ report, classification })

  try {
    await updateDashboardStatus(payload)
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }

  console.log(
    JSON.stringify(
      {
        status: payload.status,
        issues: payload.issueCount,
        severitySummary: payload.severitySummary,
        timestamp: payload.timestamp
      },
      null,
      2
    )
  )

  if (classification.hasCritical) {
    console.error('Critical issues found. Failing CI/CD security check.')
    process.exit(1)
  }

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
