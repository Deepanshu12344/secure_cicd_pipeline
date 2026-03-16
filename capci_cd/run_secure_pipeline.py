import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from parser import parse
from reporter import generate_report
from rules_engine import apply_rules
from scanner import scan
from scorer import calculate_risk


def _append_risk_history(risk_score: int) -> None:
    history_path = Path(__file__).resolve().parent / "risk_history.json"
    try:
        history = json.loads(history_path.read_text(encoding="utf-8")) if history_path.exists() else []
    except ValueError:
        history = []
    if not isinstance(history, list):
        history = []
    history.append(
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "risk_score": int(risk_score),
        }
    )
    history_path.write_text(json.dumps(history, indent=2), encoding="utf-8")


def _get_env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _get_env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(str(raw).strip())
    except ValueError:
        return default


def main():
    raw_results = scan()
    parsed = parse(raw_results)
    evaluated = apply_rules(parsed)
    risk_score = calculate_risk(evaluated)

    generate_report(evaluated, risk_score)
    _append_risk_history(risk_score)

    print(f"Final Risk Score: {risk_score}")

    issues = evaluated.get("issues", [])
    critical_count = sum(1 for issue in issues if getattr(issue, "severity", "") == "Critical")

    risk_threshold = _get_env_int("CICD_RISK_THRESHOLD", 80)
    fail_on_critical = _get_env_bool("CICD_FAIL_ON_CRITICAL", True)

    # CI/CD Enforcement
    if fail_on_critical and critical_count > 0:
        print("Critical vulnerabilities found. Blocking Build.")
        sys.exit(1)
    if risk_score >= risk_threshold:
        print("High Risk Detected. Blocking Build.")
        sys.exit(1)
    if risk_score >= 50:
        print("Medium Risk Detected.")
    else:
        print("Low Risk.")


if __name__ == "__main__":
    main()
