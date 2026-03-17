import express from 'express'
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { protect } from '../middleware/authMiddleware.js'
import Scan from '../models/Scan.js'
import Project from '../models/Project.js'
import Risk from '../models/Risk.js'
import User from '../models/User.js'

const router = express.Router()
const getOwnerId = (req) => req.user?._id || req.user?.id

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '../../..')
const ciReportsDir = path.resolve(__dirname, '../../uploads/ci-reports')
const analyzerDir = ['code-analyzer', 'Code-Analyzer']
  .map((dir) => path.join(workspaceRoot, dir))
  .find((dir) => fs.existsSync(path.join(dir, 'analyzer.py')))
const cicdScannerDir = ['capci_cd', 'capci_cd_extracted']
  .map((dir) => path.join(workspaceRoot, dir))
  .find((dir) => fs.existsSync(path.join(dir, 'scanner.py')))

const ciReportStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const repo = String(req.body.repository || req.body.repositoryFullName || '').replace(/[^a-zA-Z0-9._-]+/g, '_')
    const dest = path.join(ciReportsDir, repo || 'unknown')
    fs.mkdirSync(dest, { recursive: true })
    cb(null, dest)
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now()
    const base = path.basename(file.originalname || 'scan-report.json').replace(/[^a-zA-Z0-9._-]+/g, '_')
    cb(null, `${timestamp}-${base}`)
  }
})

const ciReportUpload = multer({ storage: ciReportStorage })

const runningScans = new Set()

const parseRepositoryName = (repositoryUrl) => {
  const clean = String(repositoryUrl || '').trim().replace(/\/+$/, '')
  const lastPart = clean.split('/').pop() || 'repository'
  return lastPart.replace(/\.git$/i, '') || 'repository'
}

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizeRepositoryIdentifier = (value) => {
  let normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return ''

  normalized = normalized.replace(/\.git$/i, '').replace(/\/+$/, '')
  normalized = normalized.replace(/^git@([^:]+):/, '$1/')
  normalized = normalized.replace(/^ssh:\/\//, '')
  normalized = normalized.replace(/^https?:\/\//, '')
  normalized = normalized.replace(/^www\./, '')
  normalized = normalized.replace(/^[^/]*github\.com\//, '')

  const parts = normalized.split('/').filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
  }

  return normalized
}

const resolveCiIngestProject = async ({ projectId, repositoryUrl, repositoryFullName }) => {
  if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
    return { project: await Project.findById(projectId), reason: '' }
  }

  const normalizedCandidates = [
    normalizeRepositoryIdentifier(repositoryFullName),
    normalizeRepositoryIdentifier(repositoryUrl)
  ].filter(Boolean)

  if (normalizedCandidates.length === 0) {
    return {
      project: null,
      reason: 'Either a valid projectId or repositoryUrl/repositoryFullName is required'
    }
  }

  const uniqueCandidates = [...new Set(normalizedCandidates)]
  const orConditions = []
  uniqueCandidates.forEach((candidate) => {
    const escaped = escapeRegex(candidate)
    orConditions.push({ fullName: { $regex: new RegExp(`^${escaped}$`, 'i') } })
    orConditions.push({ repositoryUrl: { $regex: new RegExp(`(?:^|/)${escaped}(?:\\.git)?/?$`, 'i') } })
  })

  const projects = await Project.find({ $or: orConditions }).limit(5)
  if (projects.length === 1) {
    return { project: projects[0], reason: '' }
  }
  if (projects.length > 1) {
    return {
      project: null,
      reason: 'Multiple projects matched repository. Set DASHBOARD_PROJECT_ID to avoid ambiguity'
    }
  }

  return {
    project: null,
    reason: 'Project not found for repository. Import the repository or provide DASHBOARD_PROJECT_ID'
  }
}

const resolveCiIngestOwner = async () => {
  const ownerId = String(process.env.CI_INGEST_OWNER_ID || '').trim()
  if (ownerId && mongoose.Types.ObjectId.isValid(ownerId)) {
    const user = await User.findById(ownerId)
    if (user) return user
  }

  const ownerEmail = String(process.env.CI_INGEST_OWNER_EMAIL || '').trim().toLowerCase()
  if (ownerEmail) {
    const user = await User.findOne({ email: ownerEmail })
    if (user) return user
  }

  return User.findOne()
}

const listFilesByExtension = (dirPath, extension) => {
  if (!dirPath || !fs.existsSync(dirPath)) return []

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension))
    .map((entry) => {
      const fullPath = path.join(dirPath, entry.name)
      const stat = fs.statSync(fullPath)
      return { name: entry.name, fullPath, mtimeMs: stat.mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

const getNewestAddedFile = (beforeFiles, afterFiles) => {
  const beforeMap = new Map(beforeFiles.map((file) => [file.name, file.mtimeMs]))
  const candidates = afterFiles.filter((file) => {
    const beforeTime = beforeMap.get(file.name)
    return !beforeTime || file.mtimeMs > beforeTime
  })

  return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0] || null
}

const extractReportNamesFromOutput = (output) => {
  const pdfMatches = [...String(output || '').matchAll(/reports\/([^\s]+\.pdf)/g)]
  const jsonMatches = [...String(output || '').matchAll(/json_output\/([^\s]+\.json)/g)]

  return {
    pdfFile: pdfMatches.length ? pdfMatches[pdfMatches.length - 1][1] : null,
    jsonFile: jsonMatches.length ? jsonMatches[jsonMatches.length - 1][1] : null
  }
}

const normalizeSeverity = (value) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'critical') return 'Critical'
  if (normalized === 'high') return 'High'
  if (normalized === 'medium') return 'Medium'
  return 'Low'
}

