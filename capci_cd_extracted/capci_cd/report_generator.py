from __future__ import annotations

from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Drawing, String
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, PageBreak


SEVERITY_COLORS = {
    "Critical": colors.HexColor("#8b0000"),
    "High": colors.HexColor("#b22222"),
    "Medium": colors.HexColor("#d9822b"),
    "Low": colors.HexColor("#2b8a3e"),
}

CIS_OWASP_MAP = {
    "SEC-001": "OWASP CI/CD Security: Secrets Management; CIS GitHub Benchmark: 5.1",
    "SEC-002": "OWASP CI/CD Security: Secrets Management; CIS GitHub Benchmark: 5.1",
    "SEC-003": "OWASP CI/CD Security: Secrets Management; CIS GitHub Benchmark: 5.1",
    "SEC-004": "OWASP CI/CD Security: Secrets Management; CIS GitHub Benchmark: 5.1",
    "PERM-001": "OWASP CI/CD Security: Least Privilege; CIS GitHub Benchmark: 4.1",
    "PERM-002": "OWASP CI/CD Security: Least Privilege; CIS GitHub Benchmark: 4.1",
    "3P-001": "OWASP CI/CD Security: Supply Chain; CIS GitHub Benchmark: 2.1",
    "3P-002": "OWASP CI/CD Security: Supply Chain; CIS GitHub Benchmark: 2.1",
    "DEP-001": "OWASP CI/CD Security: Supply Chain; CIS Docker Benchmark: 4.1",
    "DEP-002": "OWASP CI/CD Security: Supply Chain; CIS GitHub Benchmark: 2.1",
    "DEP-003": "OWASP CI/CD Security: Supply Chain; CIS GitHub Benchmark: 2.2",
    "DEP-101": "OWASP CI/CD Security: Supply Chain; CIS Docker Benchmark: 4.1",
    "DEP-102": "OWASP CI/CD Security: Supply Chain; CIS Docker Benchmark: 4.1",
    "DEP-103": "OWASP CI/CD Security: Supply Chain; CIS Docker Benchmark: 4.1",
    "DEP-104": "OWASP CI/CD Security: Supply Chain; CIS GitHub Benchmark: 2.1",
    "DEP-105": "OWASP CI/CD Security: Least Privilege; CIS Docker Benchmark: 4.1",
    "RUN-001": "OWASP CI/CD Security: Runner Isolation; CIS GitHub Benchmark: 4.2",
    "RUN-002": "OWASP CI/CD Security: Runner Isolation; CIS Docker Benchmark: 5.1",
    "RUN-003": "OWASP CI/CD Security: Runner Isolation; CIS Docker Benchmark: 5.1",
    "ART-001": "OWASP CI/CD Security: Artifact Hygiene; CIS GitHub Benchmark: 1.2",
    "ART-002": "OWASP CI/CD Security: Artifact Hygiene; CIS GitHub Benchmark: 1.2",
    "TRIG-001": "OWASP CI/CD Security: PR Security; CIS GitHub Benchmark: 3.1",
    "TRIG-002": "OWASP CI/CD Security: PR Security; CIS GitHub Benchmark: 3.1",
    "AWS-001": "CIS AWS Foundations: 3.1; OWASP Cloud Security: Data Exposure",
    "AWS-002": "CIS AWS Foundations: 3.1; OWASP Cloud Security: Data Exposure",
    "AWS-003": "CIS AWS Foundations: 1.2; OWASP Cloud Security: IAM",
    "AWS-004": "CIS AWS Foundations: 4.1; OWASP Cloud Security: Network Security",
    "AWS-005": "CIS AWS Foundations: 4.3; OWASP Cloud Security: Data Exposure",
    "AWS-006": "CIS AWS Foundations: 4.1; OWASP Cloud Security: Network Security",
    "AWS-101": "CIS AWS Foundations: 3.1; OWASP Cloud Security: Data Exposure",
    "AWS-102": "CIS AWS Foundations: 3.1; OWASP Cloud Security: Data Exposure",
    "AWS-103": "CIS AWS Foundations: 1.2; OWASP Cloud Security: IAM",
    "AWS-104": "CIS AWS Foundations: 4.1; OWASP Cloud Security: Network Security",
    "AWS-105": "CIS AWS Foundations: 4.3; OWASP Cloud Security: Data Exposure",
    "AWS-106": "CIS AWS Foundations: 4.1; OWASP Cloud Security: Network Security",
    "AWS-107": "CIS AWS Foundations: 1.2; OWASP Cloud Security: IAM",
    "AWS-108": "CIS AWS Foundations: 1.2; OWASP Cloud Security: IAM",
    "K8S-001": "CIS Kubernetes Benchmark: 5.2.5; OWASP Cloud Security: Network",
    "K8S-002": "CIS Kubernetes Benchmark: 5.2.1; OWASP Cloud Security: Isolation",
    "K8S-003": "CIS Kubernetes Benchmark: 5.2.8; OWASP Cloud Security: Host Security",
    "K8S-004": "CIS Kubernetes Benchmark: 5.2.6; OWASP Cloud Security: Supply Chain",
    "K8S-005": "CIS Kubernetes Benchmark: 5.2.2; OWASP Cloud Security: Isolation",
    "K8S-006": "CIS Kubernetes Benchmark: 5.2.3; OWASP Cloud Security: Isolation",
    "K8S-007": "CIS Kubernetes Benchmark: 5.2.4; OWASP Cloud Security: Identity",
    "DC-001": "CIS Docker Benchmark: 4.1; OWASP Cloud Security: Supply Chain",
    "DC-002": "CIS Docker Benchmark: 5.1; OWASP Cloud Security: Isolation",
    "DC-003": "CIS Docker Benchmark: 5.1; OWASP Cloud Security: Host Security",
    "DC-004": "CIS Docker Benchmark: 5.2; OWASP Cloud Security: Network Security",
}


