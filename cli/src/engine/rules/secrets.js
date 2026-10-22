/**
 * Secret Exposure Detection Rules
 */

export const maskSecret = (secret) => {
  if (!secret || typeof secret !== 'string') return '****';
  const clean = secret.trim();
  if (clean.length <= 8) return '****';
  const prefixLen = Math.min(4, Math.floor(clean.length / 4));
  const suffixLen = Math.min(4, Math.floor(clean.length / 4));
  return `${clean.slice(0, prefixLen)}...****...${clean.slice(clean.length - suffixLen)}`;
};

const SECRET_PATTERNS = [
  {
    id: 'SEC-001',
    title: 'Private Key Found',
    severity: 'CRITICAL',
    regex: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP)?\s*PRIVATE\s+KEY-----/i,
    description: 'Hardcoded private key block detected.',
    remediation: 'Remove private keys from source control and store in a secure secret manager.'
  },
  {
    id: 'SEC-002',
    title: 'AWS Access Key ID',
    severity: 'CRITICAL',
    regex: /\b(AKIA[0-9A-Z]{16})\b/,
    description: 'Hardcoded AWS Access Key ID detected.',
    remediation: 'Use IAM roles or environment variables injected at runtime, not plaintext keys.'
  },
  {
    id: 'SEC-003',
    title: 'GitHub Token',
    severity: 'CRITICAL',
    regex: /\b(gh[pousr]_[A-Za-z0-9_]{36,255}|github_pat_[A-Za-z0-9_]{82})\b/,
    description: 'Hardcoded GitHub Personal Access Token or OAuth token detected.',
    remediation: 'Revoke this token immediately and use secret management or GitHub Actions secrets.'
  },
  {
    id: 'SEC-004',
    title: 'Hardcoded Password Assignment',
    severity: 'HIGH',
    regex: /(?:password|passwd|pwd|secret)\s*[:=]\s*['"]([^'"\s]{6,})['"]/i,
    description: 'Potential hardcoded password or secret assigned in plaintext.',
    remediation: 'Move passwords to environment variables or secret store.'
  },
  {
    id: 'SEC-005',
    title: 'API Key Assignment',
    severity: 'HIGH',
    regex: /(?:api[_-]?key|auth[_-]?token|access[_-]?token|secret[_-]?key)\s*[:=]\s*['"]([A-Za-z0-9_\-\.]{16,})['"]/i,
    description: 'Potential API key or authentication token assigned in code.',
    remediation: 'Load API keys from environment variables or .env files excluded from git.'
  },
  {
    id: 'SEC-006',
    title: 'MongoDB / Database Connection String with Credentials',
    severity: 'CRITICAL',
    regex: /mongodb(?:\+srv)?:\/\/[^:]+:([^@]+)@[a-z0-9.-]+/i,
    description: 'Database connection URI contains embedded plaintext username/password.',
    remediation: 'Pass connection credentials using environment variables, never hardcode in code.'
  },
  {
    id: 'SEC-007',
    title: 'Staged Sensitive Environment / Key File',
    severity: 'HIGH',
    fileRegex: /(?:^\.env(?:\..+)?$|\.pem$|\.key$|\.pfx$|\.p12$|id_rsa$|id_ed25519$)/i,
    description: 'Sensitive credential or key file staged for commit.',
    remediation: 'Add this file to .gitignore and remove it from git staging.'
  }
];

export const scanSecrets = (filePath, content) => {
  const issues = [];
  const fileName = filePath.split('/').pop();

  // Check staged filename
  for (const rule of SECRET_PATTERNS) {
    if (rule.fileRegex && rule.fileRegex.test(fileName)) {
      issues.push({
        id: rule.id,
        title: rule.title,
        threatType: 'Secret Exposure',
        severity: rule.severity,
        file: filePath,
        line: 1,
        match: maskSecret(fileName),
        description: rule.description,
        remediation: rule.remediation
      });
    }
  }

  // Check content lines
  const lines = content.split(/\r?\n/);
  lines.forEach((lineText, idx) => {
    // Skip comments in configs or obvious placeholder values
    if (lineText.includes('your_') || lineText.includes('example') || lineText.includes('placeholder')) {
      return;
    }

    for (const rule of SECRET_PATTERNS) {
      if (!rule.regex) continue;
      const match = rule.regex.exec(lineText);
      if (match) {
        const rawSecret = match[1] || match[0];
        issues.push({
          id: rule.id,
          title: rule.title,
          threatType: 'Secret Exposure',
          severity: rule.severity,
          file: filePath,
          line: idx + 1,
          match: maskSecret(rawSecret),
          description: rule.description,
          remediation: rule.remediation
        });
      }
    }
  });

  return issues;
};