const mapSeverityToRiskScore = (severity) => {
  if (severity === 'Critical') return 95
  if (severity === 'High') return 80
  if (severity === 'Medium') return 55
  return 25
}

const buildCicdOnlySummary = (report) => {
  const safeReport = report && typeof report === 'object' ? report : {}
  const issues = Array.isArray(safeReport.issues) ? safeReport.issues : []
  const summary = safeReport.summary && typeof safeReport.summary === 'object' ? safeReport.summary : {}
  const severityCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 }
  const categoryCounts = {}

  issues.forEach((issue) => {
    const severity = normalizeSeverity(issue?.severity)
    severityCounts[severity] = (severityCounts[severity] || 0) + 1

    const category = String(issue?.threat_type || issue?.category_label || issue?.category || 'CI/CD Security')
    categoryCounts[category] = (categoryCounts[category] || 0) + 1
  })

  const totalIssues = Number(summary.total_issues || issues.length || 0)
  const riskScore = Number(safeReport.overall_risk_score || 0)

  return {
    totalFilesAnalyzed: 0,
    totalIssues,
    metrics: {
      overall: Math.max(0, 100 - riskScore),
      accuracy: 0,
      complexity: 0,
      efficiency: 0,
      maintainability: 0,
      documentation: 0
    },
    skillsGap: {
      overallProficiency: 0,
      skillLevels: {},
      identifiedGaps: []
    },
    severityCounts,
    categoryCounts,
    cicd: {
      overallRiskScore: riskScore,
      overallSeverity: String(safeReport.overall_severity || '')
    }
  }
}

const parseJsonFile = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return null

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

const runPythonCommand = ({ cwd, args, allowExitCodes = [0], outputLimit = 120000 }) =>
  new Promise((resolve, reject) => {
    const pythonBin = process.env.PYTHON_BIN || 'python'
    let output = ''

    const child = spawn(pythonBin, args, {
      cwd,
      env: { ...process.env, PYTHONUTF8: '1' }
    })

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
      if (output.length > outputLimit) output = output.slice(-outputLimit)
    })

    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
      if (output.length > outputLimit) output = output.slice(-outputLimit)
    })

    child.on('error', (error) => {
      reject(new Error(`Failed to run Python command: ${error.message}`))
    })

    child.on('close', (code) => {
      if (!allowExitCodes.includes(code)) {
        reject(new Error(`Process exited with code ${code}. ${output.slice(-800)}`))
        return
      }

      resolve({ code, output })
    })
  })

const mapCicdIssuesToUnifiedIssues = (issues) => {
  if (!Array.isArray(issues)) return []

  return issues.map((issue) => {
    const location = issue?.location || {}
    const filePath = String(location?.file_path || '')
    const line = Number(location?.line_number || 0)
    const threatType = String(issue?.threat_type || 'CI/CD Security')
    const title = String(issue?.title || 'CI/CD security risk')
    const severity = normalizeSeverity(issue?.severity)
    const stepName = String(location?.step_name || '')

    return {
      issue: title,
      location: line > 0 ? `${filePath}:${line}` : filePath || stepName || 'CI/CD pipeline',
      code: stepName,
      severity,
      reason: String(issue?.description || issue?.impact || ''),
      category: 'CI/CD Security',
      category_label: threatType,
      file: filePath || null,
      threat_type: threatType,
      remediation: String(issue?.remediation || ''),
      source: 'cicd',
      sourceIssueId: String(issue?.id || '')
    }
  })
}