def _severity_color(severity: str) -> colors.Color:
    return SEVERITY_COLORS.get(severity, colors.black)


def _priority_for_severity(severity: str) -> str:
    if severity == "Critical":
        return "P0"
    if severity == "High":
        return "P1"
    if severity == "Medium":
        return "P2"
    return "P3"


def _sla_for_priority(priority: str) -> str:
    if priority == "P0":
        return "24-48 hours"
    if priority == "P1":
        return "7 days"
    if priority == "P2":
        return "30 days"
    return "60-90 days"


def _owner_for_issue(threat_type: str) -> str:
    if "Pipeline" in threat_type or "Supply Chain" in threat_type:
        return "DevSecOps"
    if "Privilege" in threat_type or "Unauthorized" in threat_type:
        return "Platform"
    if "Data Exposure" in threat_type:
        return "App Team"
    return "Security"


def _playbook_for_issue(issue: dict[str, Any]) -> list[str]:
    issue_id = issue.get("id", "")
    if issue_id in {"SEC-001", "SEC-002", "SEC-003", "SEC-004"}:
        return [
            "Remove plaintext secrets from workflows, scripts, and files immediately.",
            "Rotate exposed secrets in the associated provider or service.",
            "Store secrets in GitHub Secrets or a vault and reference with `${{ secrets.NAME }}`.",
            "Add secret scanning and push protection to prevent future leakage.",
        ]
    if issue_id in {"PERM-001", "PERM-002"}:
        return [
            "Add a workflow or job-level `permissions` block with least privilege.",
            "Audit jobs for permissions actually required to read/write packages, contents, or deployments.",
            "Use environment protection rules for privileged deployments.",
        ]
    if issue_id in {"3P-001", "3P-002", "DEP-001", "DEP-101", "DEP-102", "DEP-103", "DEP-104"}:
        return [
            "Pin actions, images, and dependencies to immutable digests or commit SHAs.",
            "Enable provenance verification and review vendor trustworthiness.",
            "Add SCA and container scanning to the pipeline.",
        ]
    if issue_id in {"RUN-001", "RUN-002", "RUN-003"}:
        return [
            "Prefer ephemeral hosted runners or hardened, isolated self-hosted runners.",
            "Remove privileged containers and avoid mounting `/var/run/docker.sock`.",
            "Restrict runner network access and credentials.",
        ]
    if issue_id in {"TRIG-001", "TRIG-002"}:
        return [
            "Avoid `pull_request_target` unless guarded by strict validation.",
            "Limit permissions on PR workflows and avoid using secrets from forks.",
            "Add policy checks before running deployment steps.",
        ]
    if issue_id.startswith("AWS-"):
        return [
            "Enforce least-privilege IAM policies and remove wildcard actions/resources.",
            "Restrict public access for S3, RDS, and EKS endpoints.",
            "Limit inbound security group rules and avoid 0.0.0.0/0 for sensitive ports.",
        ]
    if issue_id.startswith("K8S-"):
        return [
            "Disable privileged containers and host namespace sharing.",
            "Enforce non-root containers with strict securityContext.",
            "Pin container images and use admission controls for policy enforcement.",
        ]
    if issue_id.startswith("DC-"):
        return [
            "Pin container images and avoid `latest`.",
            "Disable privileged mode and avoid mounting Docker socket.",
            "Restrict exposed ports to trusted networks.",
        ]
    return [
        "Review configuration and apply least privilege.",
        "Add monitoring and detection controls for this component.",
    ]


