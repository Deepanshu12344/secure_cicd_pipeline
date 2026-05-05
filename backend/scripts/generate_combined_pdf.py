from __future__ import annotations

import json
import os
import sys
from collections import Counter
from datetime import datetime
from xml.sax.saxutils import escape

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Drawing, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

SEVERITY_ORDER = ["Critical", "High", "Medium", "Low"]
SEVERITY_WEIGHT = {"Critical": 20, "High": 12, "Medium": 6, "Low": 2}
SOURCE_ORDER = ["Code Analyzer", "CI/CD"]
MAX_DETAILED_FINDINGS = 40


def _safe(value, default="") -> str:
    if value is None:
        return default
    return str(value)


def _normalize_source(issue: dict) -> str:
    source = _safe(issue.get("source"), "").strip().lower()
    if source == "cicd":
        return "CI/CD"
    return "Code Analyzer"


def _normalize_severity(value: str) -> str:
    normalized = _safe(value, "Low").strip().lower()
    if normalized == "critical":
        return "Critical"
    if normalized == "high":
        return "High"
    if normalized == "medium":
        return "Medium"
    return "Low"


def _score_to_posture(score: int) -> str:
    if score >= 75:
        return "High Risk"
    if score >= 45:
        return "Moderate Risk"
    return "Controlled Risk"


