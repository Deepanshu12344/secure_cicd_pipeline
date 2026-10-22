import crypto from 'crypto'

export const normalizeFilePath = (filePath) => {
  if (!filePath) return ''
  let normalized = String(filePath).replace(/\\/g, '/').trim()
  // Strip temporary clone folder prefixes and relative markers
  normalized = normalized.replace(/^(\.\/|\/)+/, '')
  normalized = normalized.replace(/^temp_repo\//, '')
  normalized = normalized.replace(/^[^/]*\/temp_repo\//, '')
  return normalized
}

export const normalizeSnippet = (snippet) => {
  if (!snippet) return ''
  return String(snippet)
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const generateFindingFingerprint = ({
  ruleId = '',
  sourceIssueId = '',
  title = '',
  file = '',
  location = '',
  snippet = '',
  code = '',
  match = '',
  threatType = ''
}) => {
  const effectiveRule = String(ruleId || sourceIssueId || title || 'UNKNOWN_RULE').trim().toUpperCase()
  const rawFile = file || (location && !location.includes(' ') ? location.split(':')[0] : '')
  const effectiveFile = normalizeFilePath(rawFile)
  const effectiveSnippet = normalizeSnippet(snippet || code || match || '')

  const payload = [
    effectiveRule,
    effectiveFile,
    effectiveSnippet || String(threatType || '').trim().toLowerCase()
  ].join('::')

  return crypto.createHash('sha256').update(payload).digest('hex')
}

export default {
  normalizeFilePath,
  normalizeSnippet,
  generateFindingFingerprint
}