const mergeAnalyzerAndCicdJson = ({ codeJson, cicdJson }) => {
  const base = codeJson && typeof codeJson === 'object' ? { ...codeJson } : {}
  const codeIssues = Array.isArray(base?.critical_issues) ? base.critical_issues : []
  const cicdIssues = mapCicdIssuesToUnifiedIssues(cicdJson?.issues)
  const mergedIssues = [...codeIssues, ...cicdIssues]

  const sources = {
    codeAnalyzer: codeIssues.length,
    cicdSecurity: cicdIssues.length
  }

  const summary = cicdJson?.summary || {}

  return {
    ...base,
    critical_issues: mergedIssues,
    combined_sources: sources,
    cicd_analysis: cicdJson
      ? {
          pipeline_name: cicdJson.pipeline_name || '',
          overall_risk_score: Number(cicdJson.overall_risk_score || 0),
          overall_severity: String(cicdJson.overall_severity || ''),
          summary: {
            total_issues: Number(summary.total_issues || 0),
            critical_count: Number(summary.critical_count || 0),
            high_count: Number(summary.high_count || 0),
            medium_count: Number(summary.medium_count || 0),
            low_count: Number(summary.low_count || 0)
          }
        }
      : null
  }
}

const syncRisksForScan = async ({ scanDoc, projectId, mergedIssues }) => {
  if (!scanDoc || !Array.isArray(mergedIssues)) return

  await Risk.deleteMany({
    ownerId: scanDoc.ownerId,
    scanId: scanDoc._id,
    source: { $in: ['analyzer', 'cicd'] }
  })

  const risksToInsert = mergedIssues
    .map((issue) => {
      const severity = normalizeSeverity(issue?.severity)
      const fileFromIssue = String(issue?.file || '')
      const locationText = String(issue?.location || '')
      const lineMatch = locationText.match(/:(\d+)(?!.*:\d+)/)
      const parsedLine = lineMatch ? Number(lineMatch[1]) : null
      const fileFromLocation = lineMatch ? locationText.slice(0, lineMatch.index) : locationText
      const threatType = String(issue?.threat_type || issue?.category_label || issue?.category || 'Code Security')
      const source = String(issue?.source || '').toLowerCase() === 'cicd' ? 'cicd' : 'analyzer'
      const title = String(issue?.issue || issue?.title || '').trim()
      if (!title) return null

      return {
        ownerId: scanDoc.ownerId,
        projectId,
        scanId: scanDoc._id,
        title,
        description: String(issue?.reason || ''),
        severity: severity.toLowerCase(),
        riskScore: mapSeverityToRiskScore(severity),
        file: fileFromIssue || (fileFromLocation && !fileFromLocation.includes(' ') ? fileFromLocation : null),
        line: parsedLine,
        status: 'open',
        source,
        sourceIssueId: String(issue?.sourceIssueId || issue?.id || '') || null,
        threatType,
        remediation: String(issue?.remediation || '')
      }
    })
    .filter(Boolean)

  if (risksToInsert.length === 0) return
  await Risk.insertMany(risksToInsert, { ordered: false })
}

const buildAnalysisSummary = (jsonData) => {
  const aggregate = jsonData?.aggregate_metrics || {}
  const criticalIssues = Array.isArray(jsonData?.critical_issues) ? jsonData.critical_issues : []
  const skillsGap = jsonData?.skills_gap_analysis || {}
  const skillLevels = skillsGap?.skill_levels && typeof skillsGap.skill_levels === 'object' ? skillsGap.skill_levels : {}
  const identifiedGaps = Array.isArray(skillsGap?.identified_gaps) ? skillsGap.identified_gaps : []
  const severityCounts = { High: 0, Medium: 0, Low: 0 }
  const categoryCounts = {}

  criticalIssues.forEach((issue) => {
    const severity = String(issue?.severity || 'Low')
    if (severityCounts[severity] === undefined) severityCounts[severity] = 0
    severityCounts[severity] += 1

    const category = String(issue?.category_label || issue?.category || 'Other')
    categoryCounts[category] = (categoryCounts[category] || 0) + 1
  })

  return {
    totalFilesAnalyzed: Number(jsonData?.total_files_analyzed || 0),
    totalIssues: criticalIssues.length,
    metrics: {
      overall: Number(aggregate?.overall_score || 0),
      accuracy: Number(aggregate?.accuracy || 0),
      complexity: Number(aggregate?.complexity || 0),
      efficiency: Number(aggregate?.efficiency || 0),
      maintainability: Number(aggregate?.maintainability || 0),
      documentation: Number(aggregate?.documentation || 0)
    },
    skillsGap: {
      overallProficiency: Number(skillsGap?.overall_proficiency || 0),
      skillLevels: Object.entries(skillLevels).reduce((acc, [name, score]) => {
        acc[String(name)] = Number(score || 0)
        return acc
      }, {}),
      identifiedGaps: identifiedGaps.map((gap) => ({
        skill: String(gap?.skill || ''),
        score: Number(gap?.score || 0),
        severity: String(gap?.severity || 'Medium')
      }))
    },
    severityCounts,
    categoryCounts
  }
}

