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

const resolvePythonCommand = () => {
  if (process.env.PYTHON && process.env.PYTHON !== 'python') return process.env.PYTHON
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN
  const venvs = [
    path.join(repoRoot, '.venv', 'bin', 'python'),
    path.join(scannerDir, '.venv', 'bin', 'python')
  ]
  for (const venvPython of venvs) {
    if (fs.existsSync(venvPython)) return venvPython
  }
  return process.platform === 'win32' ? 'python' : 'python3'
}

const runScanner = () =>
  new Promise((resolve, reject) => {
    const pythonCommand = resolvePythonCommand()
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
    return 1
  }

  await runScanner()

  if (!fs.existsSync(reportPath)) {
    console.error(`Security report not found: ${reportPath}`)
    return 1
  }

  const report = readJsonFile(reportPath)
  const classification = classifyIssues(report)
  const payload = buildDashboardPayload({ report, classification })

  try {
    await updateDashboardStatus(payload)
  } catch (error) {
    console.error(error.message)
    return 1
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
    return 1
  }

  return 0
}

main().catch((error) => {
  console.error(error)
  return 1
}).then((code) => {
  process.exitCode = Number.isInteger(code) ? code : 1
})