def build_pdf_report(report: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title="CI/CD Security Report",
    )

    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph("CI/CD Security Assessment Report", styles["Title"]))
    story.append(Spacer(1, 12))

    meta_table = Table(
        [
            ["Pipeline", report.get("pipeline_name", "")],
            ["Scan Timestamp", report.get("scan_timestamp", "")],
            ["Overall Severity", report.get("overall_severity", "")],
            ["Overall Risk Score", str(report.get("overall_risk_score", 0))],
        ],
        colWidths=[4 * cm, 12 * cm],
    )
    meta_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f0f0f0")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 16))

    summary = report.get("summary", {})
    summary_table = Table(
        [
            ["Total", "Critical", "High", "Medium", "Low"],
            [
                str(summary.get("total_issues", 0)),
                str(summary.get("critical_count", 0)),
                str(summary.get("high_count", 0)),
                str(summary.get("medium_count", 0)),
                str(summary.get("low_count", 0)),
            ],
        ],
        colWidths=[3 * cm, 3 * cm, 3 * cm, 3 * cm, 3 * cm],
    )
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eef5")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ]
        )
    )
    story.append(Paragraph("Summary", styles["Heading2"]))
    story.append(summary_table)
    story.append(Spacer(1, 16))

    story.append(Paragraph("Graphical Analysis", styles["Heading2"]))
    crit = summary.get("critical_count", 0)
    high = summary.get("high_count", 0)
    med = summary.get("medium_count", 0)
    low = summary.get("low_count", 0)
    total = max(1, crit + high + med + low)

    bar_drawing = Drawing(400, 220)
    bar = VerticalBarChart()
    bar.x = 30
    bar.y = 30
    bar.height = 160
    bar.width = 340
    bar.data = [[crit, high, med, low]]
    bar.categoryAxis.categoryNames = ["Critical", "High", "Medium", "Low"]
    bar.valueAxis.valueMin = 0
    bar.valueAxis.valueMax = total
    bar.valueAxis.valueStep = max(1, total // 5)
    bar.bars[0].fillColor = colors.HexColor("#3b82f6")
    bar_drawing.add(bar)
    bar_drawing.add(String(120, 200, "Issue Severity Distribution", fontSize=10))
    story.append(bar_drawing)
    story.append(Spacer(1, 12))

    pie_drawing = Drawing(400, 220)
    pie = Pie()
    pie.x = 140
    pie.y = 30
    pie.data = [crit, high, med, low]
    pie.labels = ["Critical", "High", "Medium", "Low"]
    pie.slices[0].fillColor = colors.HexColor("#8b0000")
    pie.slices[1].fillColor = colors.HexColor("#b22222")
    pie.slices[2].fillColor = colors.HexColor("#d9822b")
    pie.slices[3].fillColor = colors.HexColor("#2b8a3e")
    pie_drawing.add(pie)
    pie_drawing.add(String(150, 200, "Severity Breakdown", fontSize=10))
    story.append(pie_drawing)
    story.append(Spacer(1, 16))

    story.append(Paragraph("Executive Summary", styles["Heading2"]))
    story.append(
        Paragraph(
            "This report analyzes CI/CD workflows and related infrastructure-as-code for security risks. "
            "Key outcomes include severity distribution, risk score, and prioritized remediation guidance.",
            styles["BodyText"],
        )
    )
    story.append(Spacer(1, 12))

    story.append(Paragraph("Findings", styles["Heading2"]))
    for issue in report.get("issues", []):
        severity = issue.get("severity", "")
        title = issue.get("title", "")
        threat = issue.get("threat_type", "")
        location = issue.get("location", {})
        file_path = location.get("file_path", "")
        job_name = location.get("job_name", "")
        step_name = location.get("step_name", "")
        line_number = str(location.get("line_number", 0))

        header = f"<b>{title}</b> ({severity})"
        story.append(Paragraph(header, styles["Heading3"]))

        info_table = Table(
            [
                ["Threat Type", threat],
                ["File", file_path],
                ["Job", job_name],
                ["Step", step_name],
                ["Line", line_number],
            ],
            colWidths=[3 * cm, 13 * cm],
        )
        info_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f9f9f9")),
                    ("BOX", (0, 0), (-1, -1), 0.5, _severity_color(severity)),
                    ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]
            )
        )
        story.append(info_table)
        story.append(Spacer(1, 6))

        story.append(Paragraph(f"<b>Description:</b> {issue.get('description', '')}", styles["BodyText"]))
        story.append(Paragraph(f"<b>Impact:</b> {issue.get('impact', '')}", styles["BodyText"]))
        story.append(Paragraph(f"<b>Remediation:</b> {issue.get('remediation', '')}", styles["BodyText"]))
        story.append(Paragraph(f"<b>Confidence:</b> {issue.get('confidence', '')}", styles["BodyText"]))
        story.append(Spacer(1, 12))

    story.append(PageBreak())
    story.append(Paragraph("Security Hardening Recommendations", styles["Heading2"]))
    story.append(
        Paragraph(
            "Below are practical steps to harden your pipeline. Apply the highest-priority items first, "
            "especially those tied to High/Critical issues.",
            styles["BodyText"],
        )
    )
    story.append(Spacer(1, 10))

    recommendations = [
        "1. Secrets Management: Remove hardcoded secrets, use GitHub Secrets or a vault, and avoid echoing secrets in logs.",
        "2. Token Permissions: Add explicit `permissions` at workflow or job scope and apply least privilege.",
        "3. Action Pinning: Pin actions to commit SHAs and verify provenance; avoid `@main` and floating tags.",
        "4. Container Safety: Pin base images and actions by digest, avoid `latest`, and run as non-root.",
        "5. Runner Isolation: Prefer ephemeral runners, isolate self-hosted runners, and restrict network access.",
        "6. PR Safety: Avoid `pull_request_target` unless strictly validated; restrict permissions for forked PRs.",
        "7. Dependency Security: Add SCA scanning (e.g., dependency review, Trivy, Snyk), and verify downloads.",
        "8. Artifact Hygiene: Avoid uploading secret files; set short retention and minimize artifact scope.",
    ]
    for rec in recommendations:
        story.append(Paragraph(rec, styles["BodyText"]))
    story.append(Spacer(1, 12))

    story.append(Paragraph("Pipeline Defense-in-Depth Checklist", styles["Heading2"]))
    checklist = [
        "1. Use `permissions` with read-only defaults and elevate only as needed.",
        "2. Require signed commits for critical branches.",
        "3. Use protected branches with required reviews and status checks.",
        "4. Use environment protection rules for deployments.",
        "5. Enable secret scanning and push protection.",
        "6. Enable dependency review action on pull requests.",
        "7. Use OIDC for cloud credentials; avoid long-lived secrets.",
        "8. Restrict workflow triggers and disallow untrusted forks for privileged jobs.",
    ]
    for item in checklist:
        story.append(Paragraph(item, styles["BodyText"]))
    story.append(Spacer(1, 12))

    story.append(PageBreak())
    story.append(Paragraph("Remediation Plan", styles["Heading2"]))
    story.append(
        Paragraph(
            "The remediation plan prioritizes findings based on severity and assigns a recommended owner and SLA. "
            "Adjust owners to match your organization.",
            styles["BodyText"],
        )
    )
    story.append(Spacer(1, 10))

    plan_rows = [["Priority", "Issue", "Owner", "Target SLA"]]
    for issue in report.get("issues", []):
        priority = _priority_for_severity(issue.get("severity", ""))
        owner = _owner_for_issue(issue.get("threat_type", ""))
        sla = _sla_for_priority(priority)
        plan_rows.append([priority, issue.get("title", ""), owner, sla])

    plan_table = Table(plan_rows, colWidths=[2.5 * cm, 9 * cm, 3 * cm, 3.5 * cm])
    plan_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eef5")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(plan_table)
    story.append(Spacer(1, 12))

    story.append(PageBreak())
    story.append(Paragraph("Standards Mapping", styles["Heading2"]))
    story.append(
        Paragraph(
            "Each finding is mapped to relevant CIS and OWASP CI/CD or cloud security guidance for compliance tracking.",
            styles["BodyText"],
        )
    )
    story.append(Spacer(1, 10))

    mapping_rows = [["Issue ID", "Title", "Mapping"]]
    for issue in report.get("issues", []):
        issue_id = issue.get("id", "")
        mapping = CIS_OWASP_MAP.get(issue_id, "Not mapped")
        mapping_rows.append([issue_id, issue.get("title", ""), mapping])

    mapping_table = Table(mapping_rows, colWidths=[2.5 * cm, 8.5 * cm, 5 * cm])
    mapping_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eef5")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.black),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(mapping_table)
    story.append(Spacer(1, 12))

    story.append(PageBreak())
    story.append(Paragraph("Detailed Remediation Playbooks", styles["Heading2"]))
    for issue in report.get("issues", []):
        title = issue.get("title", "")
        issue_id = issue.get("id", "")
        story.append(Paragraph(f"{issue_id} - {title}", styles["Heading3"]))
        playbook_steps = _playbook_for_issue(issue)
        for idx, step in enumerate(playbook_steps, start=1):
            story.append(Paragraph(f"{idx}. {step}", styles["BodyText"]))
        story.append(Spacer(1, 10))

    doc.build(story)
