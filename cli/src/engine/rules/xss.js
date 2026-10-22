/**
 * Cross-Site Scripting (XSS) & Unsafe DOM Injection Rules
 */

export const scanXss = (filePath, content) => {
  const issues = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((lineText, idx) => {
    const trimmed = lineText.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
      return;
    }

    if (/\.innerHTML\s*=/i.test(lineText)) {
      issues.push({
        id: 'XSS-001',
        title: 'Direct innerHTML Assignment',
        threatType: 'Cross-Site Scripting (XSS)',
        severity: 'HIGH',
        file: filePath,
        line: idx + 1,
        match: trimmed.slice(0, 100),
        description: 'Direct assignment to innerHTML can lead to Cross-Site Scripting (XSS).',
        remediation: 'Use textContent, createElement, or a trusted sanitization library like DOMPurify.'
      });
    }

    if (/dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/i.test(lineText)) {
      issues.push({
        id: 'XSS-002',
        title: 'React dangerouslySetInnerHTML Usage',
        threatType: 'Cross-Site Scripting (XSS)',
        severity: 'HIGH',
        file: filePath,
        line: idx + 1,
        match: trimmed.slice(0, 100),
        description: 'Usage of dangerouslySetInnerHTML bypasses React XSS protections.',
        remediation: 'Ensure input is sanitized with DOMPurify before passing to __html, or render safe React elements.'
      });
    }

    if (/\bdocument\.write\s*\(/i.test(lineText)) {
      issues.push({
        id: 'XSS-003',
        title: 'document.write Usage',
        threatType: 'Cross-Site Scripting (XSS)',
        severity: 'MEDIUM',
        file: filePath,
        line: idx + 1,
        match: trimmed.slice(0, 100),
        description: 'document.write is dangerous and can lead to DOM XSS vulnerabilities.',
        remediation: 'Manipulate DOM nodes using document.createElement or framework state.'
      });
    }

    if (/\b(?:eval|exec)\s*\([^)]+\)/i.test(lineText) && !lineText.includes('//') && !lineText.includes('test')) {
      issues.push({
        id: 'INJ-001',
        title: 'Unsafe Code Execution Sink (eval/exec)',
        threatType: 'Script Injection',
        severity: 'CRITICAL',
        file: filePath,
        line: idx + 1,
        match: trimmed.slice(0, 100),
        description: 'Execution of dynamic strings via eval or exec can lead to remote code execution.',
        remediation: 'Avoid eval/exec; parse structured data with JSON.parse or use safe lookup dictionaries.'
      });
    }
  });

  return issues;
};