const toResponse = (scanDoc) => ({
  id: String(scanDoc._id),
  ownerId: String(scanDoc.ownerId),
  projectId:
    typeof scanDoc.projectId === 'object' && scanDoc.projectId?._id
      ? String(scanDoc.projectId._id)
      : String(scanDoc.projectId),
  projectName: typeof scanDoc.projectId === 'object' && scanDoc.projectId?.name ? scanDoc.projectId.name : null,
  projectFullName:
    typeof scanDoc.projectId === 'object' && scanDoc.projectId?.fullName ? scanDoc.projectId.fullName : null,
  repositoryUrl: scanDoc.repositoryUrl,
  scanType: scanDoc.scanType || 'full',
  branch: scanDoc.branch || 'main',
  status: scanDoc.status || 'queued',
  progress: Number(scanDoc.progress || 0),
  startedAt: scanDoc.startedAt || null,
  completedAt: scanDoc.completedAt || null,
  findings: Array.isArray(scanDoc.findings) ? scanDoc.findings : [],
  analysisSummary: scanDoc.analysisSummary || null,
  errorMessage: scanDoc.errorMessage || '',
  reportFiles: {
    pdfFile: scanDoc.reportFiles?.pdfFile || null,
    jsonFile: scanDoc.reportFiles?.jsonFile || null
  },
  reportAvailable: Boolean(scanDoc.reportFiles?.pdfPath || scanDoc.reportFiles?.jsonPath),
  createdAt: scanDoc.createdAt,
  updatedAt: scanDoc.updatedAt
})

const hasSkillsGapData = (summary) => {
  const skillLevels = summary?.skillsGap?.skillLevels
  return Boolean(skillLevels && typeof skillLevels === 'object' && Object.keys(skillLevels).length > 0)
}

const hydrateSummaryFromJsonIfNeeded = async (scanDoc) => {
  if (!scanDoc) return scanDoc
  const currentSummary = scanDoc.analysisSummary

  if (hasSkillsGapData(currentSummary)) return scanDoc

  const jsonPath = scanDoc.reportFiles?.jsonPath
  if (!jsonPath || !fs.existsSync(jsonPath)) return scanDoc

  try {
    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    scanDoc.analysisSummary = buildAnalysisSummary(parsed)
    if (!Array.isArray(scanDoc.findings) || scanDoc.findings.length === 0) {
      scanDoc.findings = (Array.isArray(parsed.critical_issues) ? parsed.critical_issues : []).slice(0, 50)
    }
    await scanDoc.save()
  } catch {
    // Keep existing summary if parsing fails.
  }

  return scanDoc
}

const validateOwnedProject = async (ownerId, projectId) => {
  if (!mongoose.Types.ObjectId.isValid(projectId)) return null
  return Project.findOne({ _id: projectId, ownerId })
}

const saveScanFailure = async (scanId, errorText) => {
  const failedScan = await Scan.findById(scanId)
  if (!failedScan) return

  failedScan.status = 'failed'
  failedScan.progress = 100
  failedScan.completedAt = new Date()
  failedScan.errorMessage = String(errorText || 'Analyzer execution failed').slice(0, 2000)
  failedScan.analyzerLogTail = String(errorText || '').slice(-10000)
  await failedScan.save()
}

