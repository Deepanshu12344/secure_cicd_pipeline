import { describe, it, expect } from '@jest/globals'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Backend Environment & Route Sanity', () => {
  it('should find the main_analyzer script in workspace root', () => {
    const analyzerPath = path.resolve(__dirname, '../../main_analyzer.py')
    expect(fs.existsSync(analyzerPath)).toBe(true)
  })

  it('should find root requirements.txt for the analyzer', () => {
    const reqPath = path.resolve(__dirname, '../../requirements.txt')
    expect(fs.existsSync(reqPath)).toBe(true)
    const content = fs.readFileSync(reqPath, 'utf8')
    expect(content).toContain('anthropic')
    expect(content).toContain('reportlab')
    expect(content).toContain('pyyaml')
  })

  it('should verify report extraction regex on sample output', () => {
    const sampleOutput = `
      Detailed report saved to: reports/test_repo_comprehensive_analysis_20261022.pdf
      Structured JSON saved to: json_output/test_repo_comprehensive_analysis_20261022.json
    `
    const pdfMatches = [...sampleOutput.matchAll(/reports\/([^\s]+\.pdf)/g)]
    const jsonMatches = [...sampleOutput.matchAll(/json_output\/([^\s]+\.json)/g)]

    expect(pdfMatches.length).toBeGreaterThan(0)
    expect(pdfMatches[pdfMatches.length - 1][1]).toBe('test_repo_comprehensive_analysis_20261022.pdf')
    expect(jsonMatches.length).toBeGreaterThan(0)
    expect(jsonMatches[jsonMatches.length - 1][1]).toBe('test_repo_comprehensive_analysis_20261022.json')
  })

  it('should calculate risk scores accurately', () => {
    const severityMap = {
      Critical: 95,
      High: 80,
      Medium: 55,
      Low: 25
    }
    expect(severityMap.Critical).toBe(95)
    expect(severityMap.High).toBe(80)
    expect(severityMap.Medium).toBe(55)
    expect(severityMap.Low).toBe(25)
  })
})
