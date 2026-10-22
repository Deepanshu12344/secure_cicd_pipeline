/**
 * Dependency Vulnerability and Pinning Rules
 */

export const scanDependencies = (filePath, content) => {
  const issues = [];
  const fileName = filePath.split('/').pop();

  if (fileName === 'package.json') {
    try {
      const parsed = JSON.parse(content);
      const allDeps = {
        ...(parsed.dependencies || {}),
        ...(parsed.devDependencies || {})
      };

      for (const [pkg, version] of Object.entries(allDeps)) {
        if (typeof version !== 'string') continue;
        const cleanVer = version.trim();

        // Wildcard or latest dependency
        if (cleanVer === '*' || cleanVer === 'latest') {
          issues.push({
            id: 'DEP-101',
            title: `Unpinned Dependency Wildcard: ${pkg}`,
            threatType: 'Supply Chain Risk',
            severity: 'MEDIUM',
            file: filePath,
            line: 1,
            match: `${pkg}: "${cleanVer}"`,
            description: `Dependency "${pkg}" specifies wildcard "${cleanVer}" version which can pull malicious upstream code.`,
            remediation: 'Pin dependency to a specific semantic version.'
          });
        }

        // Direct git/raw URL dependency
        if (cleanVer.startsWith('git+') || cleanVer.startsWith('http://') || cleanVer.startsWith('https://')) {
          issues.push({
            id: 'DEP-102',
            title: `Direct URL/VCS Dependency: ${pkg}`,
            threatType: 'Supply Chain Risk',
            severity: 'MEDIUM',
            file: filePath,
            line: 1,
            match: `${pkg}: "${cleanVer}"`,
            description: `Dependency "${pkg}" is installed directly from an unvetted remote URL.`,
            remediation: 'Publish to a private/public package registry and verify package integrity.'
          });
        }
      }
    } catch {
      // Non-blocking if package.json has partial staging syntax
    }
  }

  if (fileName === 'requirements.txt') {
    const lines = content.split(/\r?\n/);
    lines.forEach((lineText, idx) => {
      const trimmed = lineText.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      if (!trimmed.includes('==') && !trimmed.includes('>=') && !trimmed.includes('<=')) {
        issues.push({
          id: 'DEP-103',
          title: `Unpinned Python Requirement: ${trimmed}`,
          threatType: 'Supply Chain Risk',
          severity: 'LOW',
          file: filePath,
          line: idx + 1,
          match: trimmed,
          description: `Requirement "${trimmed}" has no version pinning specified.`,
          remediation: 'Pin Python dependencies with exact versions (e.g. package==1.2.3).'
        });
      }
    });
  }

  return issues;
};
