/**
 * Insecure Configuration and Supply Chain Workflow Rules
 */

export const scanConfig = (filePath, content) => {
  const issues = [];
  const lines = content.split(/\r?\n/);
  const isWorkflow = filePath.includes('.github/workflows') || filePath.includes('.gitlab-ci') || filePath.endsWith('.yml') || filePath.endsWith('.yaml');
  const isDocker = filePath.endsWith('Dockerfile') || filePath.includes('docker-compose');

  lines.forEach((lineText, idx) => {
    const trimmed = lineText.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
      return;
    }

    // Remote script execution via pipe to shell (curl | bash)
    if (/(?:curl|wget)[^|\n]+(?:\|\s*(?:bash|sh|zsh|python))/i.test(lineText)) {
      issues.push({
        id: 'RUN-001',
        title: 'Untrusted Remote Script Piped to Shell',
        threatType: 'Supply Chain Attack',
        severity: 'CRITICAL',
        file: filePath,
        line: idx + 1,
        match: trimmed.slice(0, 100),
        description: 'Piping remote web scripts directly into a shell interpreter bypasses integrity checks.',
        remediation: 'Download the script, verify its cryptographic hash or signature, then execute it.'
      });
    }

    // Overly permissive CORS with credentials
    if (/origin\s*:\s*['"]?\*['"]?/i.test(lineText) && /credentials\s*:\s*true/i.test(content)) {
      issues.push({
        id: 'CFG-001',
        title: 'Wildcard CORS with Credentials Enabled',
        threatType: 'Insecure Configuration',
        severity: 'HIGH',
        file: filePath,
        line: idx + 1,
        match: trimmed.slice(0, 100),
        description: 'Configuring Access-Control-Allow-Origin: * with credentials: true is insecure.',
        remediation: 'Specify explicit allowed origins when credentials (cookies/auth) are supported.'
      });
    }

    // CI/CD unpinned 3rd-party action branches (uses: foo/bar@main or master)
    if (isWorkflow && /uses:\s*[^@\s]+@(main|master)\b/i.test(lineText)) {
      issues.push({
        id: '3P-001',
        title: 'Unpinned Mutable Action Branch (main/master)',
        threatType: 'Supply Chain Attack',
        severity: 'HIGH',
        file: filePath,
        line: idx + 1,
        match: trimmed.slice(0, 100),
        description: 'Using mutable branch references like @main or @master for 3rd-party actions risks supply chain tampering.',
        remediation: 'Pin GitHub Actions to full 40-character commit SHAs or immutable release tags.'
      });
    }

    // Docker privileged mode
    if (isDocker && /privileged\s*:\s*true/i.test(lineText)) {
      issues.push({
        id: 'DC-001',
        title: 'Docker Privileged Mode Enabled',
        threatType: 'Privilege Escalation',
        severity: 'CRITICAL',
        file: filePath,
        line: idx + 1,
        match: trimmed.slice(0, 100),
        description: 'Running containers in privileged mode grants full host root capabilities and container breakout risks.',
        remediation: 'Remove privileged: true and grant only explicit fine-grained Linux capabilities (cap_add).'
      });
    }

    // Docker container image unpinned latest
    if (isDocker && /image:\s*[a-zA-Z0-9_\-\/]+:latest\b/i.test(lineText)) {
      issues.push({
        id: 'DEP-001',
        title: 'Unpinned Docker Image Tag (:latest)',
        threatType: 'Supply Chain Attack',
        severity: 'LOW',
        file: filePath,
        line: idx + 1,
        match: trimmed.slice(0, 100),
        description: 'Using :latest image tags can cause unexpected breaking changes and vulnerabilities on redeploy.',
        remediation: 'Pin container image to a specific version tag or digest sha256.'
      });
    }
  });

  return issues;
};
