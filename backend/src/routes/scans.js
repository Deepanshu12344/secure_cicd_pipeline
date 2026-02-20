import express from 'express'
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { protect } from '../middleware/authMiddleware.js'
import Scan from '../models/Scan.js'
import Project from '../models/Project.js'

const router = express.Router()
const getOwnerId = (req) => req.user?._id || req.user?.id

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, '../../..')
const analyzerDir = ['code-analyzer', 'Code-Analyzer']
  .map((dir) => path.join(workspaceRoot, dir))
  .find((dir) => fs.existsSync(path.join(dir, 'analyzer.py')))

const runningScans = new Set()

const parseRepositoryName = (repositoryUrl) => {
  const clean = String(repositoryUrl || '').trim().replace(/\/+$/, '')
  const lastPart = clean.split('/').pop() || 'repository'
  return lastPart.replace(/\.git$/i, '') || 'repository'
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
  const beforePdfFiles = listFilesByExtension(reportsDir, '.pdf')
  const beforeJsonFiles = listFilesByExtension(jsonDir, '.json')

  const pythonBin = process.env.PYTHON_BIN || 'python'
  const args = ['-X', 'utf8', 'analyzer.py', scan.repositoryUrl]
  if (process.env.ANALYZER_MAX_FILES) {
    args.push('--max-files', String(process.env.ANALYZER_MAX_FILES))
  }

  return new Promise((resolve, reject) => {
    let output = ''

    const child = spawn(pythonBin, args, {
      cwd: analyzerDir,
      env: { ...process.env, PYTHONUTF8: '1' }
    })

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
      if (output.length > 120000) output = output.slice(-120000)
    })

    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
      if (output.length > 120000) output = output.slice(-120000)
    })

    child.on('error', (error) => {
      reject(new Error(`Failed to run analyzer: ${error.message}`))
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Analyzer exited with code ${code}. ${output.slice(-800)}`))
        return
      }

      const repoName = parseRepositoryName(scan.repositoryUrl)
      const { pdfFile: parsedPdf, jsonFile: parsedJson } = extractReportNamesFromOutput(output)
      const afterPdfFiles = listFilesByExtension(reportsDir, '.pdf')
      const afterJsonFiles = listFilesByExtension(jsonDir, '.json')
      const newestPdf = getNewestAddedFile(beforePdfFiles, afterPdfFiles)
      const newestJson = getNewestAddedFile(beforeJsonFiles, afterJsonFiles)

      const pdfFile =
        parsedPdf ||
        (newestPdf?.name && newestPdf.name.includes(repoName) ? newestPdf.name : newestPdf?.name) ||
        null
      const jsonFile =
        parsedJson ||
        (newestJson?.name && newestJson.name.includes(repoName) ? newestJson.name : newestJson?.name) ||
        null

      resolve({
        output,
        pdfFile,
        jsonFile,
        pdfPath: pdfFile ? path.join(reportsDir, pdfFile) : null,
        jsonPath: jsonFile ? path.join(jsonDir, jsonFile) : null
      })
    })
  })
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
      jsonPath: result.jsonPath
    }

    if (!reportFiles.pdfPath && !reportFiles.jsonPath) {
      throw new Error(
        'Analyzer finished without generating report files. The repository may not contain supported code files.'
      )
    }

    let analysisSummary = null
    let findings = []

    if (reportFiles.jsonPath && fs.existsSync(reportFiles.jsonPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(reportFiles.jsonPath, 'utf8'))
        analysisSummary = buildAnalysisSummary(parsed)
        findings = (Array.isArray(parsed.critical_issues) ? parsed.critical_issues : []).slice(0, 50)
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

    const project = await Project.findById(freshScan.projectId)
    if (project) {
      project.lastScan = new Date()
      if (analysisSummary?.metrics?.overall !== undefined) {
        project.riskScore = Number((100 - analysisSummary.metrics.overall).toFixed(1))
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
    jsonPath: null
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
  if (!analyzerDir || !resolvedPath.startsWith(path.resolve(analyzerDir)) || !fs.existsSync(resolvedPath)) {
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

  const deleted = await Scan.findOneAndDelete({ _id: req.params.id, ownerId: getOwnerId(req) })
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Scan not found' })
  }

  res.json({
    success: true,
    message: 'Scan deleted successfully'
  })
})

export default router
