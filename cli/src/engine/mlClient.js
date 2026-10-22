/**
 * Online ML-Engine Client with fast failover
 */

const DEFAULT_TIMEOUT_MS = 3000;

export const checkMlEngineHealth = async (baseUrl) => {
  if (!baseUrl) return false;
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  try {
    const res = await fetch(`${cleanUrl}/health`, {
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
    });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.status?.includes('running') || false;
  } catch {
    return false;
  }
};

export const scanWithMlEngine = async ({ filesWithContent, mlEngineUrl }) => {
  if (!mlEngineUrl) return null;
  const cleanUrl = mlEngineUrl.replace(/\/+$/, '');

  const isHealthy = await checkMlEngineHealth(cleanUrl);
  if (!isHealthy) {
    return null; // Signals fallback to local rules
  }

  const allVulnerabilities = [];

  for (const item of filesWithContent) {
    const ext = item.path.split('.').pop() || '';
    const langMap = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      java: 'java'
    };
    const language = langMap[ext] || 'text';

    try {
      const analyzeRes = await fetch(`${cleanUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: item.content, language }),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
      });

      if (analyzeRes.ok) {
        const analyzeData = await analyzeRes.json();
        const findings = analyzeData?.data?.vulnerabilities || [];
        findings.forEach((f) => {
          allVulnerabilities.push({
            id: `ML-${f.type || 'VULN'}`,
            title: f.type || 'Vulnerability',
            threatType: f.type || 'Security Finding',
            severity: f.severity || 'HIGH',
            file: item.path,
            line: 1,
            match: '',
            description: `Detected by ML Engine: ${f.type}`,
            remediation: 'Review and remediate according to security guidelines.'
          });
        });
      }
    } catch {
      // Continue with remaining files or fallback
    }
  }

  return allVulnerabilities;
};
