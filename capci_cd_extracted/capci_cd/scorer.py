from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from rules_engine import Issue, SEVERITY_ORDER


SEVERITY_WEIGHT = {
    "Critical": 25,
    "High": 15,
    "Medium": 8,
    "Low": 3,
}


@dataclass
class ScoreSummary:
    overall_risk_score: int
    overall_severity: str
    total_issues: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int


def score_issues(issues: Iterable[Issue]) -> ScoreSummary:
    critical_count = 0
    high_count = 0
    medium_count = 0
    low_count = 0
    total_score = 0
    highest_severity = "Low"

    for issue in issues:
        sev = issue.severity
        if sev == "Critical":
            critical_count += 1
        elif sev == "High":
            high_count += 1
        elif sev == "Medium":
            medium_count += 1
        else:
            low_count += 1
        total_score += SEVERITY_WEIGHT.get(sev, 0)
        if SEVERITY_ORDER.index(sev) < SEVERITY_ORDER.index(highest_severity):
            highest_severity = sev

    total_issues = critical_count + high_count + medium_count + low_count
    overall_risk_score = min(100, total_score)

    return ScoreSummary(
        overall_risk_score=overall_risk_score,
        overall_severity=highest_severity,
        total_issues=total_issues,
        critical_count=critical_count,
        high_count=high_count,
        medium_count=medium_count,
        low_count=low_count,
    )