const executeAnalyzerForScan = async (scan) => {
  if (!analyzerDir) {
    throw new Error('Analyzer directory not found. Expected code-analyzer/analyzer.py')
  }

  const reportsDir = path.join(analyzerDir, 'reports')
  const jsonDir = path.join(analyzerDir, 'json_output')
  fs.mkdirSync(reportsDir, { recursive: true })
  fs.mkdirSync(jsonDir, { recursive: true })
  const beforePdfFiles = listFilesByExtension(reportsDir, '.pdf')
  const beforeJsonFiles = listFilesByExtension(jsonDir, '.json')

  const args = ['-X', 'utf8', 'analyzer.py', scan.repositoryUrl]
  if (process.env.ANALYZER_MAX_FILES) {
    args.push('--max-files', String(process.env.ANALYZER_MAX_FILES))
  }

  const analyzerRun = await runPythonCommand({
    cwd: analyzerDir,
    args
  })
  const output = analyzerRun.output

  const repoName = parseRepositoryName(scan.repositoryUrl)
  const { pdfFile: parsedPdf, jsonFile: parsedJson } = extractReportNamesFromOutput(output)
  const afterPdfFiles = listFilesByExtension(reportsDir, '.pdf')
  const afterJsonFiles = listFilesByExtension(jsonDir, '.json')
  const newestPdf = getNewestAddedFile(beforePdfFiles, afterPdfFiles)
  const newestJson = getNewestAddedFile(beforeJsonFiles, afterJsonFiles)

  const pdfFile = parsedPdf || (newestPdf?.name && newestPdf.name.includes(repoName) ? newestPdf.name : newestPdf?.name) || null
  const jsonFile =
    parsedJson || (newestJson?.name && newestJson.name.includes(repoName) ? newestJson.name : newestJson?.name) || null

  const jsonPath = jsonFile ? path.join(jsonDir, jsonFile) : null
  const codeJson = parseJsonFile(jsonPath)

  const tempRepoPath = path.join(analyzerDir, 'temp_repo')
  let cicdJsonPath = null
  let cicdPdfPath = null
  let cicdJson = null
  let cicdOutput = ''

  if (cicdScannerDir && fs.existsSync(tempRepoPath)) {
    try {
      const cicdFileName = `${repoName}_cicd_security_${Date.now()}.json`
      cicdJsonPath = path.join(jsonDir, cicdFileName)
      const cicdOutputDir = path.join(reportsDir, `cicd_${Date.now()}`)
      fs.mkdirSync(cicdOutputDir, { recursive: true })
      const cicdRun = await runPythonCommand({
        cwd: cicdScannerDir,
        args: ['scanner.py', '--repo-path', tempRepoPath, '--output', cicdJsonPath, '--output-dir', cicdOutputDir, '--pdf'],
        allowExitCodes: [0, 2]
      })
      cicdOutput = cicdRun.output
      cicdJson = parseJsonFile(cicdJsonPath)
      const generatedCicdPdf = path.join(cicdOutputDir, 'report.pdf')
      if (fs.existsSync(generatedCicdPdf)) {
        cicdPdfPath = generatedCicdPdf
      }
    } catch (error) {
      cicdOutput = `CI/CD scanner failed: ${error.message}`
      cicdJsonPath = null
      cicdPdfPath = null
      cicdJson = null
    }
  }

  let combinedJsonPath = null
  let combinedJsonFile = null
  let combinedPdfPath = null
  let combinedPdfFile = null
  if (codeJson || cicdJson) {
    const combined = mergeAnalyzerAndCicdJson({ codeJson, cicdJson })
    combinedJsonFile = `${repoName}_combined_analysis_${Date.now()}.json`
    combinedJsonPath = path.join(jsonDir, combinedJsonFile)
    fs.writeFileSync(combinedJsonPath, JSON.stringify(combined, null, 2), 'utf8')

    try {
      const combinedScriptPath = path.join(workspaceRoot, 'backend', 'scripts', 'generate_combined_pdf.py')
      if (fs.existsSync(combinedScriptPath)) {
        combinedPdfFile = `${repoName}_combined_security_report_${Date.now()}.pdf`
        combinedPdfPath = path.join(reportsDir, combinedPdfFile)
        await runPythonCommand({
          cwd: workspaceRoot,
          args: [combinedScriptPath, combinedJsonPath, combinedPdfPath, repoName]
        })
      }
    } catch (error) {
      const combinedPdfError = `Combined PDF generation failed: ${error.message}`
      cicdOutput = `${cicdOutput}\n${combinedPdfError}`.trim()
      combinedPdfPath = null
      combinedPdfFile = null
    }
  }

  return {
    output: `${output}\n${cicdOutput}`,
    pdfFile: combinedPdfFile || pdfFile,
    jsonFile: combinedJsonFile || jsonFile,
    pdfPath: combinedPdfPath || (pdfFile ? path.join(reportsDir, pdfFile) : null),
    jsonPath: combinedJsonPath || jsonPath,
    cicdPdfFile: cicdPdfPath ? path.basename(cicdPdfPath) : null,
    cicdPdfPath,
    cicdJsonFile: cicdJsonPath ? path.basename(cicdJsonPath) : null,
    cicdJsonPath,
    combinedJsonFile,
    combinedJsonPath,
    combinedPdfFile,
    combinedPdfPath
  }
}

