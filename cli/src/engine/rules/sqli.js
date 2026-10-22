/**
 * SQL Injection Detection Rules
 */

const SQL_KEYWORDS = /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE)\b/i;

export const scanSqlInjection = (filePath, content) => {
  const issues = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((lineText, idx) => {
    const trimmed = lineText.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) {
      return;
    }

    if (!SQL_KEYWORDS.test(lineText)) {
      return;
    }

    // Pattern 1: Concatenation with + and variables
    const concatMatch = /(?:\"[^\"\r\n]*(?:SELECT|INSERT|UPDATE|DELETE)[^\"\r\n]*\"|'[^'\r\n]*(?:SELECT|INSERT|UPDATE|DELETE)[^'\r\n]*'|`[^`\r\n]*(?:SELECT|INSERT|UPDATE|DELETE)[^`\r\n]*`)\s*\+\s*[a-zA-Z0-9_.]+/i.test(lineText) ||
      /[a-zA-Z0-9_.]+\s*\+\s*(?:\"[^\"\r\n]*(?:WHERE|AND|OR|VALUES|FROM)[^\"\r\n]*\"|'[^'\r\n]*(?:WHERE|AND|OR|VALUES|FROM)[^'\r\n]*'|`[^`\r\n]*(?:WHERE|AND|OR|VALUES|FROM)[^`\r\n]*`)/i.test(lineText);

    // Pattern 2: Template literals / f-strings with variables inside SQL
    const templateMatch = /`\s*(?:SELECT|INSERT|UPDATE|DELETE)[^`]*\$\{[^}]+\}[^`]*`/i.test(lineText) ||
      /f['"](?:SELECT|INSERT|UPDATE|DELETE)[^'"]*\{[^}]+\}[^'"]*['"]/i.test(lineText);

    // Pattern 3: String formatting %s or .format() in SQL query
    const formatMatch = /['"](?:SELECT|INSERT|UPDATE|DELETE)[^'"]*%s[^'"]*['"]\s*%\s*[a-zA-Z0-9_(]+/i.test(lineText) ||
      /['"](?:SELECT|INSERT|UPDATE|DELETE)[^'"]*\{[^}]*\}[^'"]*['"]\.format\(/i.test(lineText);

    if (concatMatch || templateMatch || formatMatch) {
      issues.push({
        id: 'SQL-001',
        title: 'Potential SQL Injection',
        threatType: 'SQL Injection',
        severity: 'CRITICAL',
        file: filePath,
        line: idx + 1,
        match: trimmed.slice(0, 100),
        description: 'Dynamic string concatenation or interpolation used inside an SQL query statement.',
        remediation: 'Use parameterized queries, prepared statements, or ORM parameter binding instead of string concatenation.'
      });
    }
  });

  return issues;
};
