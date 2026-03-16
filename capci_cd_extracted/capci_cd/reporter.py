from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from rules_engine import Issue
from scorer import ScoreSummary


def _issue_to_dict(issue: Issue) -> dict[str, Any]:
    return {
        "id": issue.id,
        "title": issue.title,
        "threat_type": issue.threat_type,
        "severity": issue.severity,
        "location": {
            "file_path": issue.location.get("file_path", ""),
            "job_name": issue.location.get("job_name", ""),
            "step_name": issue.location.get("step_name", ""),
            "line_number": int(issue.location.get("line_number", 0)),
        },
        "description": issue.description,
        "impact": issue.impact,
        "remediation": issue.remediation,
        "confidence": issue.confidence,
    }


def build_report(
    pipeline_name: str,
    issues: Iterable[Issue],
    score: ScoreSummary,
) -> dict[str, Any]:
    return {
        "pipeline_name": pipeline_name,
        "scan_timestamp": datetime.now(timezone.utc).isoformat(),
        "overall_risk_score": score.overall_risk_score,
        "overall_severity": score.overall_severity,
        "summary": {
            "total_issues": score.total_issues,
            "critical_count": score.critical_count,
            "high_count": score.high_count,
            "medium_count": score.medium_count,
            "low_count": score.low_count,
        },
        "issues": [_issue_to_dict(issue) for issue in issues],
    }


def report_to_json(report: dict[str, Any]) -> str:
    return json.dumps(report, indent=2)


def write_report(report: dict[str, Any], output_path: Path) -> None:
    output_path.write_text(report_to_json(report), encoding="utf-8")
