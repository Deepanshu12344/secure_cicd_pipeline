import json
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


def main():
    raw_results = scan()
    parsed = parse(raw_results)
    evaluated = apply_rules(parsed)
    risk_score = calculate_risk(evaluated)

    generate_report(evaluated, risk_score)
    _append_risk_history(risk_score)

    print(f"Final Risk Score: {risk_score}")

    # CI/CD Enforcement
    if risk_score >= 80:
        print("High Risk Detected. Blocking Build.")
        sys.exit(1)
    elif risk_score >= 50:
        print("Medium Risk Detected.")
    else:
        print("Low Risk.")


if __name__ == "__main__":
    main()