def _load_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _make_table(rows: list[list[str]], col_widths: list[float], header_bg=colors.HexColor("#eef4ff")) -> Table:
    table = Table(rows, colWidths=col_widths)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("BOX", (0, 0), (-1, -1), 0.6, colors.black),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def _build_severity_chart(counter: Counter) -> Drawing:
    values = [int(counter.get(level, 0)) for level in SEVERITY_ORDER]
    y_max = max(5, max(values) + 2)

    drawing = Drawing(430, 220)
    title = String(140, 202, "Severity Distribution", fontSize=11)
    drawing.add(title)

    chart = VerticalBarChart()
    chart.x = 35
    chart.y = 35
    chart.width = 360
    chart.height = 150
    chart.data = [values]
    chart.categoryAxis.categoryNames = SEVERITY_ORDER
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = y_max
    chart.valueAxis.valueStep = max(1, y_max // 5)
    chart.bars[0].fillColor = colors.HexColor("#1f75cb")
    drawing.add(chart)
    return drawing


def _build_source_chart(counter: Counter) -> Drawing:
    values = [int(counter.get(src, 0)) for src in SOURCE_ORDER]
    if sum(values) == 0:
        values = [1, 0]
    drawing = Drawing(430, 230)
    drawing.add(String(155, 208, "Finding Source Mix", fontSize=11))
    pie = Pie()
    pie.x = 115
    pie.y = 30
    pie.width = 200
    pie.height = 160
    pie.data = values
    pie.labels = [f"{src} ({counter.get(src, 0)})" for src in SOURCE_ORDER]
    pie.slices[0].fillColor = colors.HexColor("#3b82f6")
    pie.slices[1].fillColor = colors.HexColor("#f59e0b")
    drawing.add(pie)
    return drawing


def _build_category_chart(category_counter: Counter) -> Drawing:
    top = category_counter.most_common(6)
    labels = [item[0][:16] + ("..." if len(item[0]) > 16 else "") for item in top] or ["None"]
    values = [int(item[1]) for item in top] or [0]
    y_max = max(5, max(values) + 2)

    drawing = Drawing(430, 230)
    drawing.add(String(130, 210, "Top Risk Categories", fontSize=11))
    chart = VerticalBarChart()
    chart.x = 25
    chart.y = 35
    chart.width = 380
    chart.height = 160
    chart.data = [values]
    chart.categoryAxis.categoryNames = labels
    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = y_max
    chart.valueAxis.valueStep = max(1, y_max // 5)
    chart.bars[0].fillColor = colors.HexColor("#6366f1")
    drawing.add(chart)
    return drawing


def _rank_issues(issues: list[dict]) -> list[dict]:
    def _score(issue: dict) -> int:
        sev = _normalize_severity(_safe(issue.get("severity"), "Low"))
        base = SEVERITY_WEIGHT.get(sev, 1)
        source_bonus = 2 if _normalize_source(issue) == "CI/CD" else 0
        return base + source_bonus

    return sorted(issues, key=lambda item: _score(item), reverse=True)


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.grey)
    canvas.drawString(doc.leftMargin, 1.1 * cm, "Combined Security Analysis Report")
    canvas.drawRightString(A4[0] - doc.rightMargin, 1.1 * cm, f"Page {doc.page}")
    canvas.restoreState()


def generate(input_json: str, output_pdf: str, repo_name: str = "") -> None:
    data = _load_json(input_json)
    issues = data.get("critical_issues", [])
    if not isinstance(issues, list):
        issues = []

    aggregate = data.get("aggregate_metrics", {}) if isinstance(data.get("aggregate_metrics"), dict) else {}
    cicd = data.get("cicd_analysis", {}) if isinstance(data.get("cicd_analysis"), dict) else {}
    cicd_summary = cicd.get("summary", {}) if isinstance(cicd.get("summary"), dict) else {}

    severity_counter = Counter(_normalize_severity(_safe(issue.get("severity"), "Low")) for issue in issues)
    source_counter = Counter(_normalize_source(issue) for issue in issues)
    category_counter = Counter(_safe(issue.get("category_label") or issue.get("category"), "Other") for issue in issues)
    total_issues = len(issues)
    weighted_score = sum(SEVERITY_WEIGHT.get(level, 0) * severity_counter.get(level, 0) for level in SEVERITY_ORDER)
    normalized_score = min(100, int(round((weighted_score / max(1, total_issues * SEVERITY_WEIGHT["Critical"])) * 100)))
    posture = _score_to_posture(normalized_score)
    ranked_issues = _rank_issues(issues)

    os.makedirs(os.path.dirname(output_pdf), exist_ok=True)
    doc = SimpleDocTemplate(
        output_pdf,
        pagesize=A4,
        leftMargin=1.6 * cm,
        rightMargin=1.6 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
        title="Combined Security Analysis Report",
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="BodySmall", parent=styles["BodyText"], fontSize=9, leading=13))
    styles.add(ParagraphStyle(name="BodyTight", parent=styles["BodyText"], fontSize=10, leading=14, spaceAfter=6))
    styles.add(ParagraphStyle(name="SectionTitle", parent=styles["Heading2"], fontSize=14, textColor=colors.HexColor("#1f3f75")))

    story = []
    report_repo = _safe(repo_name or data.get("repository"), "Unknown")
    generated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    story.append(Paragraph("Comprehensive Secure Engineering Report", styles["Title"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph(f"<b>Repository:</b> {escape(report_repo)}", styles["BodyTight"]))
    story.append(Paragraph(f"<b>Generated:</b> {generated_at}", styles["BodyTight"]))
    story.append(Paragraph(f"<b>Total Findings:</b> {total_issues}", styles["BodyTight"]))
    story.append(Paragraph(f"<b>Composite Risk Posture:</b> {posture} ({normalized_score}/100)", styles["BodyTight"]))
    story.append(Spacer(1, 8))

    executive_summary = (
        "This report consolidates repository code quality findings and CI/CD pipeline security findings into a single "
        "risk narrative. The objective is to provide leadership visibility and implementation-ready guidance for engineering teams. "
        f"The current posture is classified as <b>{posture}</b>, based on a weighted severity model and distribution of findings."
    )
    story.append(Paragraph(executive_summary, styles["BodyText"]))
    story.append(Spacer(1, 12))

    story.append(Paragraph("Assessment Scope And Methodology", styles["SectionTitle"]))
    story.append(
        Paragraph(
            "The assessment combines static code analysis metrics with CI/CD and infrastructure security checks. Findings are categorized "
            "by severity, source, and technical domain. Each critical and high-priority finding includes explicit remediation guidance "
            "to enable action planning, implementation, and verification.",
            styles["BodyText"],
        )
    )
    story.append(Spacer(1, 8))

    overview_rows = [
        ["Indicator", "Value"],
        ["Overall posture", f"{posture} ({normalized_score}/100)"],
        ["Critical findings", str(severity_counter.get("Critical", 0))],
        ["High findings", str(severity_counter.get("High", 0))],
        ["Medium findings", str(severity_counter.get("Medium", 0))],
        ["Low findings", str(severity_counter.get("Low", 0))],
        ["Code Analyzer findings", str(source_counter.get("Code Analyzer", 0))],
        ["CI/CD findings", str(source_counter.get("CI/CD", 0))],
    ]
    story.append(_make_table(overview_rows, [6.7 * cm, 7.7 * cm]))
    story.append(Spacer(1, 14))

    story.append(PageBreak())
    story.append(Paragraph("Visual Risk Dashboard", styles["SectionTitle"]))
    story.append(Spacer(1, 6))
    story.append(
        Paragraph(
            "The following charts summarize severity concentration, source contribution, and dominant risk categories. "
            "Use these visual indicators to prioritize remediation sequence and team ownership.",
            styles["BodyText"],
        )
    )
    story.append(Spacer(1, 10))
    story.append(_build_severity_chart(severity_counter))
    story.append(Spacer(1, 8))
    story.append(_build_source_chart(source_counter))
    story.append(Spacer(1, 8))
    story.append(_build_category_chart(category_counter))

    story.append(PageBreak())
    story.append(Paragraph("Code Quality And Pipeline Context", styles["SectionTitle"]))
    code_metric_rows = [
        ["Metric", "Score"],
        ["Overall quality score", _safe(aggregate.get("overall_score"), "0")],
        ["Accuracy", _safe(aggregate.get("accuracy"), "0")],
        ["Complexity", _safe(aggregate.get("complexity"), "0")],
        ["Efficiency", _safe(aggregate.get("efficiency"), "0")],
        ["Maintainability", _safe(aggregate.get("maintainability"), "0")],
        ["Documentation", _safe(aggregate.get("documentation"), "0")],
    ]
    story.append(_make_table(code_metric_rows, [7.0 * cm, 7.4 * cm]))
    story.append(Spacer(1, 10))

    if cicd:
        cicd_rows = [
            ["CI/CD Indicator", "Value"],
            ["Pipeline", _safe(cicd.get("pipeline_name"), "-")],
            ["Risk score", _safe(cicd.get("overall_risk_score"), "0")],
            ["Severity", _safe(cicd.get("overall_severity"), "-")],
            ["Total pipeline issues", _safe(cicd_summary.get("total_issues"), "0")],
            ["Critical pipeline issues", _safe(cicd_summary.get("critical_count"), "0")],
            ["High pipeline issues", _safe(cicd_summary.get("high_count"), "0")],
            ["Medium pipeline issues", _safe(cicd_summary.get("medium_count"), "0")],
            ["Low pipeline issues", _safe(cicd_summary.get("low_count"), "0")],
        ]
        story.append(_make_table(cicd_rows, [7.0 * cm, 7.4 * cm], header_bg=colors.HexColor("#fff4e5")))
        story.append(Spacer(1, 8))

    story.append(
        Paragraph(
            "Interpretation: low documentation and elevated CI/CD issue counts often correlate with delayed incident response and "
            "higher change-failure rates. Prioritize high-severity control gaps in deployment workflows before optimization work.",
            styles["BodyText"],
        )
    )

    story.append(PageBreak())
    story.append(Paragraph("Priority Problems And How To Solve Them", styles["SectionTitle"]))
    story.append(
        Paragraph(
            "This section focuses on the most impactful findings first. Each item includes problem definition, risk impact, and specific "
            "remediation steps to reduce residual risk quickly.",
            styles["BodyText"],
        )
    )
    story.append(Spacer(1, 8))

    priority_items = ranked_issues[: min(12, len(ranked_issues))]
    if not priority_items:
        story.append(Paragraph("No findings were available to prioritize.", styles["BodyText"]))
    else:
        for idx, issue in enumerate(priority_items, start=1):
            title = escape(_safe(issue.get("issue") or issue.get("title"), "Untitled finding"))
            severity = _normalize_severity(_safe(issue.get("severity"), "Low"))
            source = _normalize_source(issue)
            location = escape(_safe(issue.get("location"), "-"))
            category = escape(_safe(issue.get("category_label") or issue.get("category"), "Other"))
            risk_text = escape(_safe(issue.get("reason") or issue.get("description"), "Risk details not provided."))
            remediation = escape(_safe(issue.get("remediation"), "Define engineering controls and validate with tests."))

            story.append(Paragraph(f"{idx}. {title}", styles["Heading3"]))
            story.append(Paragraph(f"<b>Problem:</b> {risk_text}", styles["BodySmall"]))
            story.append(
                Paragraph(
                    f"<b>Context:</b> Severity={severity}, Source={source}, Category={category}, Location={location}",
                    styles["BodySmall"],
                )
            )
            story.append(
                Paragraph(
                    "<b>How to solve:</b> "
                    + remediation
                    + " Add a validation check in CI to prevent regression and track closure in the remediation backlog.",
                    styles["BodySmall"],
                )
            )
            story.append(Spacer(1, 6))

    story.append(PageBreak())
    story.append(Paragraph("Detailed Findings Catalogue (Top 40)", styles["SectionTitle"]))
    story.append(
        Paragraph(
            "The catalogue below is intentionally capped to the top 40 highest-priority findings to keep the report actionable and concise.",
            styles["BodyText"],
        )
    )
    story.append(Spacer(1, 8))

    detailed_issues = ranked_issues[:MAX_DETAILED_FINDINGS]
    if not detailed_issues:
        story.append(Paragraph("No detailed findings available.", styles["BodyText"]))
    else:
        if len(ranked_issues) > MAX_DETAILED_FINDINGS:
            story.append(
                Paragraph(
                    f"Total findings detected: {len(ranked_issues)}. Showing highest-priority {MAX_DETAILED_FINDINGS}.",
                    styles["BodySmall"],
                )
            )
            story.append(Spacer(1, 6))

        for index, issue in enumerate(detailed_issues, start=1):
            title = escape(_safe(issue.get("issue") or issue.get("title"), "Untitled finding"))
            severity = _normalize_severity(_safe(issue.get("severity"), "Low"))
            source = _normalize_source(issue)
            category = escape(_safe(issue.get("category_label") or issue.get("category"), "Other"))
            location = escape(_safe(issue.get("location"), "-"))
            file_path = escape(_safe(issue.get("file"), "-"))
            threat = escape(_safe(issue.get("threat_type"), "-"))
            risk_text = escape(_safe(issue.get("reason") or issue.get("description"), "No description provided."))
            remediation = escape(_safe(issue.get("remediation"), "No remediation provided."))

            story.append(Paragraph(f"{index}. {title}", styles["Heading3"]))
            story.append(
                Paragraph(
                    f"<b>Severity:</b> {severity} | <b>Source:</b> {source} | <b>Category:</b> {category}",
                    styles["BodySmall"],
                )
            )
            story.append(
                Paragraph(
                    f"<b>Threat:</b> {threat} | <b>Location:</b> {location} | <b>File:</b> {file_path}",
                    styles["BodySmall"],
                )
            )
            story.append(Paragraph(f"<b>Risk Description:</b> {risk_text}", styles["BodySmall"]))
            story.append(Paragraph(f"<b>Recommended Fix:</b> {remediation}", styles["BodySmall"]))
            story.append(
                Paragraph(
                    "<b>Verification:</b> add targeted test coverage or policy check proving the issue can no longer be introduced.",
                    styles["BodySmall"],
                )
            )
            story.append(Spacer(1, 8))

    story.append(PageBreak())
    story.append(Paragraph("30/60/90 Day Remediation Program", styles["SectionTitle"]))
    roadmap_rows = [
        ["Phase", "Focus", "Expected Outcome"],
        [
            "0-30 days",
            "Fix all Critical and High findings. Harden CI/CD permissions, secrets handling, and unsafe workflow steps.",
            "Immediate reduction in exploitability and credential exposure risk.",
        ],
        [
            "31-60 days",
            "Resolve Medium findings. Improve code maintainability/documentation and enforce policy-as-code gates.",
            "Lower operational risk and better release reliability.",
        ],
        [
            "61-90 days",
            "Address residual Low findings and complete control verification with regression checks.",
            "Sustained secure delivery baseline with measurable control maturity.",
        ],
    ]
    story.append(_make_table(roadmap_rows, [2.5 * cm, 7.0 * cm, 4.9 * cm], header_bg=colors.HexColor("#e8f8ef")))
    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            "Final recommendation: run this report on every significant repository change and maintain a remediation SLA tied to severity. "
            "This converts one-time analysis into an ongoing secure engineering operating model.",
            styles["BodyText"],
        )
    )

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python generate_combined_pdf.py <input_json> <output_pdf> [repo_name]")
        sys.exit(1)

    input_json_arg = sys.argv[1]
    output_pdf_arg = sys.argv[2]
    repo_name_arg = sys.argv[3] if len(sys.argv) > 3 else ""

    try:
        generate(input_json_arg, output_pdf_arg, repo_name_arg)
    except Exception as exc:
        print(f"Failed to generate combined PDF: {exc}")
        sys.exit(1)