const processScanRun = async (scanId) => {
  const scan = await Scan.findById(scanId)
  if (!scan) {
    runningScans.delete(scanId)
    return
  }

  try {
    const result = await executeAnalyzerForScan(scan)
    const freshScan = await Scan.findById(scanId)
    if (!freshScan) {
      runningScans.delete(scanId)
      return
    }

    const reportFiles = {
      pdfFile: result.pdfFile,
      pdfPath: result.pdfPath,
      jsonFile: result.jsonFile,
      jsonPath: result.jsonPath,
      cicdPdfFile: result.cicdPdfFile || null,
      cicdPdfPath: result.cicdPdfPath || null,
      cicdJsonFile: result.cicdJsonFile || null,
      cicdJsonPath: result.cicdJsonPath || null,
      combinedJsonFile: result.combinedJsonFile || null,
      combinedJsonPath: result.combinedJsonPath || null,
      combinedPdfFile: result.combinedPdfFile || null,
      combinedPdfPath: result.combinedPdfPath || null
    }

    if (!reportFiles.pdfPath && !reportFiles.jsonPath) {
      throw new Error(
        'Analyzer finished without generating report files. The repository may not contain supported code files.'
      )
    }

    let analysisSummary = null
    let findings = []

    let mergedIssues = []
    if (reportFiles.jsonPath && fs.existsSync(reportFiles.jsonPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(reportFiles.jsonPath, 'utf8'))
        analysisSummary = buildAnalysisSummary(parsed)
        mergedIssues = Array.isArray(parsed.critical_issues) ? parsed.critical_issues : []
        findings = mergedIssues.slice(0, 50)
      } catch {
        analysisSummary = null
      }
    }

    freshScan.status = 'completed'
    freshScan.progress = 100
    freshScan.completedAt = new Date()
    freshScan.errorMessage = ''
    freshScan.analyzerLogTail = String(result.output || '').slice(-10000)
    freshScan.analysisSummary = analysisSummary
    freshScan.reportFiles = reportFiles
    freshScan.findings = findings
    await freshScan.save()

    await syncRisksForScan({
      scanDoc: freshScan,
      projectId: freshScan.projectId,
      mergedIssues
    })

    const project = await Project.findById(freshScan.projectId)
    if (project) {
      project.lastScan = new Date()
      if (analysisSummary?.metrics?.overall !== undefined) {
        project.riskScore = Number((100 - analysisSummary.metrics.overall).toFixed(1))
      } else if (analysisSummary?.totalIssues !== undefined) {
        project.riskScore = Math.min(100, Number(analysisSummary.totalIssues || 0) * 5)
      }
      await project.save()
    }
  } catch (error) {
    await saveScanFailure(scanId, error.message || 'Analyzer execution failed')
  } finally {
    runningScans.delete(scanId)
  }
}

router.get('/', protect, async (req, res) => {
  const filter = { ownerId: getOwnerId(req) }
  if (req.query.projectId && mongoose.Types.ObjectId.isValid(req.query.projectId)) {
    filter.projectId = req.query.projectId
  }

  const scanDocs = await Scan.find(filter).populate('projectId', 'name fullName repositoryUrl').sort({ createdAt: -1 })
  const hydrated = await Promise.all(scanDocs.map((scanDoc) => hydrateSummaryFromJsonIfNeeded(scanDoc)))
  res.json({
    success: true,
    count: hydrated.length,
    data: hydrated.map(toResponse)
  })
})

router.post('/', protect, async (req, res) => {
  const ownerId = getOwnerId(req)
  const { projectId, repositoryUrl, scanType, branch } = req.body

  if (!projectId || !repositoryUrl) {
    return res.status(400).json({
      success: false,
      error: 'projectId and repositoryUrl are required'
    })
  }

  const project = await validateOwnedProject(ownerId, projectId)
  if (!project) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    })
  }

  const scan = await Scan.create({
    ownerId,
    projectId,
    repositoryUrl: String(repositoryUrl).trim(),
    scanType: scanType || 'full',
    branch: branch || 'main',
    status: 'queued',
    progress: 0,
    findings: []
  })

  res.status(201).json({
    success: true,
    data: toResponse(scan)
  })
})

