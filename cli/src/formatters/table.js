/**
 * Terminal ASCII Table Formatter
 */

// ANSI color codes
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

export const formatTable = (report) => {
  const lines = [];

  lines.push('');
  lines.push(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  lines.push(`${BOLD}🛡️  Secure CI/CD Pre-Commit Security Scan Report${RESET}`);
  lines.push(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  lines.push(`${DIM}Mode:${RESET} ${report.mode === 'online' ? `${GREEN}Online (ML-Engine)${RESET}` : `${YELLOW}Offline Fallback (Local Rules)${RESET}`}`);
  lines.push(`${DIM}Scope:${RESET} ${report.scanScope} (${report.scannedFilesCount} file(s) scanned)`);
  lines.push(`${DIM}Timestamp:${RESET} ${report.scanTimestamp}`);
  lines.push('');

  if (report.issues.length === 0) {
    lines.push(`${GREEN}${BOLD}✔ No security issues identified! Commit allowed.${RESET}`);
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`${BOLD}Flagged Findings (${report.issues.length}):${RESET}`);
  lines.push('─────────────────────────────────────────────────────────────────────');

  report.issues.forEach((issue, idx) => {
    const sev = String(issue.severity || 'LOW').toUpperCase();
    let sevColor = GREEN;
    if (sev === 'CRITICAL') sevColor = RED;
    else if (sev === 'HIGH') sevColor = RED;
    else if (sev === 'MEDIUM') sevColor = YELLOW;
    else if (sev === 'LOW') sevColor = BLUE;

    lines.push(`${BOLD}#${idx + 1} [${sevColor}${sev}${RESET}] ${BOLD}${issue.title}${RESET} (${CYAN}${issue.id}${RESET})`);
    lines.push(`   ${DIM}Location:${RESET}    ${issue.file}:${issue.line || 1}`);
    lines.push(`   ${DIM}Threat:${RESET}      ${issue.threatType}`);
    if (issue.match) {
      lines.push(`   ${DIM}Snippet:${RESET}     ${issue.match}`);
    }
    lines.push(`   ${DIM}Explanation:${RESET} ${issue.description}`);
    lines.push(`   ${GREEN}Remediation:${RESET} ${issue.remediation}`);
    lines.push('');
  });

  lines.push('─────────────────────────────────────────────────────────────────────');
  lines.push(`${BOLD}Summary:${RESET}`);
  lines.push(`   Risk Score: ${report.overall_risk_score}/10 (${report.score_source || 'raw'})  (Threshold: ${report.gate.maxScore ?? 'N/A'}/10)`);
  if (report.fallback_reason) {
    lines.push(`   ${YELLOW}⚠ Score Fallback:${RESET} ${report.fallback_reason} (fell back to raw score)`);
  }
  lines.push(`   Severity Counts: Critical: ${report.summary.critical_count} | High: ${report.summary.high_count} | Medium: ${report.summary.medium_count} | Low: ${report.summary.low_count}`);
  lines.push('');

  if (report.gate.blocked) {
    lines.push(`${RED}${BOLD}✖ COMMIT BLOCKED:${RESET} ${report.gate.reason}`);
    lines.push(`${DIM}Fix the flagged security findings above, or use git commit --no-verify to bypass.${RESET}`);
  } else if (report.gate.warnOnly) {
    lines.push(`${YELLOW}${BOLD}⚠ WARNING (WARN MODE):${RESET} ${report.gate.reason || 'Issues found but warn mode allowed commit.'}`);
  } else {
    lines.push(`${GREEN}${BOLD}✔ COMMIT ALLOWED:${RESET} Findings are within allowed threshold.`);
  }

  lines.push(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  lines.push('');

  return lines.join('\n');
};
