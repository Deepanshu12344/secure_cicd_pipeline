from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
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


def calculate_risk(evaluated_results: dict) -> int:
    issues: list[Issue] = list(evaluated_results.get("issues", []))
    config = _load_scoring_config()

    severity_score = _calculate_severity_score(issues)
    dependency_risk = _calculate_dependency_risk(issues)
    config_risk = _calculate_config_risk(issues)
    exposure_level = _calculate_exposure_level(issues)

    severity_weight = float(config.get("severity_weight", 0.4))
    dependency_weight = float(config.get("dependency_weight", 0.2))
    config_weight = float(config.get("config_weight", 0.2))
    exposure_weight = float(config.get("exposure_weight", 0.2))

    score = (
        severity_weight * severity_score
        + dependency_weight * dependency_risk
        + config_weight * config_risk
        + exposure_weight * exposure_level
    )
    return int(max(0, min(100, round(score))))


def _load_scoring_config() -> dict:
    config_path = Path(__file__).resolve().parent / "config.json"
    if not config_path.exists():
        return {}
    try:
        return json.loads(config_path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return {}


def _calculate_severity_score(issues: list[Issue]) -> float:
    if not issues:
        return 0.0
    severity_base = {"Critical": 100, "High": 75, "Medium": 45, "Low": 20}
    total = sum(severity_base.get(issue.severity, 20) for issue in issues)
    return min(100.0, total / len(issues))


def _calculate_dependency_risk(issues: list[Issue]) -> float:
    if not issues:
        return 0.0
    dependency_terms = {"Supply Chain Attack", "Dependency Risk"}
    hits = 0
    for issue in issues:
        if issue.threat_type in dependency_terms or issue.id.startswith(("DEP-", "3P-", "EXT-")):
            hits += 1
    return min(100.0, (hits / len(issues)) * 100.0)


def _calculate_config_risk(issues: list[Issue]) -> float:
    if not issues:
        return 0.0
    config_terms = {"Privilege Escalation", "Data Exposure"}
    hits = sum(1 for issue in issues if issue.threat_type in config_terms)
    return min(100.0, (hits / len(issues)) * 100.0)


def _calculate_exposure_level(issues: list[Issue]) -> float:
    if not issues:
        return 0.0
    exposure_terms = {"Secret Exposure", "Unauthorized Access"}
    hits = sum(1 for issue in issues if issue.threat_type in exposure_terms)
    return min(100.0, (hits / len(issues)) * 100.0)