router.delete('/failed', protect, async (req, res) => {
  const ownerId = getOwnerId(req)
  const failedScans = await Scan.find({ ownerId, status: 'failed' }).select('_id')
  const failedScanIds = failedScans.map((scan) => scan._id)

  if (failedScanIds.length > 0) {
    await Risk.deleteMany({ ownerId, scanId: { $in: failedScanIds } })
  }

  const result = await Scan.deleteMany({ ownerId, status: 'failed' })

  res.json({
    success: true,
    deletedCount: Number(result?.deletedCount || 0),
    message: 'Failed scans deleted successfully'
  })
})

router.get('/:id', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  const scan = await Scan.findOne({ _id: req.params.id, ownerId: getOwnerId(req) }).populate(
    'projectId',
    'name fullName repositoryUrl'
  )
  if (!scan) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  await hydrateSummaryFromJsonIfNeeded(scan)
  res.json({ success: true, data: toResponse(scan) })
})

router.post('/:id/run', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  const scan = await Scan.findOne({ _id: req.params.id, ownerId: getOwnerId(req) })
  if (!scan) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  const scanId = String(scan._id)
  if (runningScans.has(scanId) || scan.status === 'running') {
    return res.status(409).json({
      success: false,
      error: 'Scan is already running'
    })
  }

  scan.status = 'running'
  scan.progress = 5
  scan.startedAt = new Date()
  scan.completedAt = null
  scan.errorMessage = ''
  scan.analysisSummary = null
  scan.reportFiles = {
    pdfFile: null,
    pdfPath: null,
    jsonFile: null,
    jsonPath: null,
    cicdPdfFile: null,
    cicdPdfPath: null,
    cicdJsonFile: null,
    cicdJsonPath: null,
    combinedJsonFile: null,
    combinedJsonPath: null,
    combinedPdfFile: null,
    combinedPdfPath: null
  }
  scan.findings = []
  await scan.save()

  runningScans.add(scanId)
  processScanRun(scanId).catch(async (error) => {
    await saveScanFailure(scanId, error.message || 'Analyzer execution failed')
    runningScans.delete(scanId)
  })

  res.status(202).json({
    success: true,
    message: 'Scan started',
    data: toResponse(scan)
  })
})

router.get('/:id/report', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  const scan = await Scan.findOne({ _id: req.params.id, ownerId: getOwnerId(req) })
  if (!scan) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  const type = String(req.query.type || 'pdf').toLowerCase() === 'json' ? 'json' : 'pdf'
  const filePath = type === 'json' ? scan.reportFiles?.jsonPath : scan.reportFiles?.pdfPath

  if (!filePath) {
    return res.status(404).json({
      success: false,
      error: `No ${type.toUpperCase()} report available for this scan`
    })
  }

  const resolvedPath = path.resolve(filePath)
  const analyzerRoot = analyzerDir ? path.resolve(analyzerDir) : null
  const ciRoot = path.resolve(ciReportsDir)
  const isUnderAnalyzer = analyzerRoot && resolvedPath.startsWith(analyzerRoot)
  const isUnderCiReports = resolvedPath.startsWith(ciRoot)
  if ((!isUnderAnalyzer && !isUnderCiReports) || !fs.existsSync(resolvedPath)) {
    return res.status(404).json({
      success: false,
      error: 'Report file not found'
    })
  }

  res.download(resolvedPath, path.basename(resolvedPath))
})

router.patch('/:id', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  const scan = await Scan.findOne({ _id: req.params.id, ownerId: getOwnerId(req) })
  if (!scan) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  const { status, progress, findings } = req.body

  if (status) scan.status = status
  if (progress !== undefined) scan.progress = Number(progress)
  if (findings !== undefined) scan.findings = Array.isArray(findings) ? findings : scan.findings

  if (status === 'running' && !scan.startedAt) {
    scan.startedAt = new Date()
  }
  if (status === 'completed') {
    scan.completedAt = new Date()
  }

  await scan.save()

  res.json({
    success: true,
    data: toResponse(scan)
  })
})

router.delete('/:id', protect, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  const ownerId = getOwnerId(req)
  const deleted = await Scan.findOneAndDelete({ _id: req.params.id, ownerId })
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  await Risk.deleteMany({ ownerId, scanId: deleted._id })

  res.json({
    success: true,
    message: 'Scan and related risks deleted successfully'
  })
})

router.post('/ci-ingest', ciReportUpload.fields([
  { name: 'report', maxCount: 1 },
  { name: 'reportPdf', maxCount: 1 }
]), async (req, res) => {
  const expectedApiKey = String(process.env.CI_INGEST_API_KEY || '').trim()
  if (expectedApiKey) {
    const providedApiKey = String(req.headers['x-ci-api-key'] || '').trim()
    if (!providedApiKey || providedApiKey !== expectedApiKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized CI ingest request'
      })
    }
  }

  const body = req.body || {}
  const repositoryFullName =
    String(body.repositoryFullName || body.repository || '').trim() || String(body.repository || '').trim()
  const repositoryUrl =
    String(body.repositoryUrl || '').trim() ||
    (repositoryFullName ? `https://github.com/${repositoryFullName}` : '')

  const reportFile = req.files?.report?.[0]
  const reportPdfFile = req.files?.reportPdf?.[0]
  const report =
    reportFile && fs.existsSync(reportFile.path)
      ? (() => {
          try {
            return JSON.parse(fs.readFileSync(reportFile.path, 'utf8'))
          } catch {
            return null
          }
        })()
      : body?.report && typeof body.report === 'object'
        ? body.report
        : (() => {
            try {
              return JSON.parse(String(body?.report || '{}'))
            } catch {
              return null
            }
          })()

  if (!report || typeof report !== 'object') {
    return res.status(400).json({ success: false, error: 'report JSON payload is required' })
  }

  const normalizedReport = {
    ...report,
    overall_risk_score: report?.overall_risk_score ?? report?.riskScore ?? 0,
    summary: report?.summary || {
      total_issues: Array.isArray(report?.vulnerabilities) ? report.vulnerabilities.length : 0,
      critical_count: report?.critical || 0,
      high_count: report?.high || 0,
      medium_count: report?.medium || 0,
      low_count: report?.low || 0
    },
    issues: report?.issues || report?.vulnerabilities || []
  }

  const projectResolution = await resolveCiIngestProject({
    projectId: body.projectId,
    repositoryUrl,
    repositoryFullName
  })
  let project = projectResolution.project
  if (!project) {
    const owner = await resolveCiIngestOwner()
    if (!owner) {
      return res.status(409).json({
        success: false,
        error: 'No user available to own CI projects. Create a user or set CI_INGEST_OWNER_EMAIL.'
      })
    }

    const repoName = repositoryFullName.split('/').pop() || 'repository'
    project = await Project.create({
      ownerId: owner._id,
      name: repoName,
      fullName: repositoryFullName || repoName,
      repositoryUrl: repositoryUrl || repositoryFullName || repoName,
      repositoryType: 'github',
      status: 'active',
      riskScore: Number(normalizedReport?.overall_risk_score || 0)
    })
  }

  const startedAt = new Date()
  const findings = mapCicdIssuesToUnifiedIssues(normalizedReport?.issues).slice(0, 50)
  const scan = await Scan.create({
    ownerId: project.ownerId,
    projectId: project._id,
    repositoryUrl: String(repositoryUrl || project.repositoryUrl || '').trim(),
    scanType: 'cicd',
    branch: String(body.branch || 'main').trim() || 'main',
    status: 'completed',
    progress: 100,
    startedAt,
    completedAt: new Date(),
    findings,
    analysisSummary: buildCicdOnlySummary(normalizedReport),
    reportFiles: {
      pdfFile: reportPdfFile ? path.basename(reportPdfFile.path) : null,
      pdfPath: reportPdfFile ? reportPdfFile.path : null,
      jsonFile: reportFile ? path.basename(reportFile.path) : String(body.reportFileName || 'report.json'),
      jsonPath: reportFile ? reportFile.path : null,
      cicdPdfFile: reportPdfFile ? path.basename(reportPdfFile.path) : null,
      cicdPdfPath: reportPdfFile ? reportPdfFile.path : null,
      cicdJsonFile: reportFile ? path.basename(reportFile.path) : String(body.reportFileName || 'report.json'),
      cicdJsonPath: reportFile ? reportFile.path : null,
      combinedJsonFile: null,
      combinedJsonPath: null,
      combinedPdfFile: null,
      combinedPdfPath: null
    },
    analyzerLogTail: `CI ingest commit=${String(body.commit || body.commitSha || '')} run=${String(body.runId || body.workflowRunUrl || '')}`.trim()
  })

  await syncRisksForScan({
    scanDoc: scan,
    projectId: project._id,
    mergedIssues: mapCicdIssuesToUnifiedIssues(normalizedReport?.issues)
  })

  project.lastScan = new Date()
  project.riskScore = Number(normalizedReport?.overall_risk_score || 0)
  await project.save()

  res.status(201).json({
    success: true,
    message: 'CI report ingested successfully',
    data: toResponse(scan)
  })
})

export default router
