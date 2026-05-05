from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import yaml

from parser import TextFile, WorkflowFile


@dataclass
class Issue:
    id: str
    title: str
    threat_type: str
    severity: str
    location: dict[str, Any]
    description: str
    impact: str
    remediation: str
    confidence: str


SEVERITY_ORDER = ["Critical", "High", "Medium", "Low"]


def _find_line_number(text: str, pattern: str) -> int:
    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error:
        return 0
    for idx, line in enumerate(text.splitlines(), start=1):
        if regex.search(line):
            return idx
    return 0


def _collect_jobs(data: dict[str, Any]) -> dict[str, Any]:
    jobs = data.get("jobs")
    if isinstance(jobs, dict):
        return jobs
    return {}


def _collect_steps(job: dict[str, Any]) -> list[dict[str, Any]]:
    steps = job.get("steps")
    if isinstance(steps, list):
        return [s for s in steps if isinstance(s, dict)]
    return []


def _stringify_env(env: Any) -> dict[str, str]:
    if isinstance(env, dict):
        return {str(k): str(v) for k, v in env.items()}
    return {}


def _uses_action(step: dict[str, Any]) -> str:
    uses = step.get("uses")
    return str(uses) if uses else ""


def _run_command(step: dict[str, Any]) -> str:
    run = step.get("run")
    return str(run) if run else ""


def analyze(workflows: Iterable[WorkflowFile], extra_files: Iterable[TextFile] | None = None) -> list[Issue]:
    issues: list[Issue] = []
    for wf in workflows:
        issues.extend(_analyze_workflow(wf))
    if extra_files:
        for tf in extra_files:
            issues.extend(_analyze_text_file(tf))
    return issues


def apply_rules(parsed_results: dict[str, Any]) -> dict[str, Any]:
    workflows = parsed_results.get("workflows", [])
    extra_files = parsed_results.get("extra_files", [])
    external_findings = parsed_results.get("external_findings", [])

    issues = analyze(workflows, extra_files)
    issues.extend(_external_findings_to_issues(external_findings))

    return {
        "repo_path": parsed_results.get("repo_path", "."),
        "issues": issues,
        "external_findings": external_findings,
    }


def _external_findings_to_issues(findings: Iterable[dict[str, Any]]) -> list[Issue]:
    mapped: list[Issue] = []
    for idx, finding in enumerate(findings, start=1):
        tool = str(finding.get("tool", "external-scanner"))
        severity = str(finding.get("severity", "Medium")).title()
        if severity not in {"Critical", "High", "Medium", "Low"}:
            severity = "Medium"
        message = str(finding.get("message", "External scanner finding"))
        location = str(finding.get("location", ""))
        mapped.append(
            Issue(
                id=f"EXT-{idx:03d}",
                title=f"{tool} finding",
                threat_type="Supply Chain Attack",
                severity=severity,
                location={
                    "file_path": location,
                    "job_name": "",
                    "step_name": tool,
                    "line_number": 0,
                },
                description=message,
                impact="External scanner reported a security risk.",
                remediation="Review the scanner output and patch the reported issue.",
                confidence="Medium",
            )
        )
    return mapped


def _analyze_workflow(wf: WorkflowFile) -> list[Issue]:
    issues: list[Issue] = []
    data = wf.data
    raw_text = wf.raw_text
    jobs = _collect_jobs(data)

    # 1. Secrets Management Risks
    hardcoded_secret_pattern = r"(password|secret|token|apikey|api_key|aws_access_key_id|aws_secret_access_key)\s*[:=]\s*['\"]?[^$\\s][^'\"\\s]*"
    if re.search(hardcoded_secret_pattern, raw_text, re.IGNORECASE):
        issues.append(
            Issue(
                id="SEC-001",
                title="Possible hardcoded secret detected",
                threat_type="Secret Exposure",
                severity="High",
                location={
                    "file_path": str(wf.path),
                    "job_name": "",
                    "step_name": "",
                    "line_number": _find_line_number(raw_text, hardcoded_secret_pattern),
                },
                description="The workflow appears to contain a hardcoded credential-like value.",
                impact="Secrets stored in source control can be exposed and reused by attackers.",
                remediation="Move secrets to GitHub Secrets or a secret manager and reference them securely.",
                confidence="Medium",
            )
        )

    # Env vars with plaintext values
    workflow_env = _stringify_env(data.get("env"))
    for key, value in workflow_env.items():
        if re.search(r"(password|secret|token|key)", key, re.IGNORECASE):
            if "${{ secrets." not in value and "${{ github.token" not in value:
                issues.append(
                    Issue(
                        id="SEC-002",
                        title="Plaintext secret-like environment variable",
                        threat_type="Secret Exposure",
                        severity="High",
                        location={
                            "file_path": str(wf.path),
                            "job_name": "",
                            "step_name": "",
                            "line_number": _find_line_number(raw_text, rf"{re.escape(key)}:"),
                        },
                        description="An environment variable name suggests a secret and is set to a plaintext value.",
                        impact="Secrets may be exposed in logs, artifacts, or workflow history.",
                        remediation="Use GitHub Secrets and reference via `${{ secrets.NAME }}`.",
                        confidence="Medium",
                    )
                )

    # 2. Permission & Access Control Risks
    permissions = data.get("permissions")
    job_permissions_present = any(isinstance(job, dict) and job.get("permissions") is not None for job in jobs.values())
    if permissions is None and not job_permissions_present:
        issues.append(
            Issue(
                id="PERM-001",
                title="Missing explicit permissions block",
                threat_type="Privilege Escalation",
                severity="Medium",
                location={
                    "file_path": str(wf.path),
                    "job_name": "",
                    "step_name": "",
                    "line_number": _find_line_number(raw_text, r"permissions:"),
                },
                description="Workflow does not declare explicit GITHUB_TOKEN permissions.",
                impact="Default permissions may be broader than necessary.",
                remediation="Add an explicit `permissions` block with least privilege.",
                confidence="High",
            )
        )
    else:
        if isinstance(permissions, str) and permissions.lower() == "write-all":
            issues.append(
                Issue(
                    id="PERM-002",
                    title="Overly permissive GITHUB_TOKEN permissions",
                    threat_type="Privilege Escalation",
                    severity="High",
                    location={
                        "file_path": str(wf.path),
                        "job_name": "",
                        "step_name": "",
                        "line_number": _find_line_number(raw_text, r"permissions:\s*write-all"),
                    },
                    description="Workflow sets `permissions: write-all`.",
                    impact="A compromised job could modify repository contents and settings.",
                    remediation="Restrict permissions to the minimal set required.",
                    confidence="High",
                )
            )

    # 3. Third-Party Action Risks + 4. Dependency & Supply Chain Risks
    for job_name, job in jobs.items():
        job_env = _stringify_env(job.get("env"))
        for key, value in job_env.items():
            if re.search(r"(password|secret|token|key)", key, re.IGNORECASE):
                if "${{ secrets." not in value and "${{ github.token" not in value:
                    issues.append(
                        Issue(
                            id="SEC-003",
                            title="Plaintext secret-like job environment variable",
                            threat_type="Secret Exposure",
                            severity="High",
                            location={
                                "file_path": str(wf.path),
                                "job_name": job_name,
                                "step_name": "",
                                "line_number": _find_line_number(raw_text, rf"{re.escape(key)}:"),
                            },
                            description="A job-level environment variable appears to contain a plaintext secret.",
                            impact="Secrets may leak through logs, artifacts, or runtime environment.",
                            remediation="Use GitHub Secrets and reference via `${{ secrets.NAME }}`.",
                            confidence="Medium",
                        )
                    )

        runs_on = job.get("runs-on")
        if isinstance(runs_on, str) and "self-hosted" in runs_on:
            issues.append(
                Issue(
                    id="RUN-001",
                    title="Self-hosted runner used without isolation details",
                    threat_type="Privilege Escalation",
                    severity="Medium",
                    location={
                        "file_path": str(wf.path),
                        "job_name": job_name,
                        "step_name": "",
                        "line_number": _find_line_number(raw_text, r"runs-on:.*self-hosted"),
                    },
                    description="Job uses a self-hosted runner; isolation controls are not visible in workflow.",
                    impact="Compromise of the runner could affect other jobs or infrastructure.",
                    remediation="Use ephemeral, isolated runners and restrict network/credential access.",
                    confidence="Low",
                )
            )

        container = job.get("container")
        if isinstance(container, dict):
            options = str(container.get("options", ""))
            if "--privileged" in options:
                issues.append(
                    Issue(
                        id="RUN-002",
                        title="Privileged container used",
                        threat_type="Privilege Escalation",
                        severity="High",
                        location={
                            "file_path": str(wf.path),
                            "job_name": job_name,
                            "step_name": "",
                            "line_number": _find_line_number(raw_text, r"--privileged"),
                        },
                        description="Job container runs with `--privileged`.",
                        impact="Privileged containers can escape isolation and access host resources.",
                        remediation="Remove privileged mode and grant only necessary capabilities.",
                        confidence="High",
                    )
                )
            image = str(container.get("image", ""))
            if ":latest" in image:
                issues.append(
                    Issue(
                        id="DEP-001",
                        title="Container image uses latest tag",
                        threat_type="Supply Chain Attack",
                        severity="Medium",
                        location={
                            "file_path": str(wf.path),
                            "job_name": job_name,
                            "step_name": "",
                            "line_number": _find_line_number(raw_text, r"image:.*latest"),
                        },
                        description="Container image is pulled using the `latest` tag.",
                        impact="Image contents can change without notice, enabling supply-chain attacks.",
                        remediation="Pin to a specific, trusted version or digest.",
                        confidence="High",
                    )
                )

        steps = _collect_steps(job)
        for step in steps:
            step_name = str(step.get("name", "")).strip()
            uses = _uses_action(step)
            run_cmd = _run_command(step)

            if uses:
                if uses.startswith("docker://") and "@sha256:" not in uses:
                    issues.append(
                        Issue(
                            id="3P-001",
                            title="Docker action not pinned by digest",
                            threat_type="Supply Chain Attack",
                            severity="Medium",
                            location={
                                "file_path": str(wf.path),
                                "job_name": job_name,
                                "step_name": step_name,
                                "line_number": _find_line_number(raw_text, re.escape(uses)),
                            },
                            description="Docker-based action is referenced without a digest pin.",
                            impact="Image changes could introduce malicious code.",
                            remediation="Pin Docker actions using `@sha256:<digest>`.",
                            confidence="High",
                        )
                    )
                if re.match(r".+@v\\d+$", uses) or re.search(r"@main$|@master$", uses):
                    issues.append(
                        Issue(
                            id="3P-002",
                            title="Action not pinned to commit SHA",
                            threat_type="Supply Chain Attack",
                            severity="Medium",
                            location={
                                "file_path": str(wf.path),
                                "job_name": job_name,
                                "step_name": step_name,
                                "line_number": _find_line_number(raw_text, re.escape(uses)),
                            },
                            description="Third-party action is pinned to a version tag instead of a commit SHA.",
                            impact="Tags can be moved, enabling malicious updates.",
                            remediation="Pin actions to a full commit SHA and review updates.",
                            confidence="High",
                        )
                    )

            if run_cmd:
                if re.search(r"\\bcurl\\b.*\\|\\s*sh", run_cmd, re.IGNORECASE) or re.search(
                    r"\\bwget\\b.*\\|\\s*sh", run_cmd, re.IGNORECASE
                ):
                    issues.append(
                        Issue(
                            id="DEP-002",
                            title="Insecure install via curl|bash",
                            threat_type="Supply Chain Attack",
                            severity="High",
                            location={
                                "file_path": str(wf.path),
                                "job_name": job_name,
                                "step_name": step_name,
                                "line_number": _find_line_number(raw_text, r"(curl|wget).*(\\|\\s*sh)"),
                            },
                            description="Pipeline installs software by piping remote script to a shell.",
                            impact="If the script source is compromised, malicious code runs in CI.",
                            remediation="Download, verify checksums/signatures, and execute locally.",
                            confidence="High",
                        )
                    )
                if re.search(r"(echo|printf)\\s+.*\\${{\\s*secrets\\.", run_cmd, re.IGNORECASE):
                    issues.append(
                        Issue(
                            id="SEC-004",
                            title="Potential secret logging detected",
                            threat_type="Secret Exposure",
                            severity="High",
                            location={
                                "file_path": str(wf.path),
                                "job_name": job_name,
                                "step_name": step_name,
                                "line_number": _find_line_number(raw_text, r"secrets\\."),
                            },
                            description="Workflow step appears to echo a GitHub Secret to logs.",
                            impact="Secrets could be exposed in workflow logs.",
                            remediation="Remove secret output and use masked logging where needed.",
                            confidence="Medium",
                        )
                    )
                if "/var/run/docker.sock" in run_cmd:
                    issues.append(
                        Issue(
                            id="RUN-003",
                            title="Docker socket exposed",
                            threat_type="Privilege Escalation",
                            severity="High",
                            location={
                                "file_path": str(wf.path),
                                "job_name": job_name,
                                "step_name": step_name,
                                "line_number": _find_line_number(raw_text, r"/var/run/docker.sock"),
                            },
                            description="Workflow step references the Docker socket.",
                            impact="Attackers could gain control of the Docker daemon and host.",
                            remediation="Avoid mounting the Docker socket; use safer build mechanisms.",
                            confidence="High",
                        )
                    )

            if uses and "actions/upload-artifact" in uses:
                with_inputs = step.get("with", {})
                if isinstance(with_inputs, dict):
                    path_val = str(with_inputs.get("path", ""))
                    if re.search(r"(\\.env|id_rsa|\\.pem|secret|token)", path_val, re.IGNORECASE):
                        issues.append(
                            Issue(
                                id="ART-001",
                                title="Potentially sensitive artifact path",
                                threat_type="Secret Exposure",
                                severity="Medium",
                                location={
                                    "file_path": str(wf.path),
                                    "job_name": job_name,
                                    "step_name": step_name,
                                    "line_number": _find_line_number(raw_text, r"upload-artifact"),
                                },
                                description="Artifact upload path suggests sensitive files.",
                                impact="Secrets could be exposed via uploaded artifacts.",
                                remediation="Exclude secret files and sanitize artifact contents.",
                                confidence="Medium",
                            )
                        )
                    if "retention-days" not in with_inputs:
                        issues.append(
                            Issue(
                                id="ART-002",
                                title="Artifact retention not set",
                                threat_type="Data Exposure",
                                severity="Low",
                                location={
                                    "file_path": str(wf.path),
                                    "job_name": job_name,
                                    "step_name": step_name,
                                    "line_number": _find_line_number(raw_text, r"upload-artifact"),
                                },
                                description="Artifact retention period not specified.",
                                impact="Artifacts may persist longer than required, increasing exposure risk.",
                                remediation="Set `retention-days` to the shortest feasible duration.",
                                confidence="Medium",
                            )
                        )

        # Pull request target trigger risk
    triggers = data.get("on")
    if isinstance(triggers, dict) and "pull_request_target" in triggers:
        issues.append(
            Issue(
                id="TRIG-001",
                title="pull_request_target used",
                threat_type="Privilege Escalation",
                severity="High",
                location={
                    "file_path": str(wf.path),
                    "job_name": "",
                    "step_name": "",
                    "line_number": _find_line_number(raw_text, r"pull_request_target"),
                },
                description="Workflow is triggered by pull_request_target, which runs in the context of the base repo.",
                impact="Untrusted code could gain elevated permissions.",
                remediation="Avoid pull_request_target or add strict validation and permission limits.",
                confidence="High",
            )
        )

    # Workflow running on forks with write permissions
    if isinstance(triggers, dict) and "pull_request" in triggers:
        if permissions is None or (isinstance(permissions, str) and permissions.lower() == "write-all"):
            issues.append(
                Issue(
                    id="TRIG-002",
                    title="Pull request workflow without restricted permissions",
                    threat_type="Privilege Escalation",
                    severity="Medium",
                    location={
                        "file_path": str(wf.path),
                        "job_name": "",
                        "step_name": "",
                        "line_number": _find_line_number(raw_text, r"pull_request"),
                    },
                    description="Pull request workflows should minimize token permissions to avoid abuse from forks.",
                    impact="Malicious forks could access tokens or modify repository resources.",
                    remediation="Set minimal permissions and use read-only tokens for PRs.",
                    confidence="Medium",
                )
            )

    # Missing SCA scanning steps (simple heuristic)
    sca_found = re.search(r"(dependency-review-action|trivy|snyk|grype|ossf/scorecard)", raw_text, re.IGNORECASE)
    if not sca_found:
        issues.append(
            Issue(
                id="DEP-003",
                title="No software composition analysis step detected",
                threat_type="Supply Chain Attack",
                severity="Low",
                location={
                    "file_path": str(wf.path),
                    "job_name": "",
                    "step_name": "",
                    "line_number": 0,
                },
                description="Workflow does not appear to include dependency or container scanning.",
                impact="Vulnerable dependencies may be introduced without detection.",
                remediation="Add SCA tooling (e.g., dependency review, Trivy, Snyk, or Grype).",
                confidence="Low",
            )
        )

    return issues


def _analyze_text_file(tf: TextFile) -> list[Issue]:
    issues: list[Issue] = []
    text = tf.raw_text
    path_str = str(tf.path)
    filename = tf.path.name.lower()
    suffix = tf.path.suffix.lower()

    is_dockerfile = tf.path.name == "Dockerfile" or filename.startswith("dockerfile.")
    is_script = tf.path.suffix.lower() in {".sh", ".bash", ".ps1", ".py"}

    if is_dockerfile:
        user_directive = None
        for idx, line in enumerate(text.splitlines(), start=1):
            if re.search(r"^from\\s+.+:latest\\b", line, re.IGNORECASE):
                issues.append(
                    Issue(
                        id="DEP-101",
                        title="Dockerfile uses latest base image tag",
                        threat_type="Supply Chain Attack",
                        severity="Medium",
                        location={
                            "file_path": path_str,
                            "job_name": "",
                            "step_name": "",
                            "line_number": idx,
                        },
                        description="Base image is referenced with the `latest` tag in a Dockerfile.",
                        impact="Image updates may introduce unreviewed changes or malicious code.",
                        remediation="Pin base images to a specific version or digest.",
                        confidence="High",
                    )
                )
            user_match = re.search(r"^user\\s+(.+)$", line, re.IGNORECASE)
            if user_match:
                user_directive = user_match.group(1).strip()

        if not user_directive or user_directive.lower() in {"root", "0"}:
            issues.append(
                Issue(
                    id="DEP-105",
                    title="Dockerfile runs as root by default",
                    threat_type="Privilege Escalation",
                    severity="Medium",
                    location={
                        "file_path": path_str,
                        "job_name": "",
                        "step_name": "",
                        "line_number": _find_line_number(text, r"^USER\\s+"),
                    },
                    description="Dockerfile does not set a non-root USER or sets USER to root.",
                    impact="If the container is compromised, attackers gain root inside the container.",
                    remediation="Add a non-root USER and drop unnecessary privileges.",
                    confidence="Medium",
                )
            )
            if re.search(r"^from\\s+\\S+(?!@sha256:)", line, re.IGNORECASE) and ":" in line:
                if not re.search(r"@sha256:", line):
                    issues.append(
                        Issue(
                            id="DEP-102",
                            title="Dockerfile base image not pinned to digest",
                            threat_type="Supply Chain Attack",
                            severity="Low",
                            location={
                                "file_path": path_str,
                                "job_name": "",
                                "step_name": "",
                                "line_number": idx,
                            },
                            description="Base image is not pinned to a digest.",
                            impact="Base image contents can change without notice.",
                            remediation="Pin base images using a trusted digest.",
                            confidence="Medium",
                        )
                    )
            if re.search(r"\\bcurl\\b.*\\|\\s*sh", line, re.IGNORECASE) or re.search(
                r"\\bwget\\b.*\\|\\s*sh", line, re.IGNORECASE
            ):
                issues.append(
                    Issue(
                        id="DEP-103",
                        title="Dockerfile installs via curl|bash",
                        threat_type="Supply Chain Attack",
                        severity="High",
                        location={
                            "file_path": path_str,
                            "job_name": "",
                            "step_name": "",
                            "line_number": idx,
                        },
                        description="Dockerfile installs software by piping remote script to a shell.",
                        impact="If the script source is compromised, malicious code runs in build.",
                        remediation="Download, verify checksums/signatures, then execute locally.",
                        confidence="High",
                    )
                )

    if is_script:
        hardcoded_secret_pattern = r"(password|secret|token|apikey|api_key)\\s*[:=]\\s*['\\\"]?[^$\\s][^'\\\"\\s]*"
        if re.search(hardcoded_secret_pattern, text, re.IGNORECASE):
            issues.append(
                Issue(
                    id="SEC-101",
                    title="Possible hardcoded secret in script",
                    threat_type="Secret Exposure",
                    severity="High",
                    location={
                        "file_path": path_str,
                        "job_name": "",
                        "step_name": "",
                        "line_number": _find_line_number(text, hardcoded_secret_pattern),
                    },
                    description="Script appears to contain a hardcoded credential-like value.",
                    impact="Secrets in scripts can be leaked or reused by attackers.",
                    remediation="Move secrets to a secret manager or environment variables.",
                    confidence="Medium",
                )
            )
        if re.search(r"\\bcurl\\b.*\\|\\s*sh", text, re.IGNORECASE) or re.search(
            r"\\bwget\\b.*\\|\\s*sh", text, re.IGNORECASE
        ):
            issues.append(
                Issue(
                    id="DEP-104",
                    title="Script uses curl|bash pattern",
                    threat_type="Supply Chain Attack",
                    severity="High",
                    location={
                        "file_path": path_str,
                        "job_name": "",
                        "step_name": "",
                        "line_number": _find_line_number(text, r"(curl|wget).*\\|\\s*sh"),
                    },
                    description="Script pipes remote content directly to a shell.",
                    impact="Compromised script sources could execute arbitrary code.",
                    remediation="Download, verify, and execute scripts locally.",
                    confidence="High",
                )
            )

    if suffix in {".yml", ".yaml", ".json"}:
        issues.extend(_analyze_structured_config(tf))

    if suffix in {".tf", ".tf.json"}:
        issues.extend(_analyze_terraform(tf))

    return issues


def _analyze_structured_config(tf: TextFile) -> list[Issue]:
    issues: list[Issue] = []
    data_docs = _load_yaml_or_json(tf)
    if not data_docs:
        return issues

    for doc in data_docs:
        if _is_kubernetes_doc(doc):
            issues.extend(_analyze_kubernetes_doc(tf, doc))
        if _is_cloudformation_doc(doc):
            issues.extend(_analyze_cloudformation_doc(tf, doc))
        if _is_docker_compose_doc(doc):
            issues.extend(_analyze_docker_compose_doc(tf, doc))

    return issues


def _load_yaml_or_json(tf: TextFile) -> list[dict[str, Any]]:
    if tf.path.suffix.lower() == ".json":
        try:
            data = json.loads(tf.raw_text)
            if isinstance(data, dict):
                return [data]
            if isinstance(data, list):
                return [d for d in data if isinstance(d, dict)]
        except json.JSONDecodeError:
            return []
    else:
        try:
            docs = list(yaml.safe_load_all(tf.raw_text))
            return [d for d in docs if isinstance(d, dict)]
        except yaml.YAMLError:
            return []
    return []


def _is_kubernetes_doc(doc: dict[str, Any]) -> bool:
    return "apiVersion" in doc and "kind" in doc


def _is_cloudformation_doc(doc: dict[str, Any]) -> bool:
    return "Resources" in doc or "AWSTemplateFormatVersion" in doc


def _is_docker_compose_doc(doc: dict[str, Any]) -> bool:
    return "services" in doc and isinstance(doc.get("services"), dict)


def _analyze_kubernetes_doc(tf: TextFile, doc: dict[str, Any]) -> list[Issue]:
    issues: list[Issue] = []
    path_str = str(tf.path)
    kind = str(doc.get("kind", ""))
    metadata = doc.get("metadata", {}) if isinstance(doc.get("metadata"), dict) else {}
    name = str(metadata.get("name", ""))

    spec = doc.get("spec", {}) if isinstance(doc.get("spec"), dict) else {}
    pod_spec = spec.get("template", {}).get("spec") if isinstance(spec.get("template"), dict) else spec.get("spec", {})
    if not isinstance(pod_spec, dict):
        pod_spec = {}

    if pod_spec.get("hostNetwork") is True:
        issues.append(
            Issue(
                id="K8S-001",
                title="hostNetwork enabled",
                threat_type="Privilege Escalation",
                severity="Medium",
                location={
                    "file_path": path_str,
                    "job_name": "",
                    "step_name": f"{kind}/{name}".strip("/"),
                    "line_number": _find_line_number(tf.raw_text, r"hostNetwork:\s*true"),
                },
                description="Pod is configured with hostNetwork.",
                impact="Pod shares the host network namespace, increasing attack surface.",
                remediation="Disable hostNetwork unless required and apply strict network policies.",
                confidence="High",
            )
        )

    if pod_spec.get("hostPID") is True or pod_spec.get("hostIPC") is True:
        issues.append(
            Issue(
                id="K8S-002",
                title="Host namespace sharing enabled",
                threat_type="Privilege Escalation",
                severity="High",
                location={
                    "file_path": path_str,
                    "job_name": "",
                    "step_name": f"{kind}/{name}".strip("/"),
                    "line_number": _find_line_number(tf.raw_text, r"hostPID|hostIPC"),
                },
                description="Pod shares host PID/IPC namespaces.",
                impact="Compromise could allow deeper host interaction.",
                remediation="Disable hostPID/hostIPC unless absolutely necessary.",
                confidence="High",
            )
        )

    volumes = pod_spec.get("volumes", [])
    if isinstance(volumes, list):
        for vol in volumes:
            if isinstance(vol, dict) and "hostPath" in vol:
                issues.append(
                    Issue(
                        id="K8S-003",
                        title="hostPath volume mounted",
                        threat_type="Privilege Escalation",
                        severity="High",
                        location={
                            "file_path": path_str,
                            "job_name": "",
                            "step_name": f"{kind}/{name}".strip("/"),
                            "line_number": _find_line_number(tf.raw_text, r"hostPath"),
                        },
                        description="Pod mounts a hostPath volume.",
                        impact="Host filesystem exposure could lead to privilege escalation.",
                        remediation="Use safer volume types and restrict hostPath usage.",
                        confidence="High",
                    )
                )
                break

    containers = pod_spec.get("containers", [])
    if isinstance(containers, list):
        for container in containers:
            if not isinstance(container, dict):
                continue
            image = str(container.get("image", ""))
            if image and (":" not in image or image.endswith(":latest")):
                issues.append(
                    Issue(
                        id="K8S-004",
                        title="Container image not pinned",
                        threat_type="Supply Chain Attack",
                        severity="Medium",
                        location={
                            "file_path": path_str,
                            "job_name": "",
                            "step_name": f"{kind}/{name}".strip("/"),
                            "line_number": _find_line_number(tf.raw_text, re.escape(image)),
                        },
                        description="Container image uses no tag or `latest` tag.",
                        impact="Unreviewed image changes could be deployed.",
                        remediation="Pin images to a specific version or digest.",
                        confidence="High",
                    )
                )
            security_context = container.get("securityContext", {}) if isinstance(container.get("securityContext"), dict) else {}
            if security_context.get("privileged") is True:
                issues.append(
                    Issue(
                        id="K8S-005",
                        title="Privileged container",
                        threat_type="Privilege Escalation",
                        severity="High",
                        location={
                            "file_path": path_str,
                            "job_name": "",
                            "step_name": f"{kind}/{name}".strip("/"),
                            "line_number": _find_line_number(tf.raw_text, r"privileged:\s*true"),
                        },
                        description="Container is running in privileged mode.",
                        impact="Privileged containers can access host resources.",
                        remediation="Disable privileged mode and use least privileges.",
                        confidence="High",
                    )
                )
            if security_context.get("allowPrivilegeEscalation") is True:
                issues.append(
                    Issue(
                        id="K8S-006",
                        title="Privilege escalation allowed",
                        threat_type="Privilege Escalation",
                        severity="High",
                        location={
                            "file_path": path_str,
                            "job_name": "",
                            "step_name": f"{kind}/{name}".strip("/"),
                            "line_number": _find_line_number(tf.raw_text, r"allowPrivilegeEscalation:\s*true"),
                        },
                        description="Container allows privilege escalation.",
                        impact="Compromised processes can gain elevated privileges.",
                        remediation="Set `allowPrivilegeEscalation: false`.",
                        confidence="High",
                    )
                )
            if security_context.get("runAsNonRoot") is False or security_context.get("runAsUser") == 0:
                issues.append(
                    Issue(
                        id="K8S-007",
                        title="Container runs as root",
                        threat_type="Privilege Escalation",
                        severity="Medium",
                        location={
                            "file_path": path_str,
                            "job_name": "",
                            "step_name": f"{kind}/{name}".strip("/"),
                            "line_number": _find_line_number(tf.raw_text, r"runAsNonRoot|runAsUser"),
                        },
                        description="Container is configured to run as root or not non-root.",
                        impact="Root containers increase blast radius if compromised.",
                        remediation="Run as non-root and set `runAsNonRoot: true`.",
                        confidence="Medium",
                    )
                )

    return issues


def _analyze_docker_compose_doc(tf: TextFile, doc: dict[str, Any]) -> list[Issue]:
    issues: list[Issue] = []
    path_str = str(tf.path)
    services = doc.get("services", {})
    if not isinstance(services, dict):
        return issues

    for svc_name, svc in services.items():
        if not isinstance(svc, dict):
            continue
        image = str(svc.get("image", ""))
        if image and (":" not in image or image.endswith(":latest")):
            issues.append(
                Issue(
                    id="DC-001",
                    title="Docker Compose image not pinned",
                    threat_type="Supply Chain Attack",
                    severity="Medium",
                    location={
                        "file_path": path_str,
                        "job_name": "",
                        "step_name": svc_name,
                        "line_number": _find_line_number(tf.raw_text, re.escape(image)),
                    },
                    description="Compose service image uses no tag or `latest`.",
                    impact="Unreviewed image updates could be deployed.",
                    remediation="Pin images to a specific version or digest.",
                    confidence="High",
                )
            )
        if svc.get("privileged") is True:
            issues.append(
                Issue(
                    id="DC-002",
                    title="Privileged container in Compose",
                    threat_type="Privilege Escalation",
                    severity="High",
                    location={
                        "file_path": path_str,
                        "job_name": "",
                        "step_name": svc_name,
                        "line_number": _find_line_number(tf.raw_text, r"privileged:\s*true"),
                    },
                    description="Compose service runs with privileged mode.",
                    impact="Privileged containers can access host resources.",
                    remediation="Disable privileged mode.",
                    confidence="High",
                )
            )
        volumes = svc.get("volumes", [])
        if isinstance(volumes, list):
            for vol in volumes:
                vol_str = str(vol)
                if "/var/run/docker.sock" in vol_str:
                    issues.append(
                        Issue(
                            id="DC-003",
                            title="Docker socket exposed in Compose",
                            threat_type="Privilege Escalation",
                            severity="High",
                            location={
                                "file_path": path_str,
                                "job_name": "",
                                "step_name": svc_name,
                                "line_number": _find_line_number(tf.raw_text, r"/var/run/docker.sock"),
                            },
                            description="Compose service mounts the Docker socket.",
                            impact="Compromise could lead to host takeover via Docker daemon.",
                            remediation="Avoid mounting the Docker socket.",
                            confidence="High",
                        )
                    )
                    break
        ports = svc.get("ports", [])
        if isinstance(ports, list):
            for port in ports:
                port_str = str(port)
                if "0.0.0.0:22" in port_str or port_str.startswith("22:"):
                    issues.append(
                        Issue(
                            id="DC-004",
                            title="SSH exposed in Compose",
                            threat_type="Unauthorized Access",
                            severity="High",
                            location={
                                "file_path": path_str,
                                "job_name": "",
                                "step_name": svc_name,
                                "line_number": _find_line_number(tf.raw_text, r"22:"),
                            },
                            description="Compose service exposes SSH to all interfaces.",
                            impact="SSH exposure increases brute-force and exploit risk.",
                            remediation="Restrict exposure or use a bastion with strict rules.",
                            confidence="Medium",
                        )
                    )
                    break

    return issues


def _analyze_cloudformation_doc(tf: TextFile, doc: dict[str, Any]) -> list[Issue]:
    issues: list[Issue] = []
    resources = doc.get("Resources", {})
    if not isinstance(resources, dict):
        return issues
    path_str = str(tf.path)

    for res_name, res in resources.items():
        if not isinstance(res, dict):
            continue
        res_type = str(res.get("Type", ""))
        props = res.get("Properties", {}) if isinstance(res.get("Properties"), dict) else {}

        if res_type == "AWS::S3::Bucket":
            acl = str(props.get("AccessControl", ""))
            if acl.lower() in {"public-read", "public-read-write"}:
                issues.append(
                    Issue(
                        id="AWS-001",
                        title="S3 bucket public ACL",
                        threat_type="Data Exposure",
                        severity="High",
                        location={
                            "file_path": path_str,
                            "job_name": "",
                            "step_name": res_name,
                            "line_number": _find_line_number(tf.raw_text, r"AccessControl"),
                        },
                        description="S3 bucket AccessControl allows public read/write.",
                        impact="Sensitive data could be exposed publicly.",
                        remediation="Use private ACLs and block public access.",
                        confidence="High",
                    )
                )
            pab = props.get("PublicAccessBlockConfiguration", {})
            if isinstance(pab, dict):
                for key in ["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"]:
                    if pab.get(key) is False:
                        issues.append(
                            Issue(
                                id="AWS-002",
                                title="S3 public access block disabled",
                                threat_type="Data Exposure",
                                severity="High",
                                location={
                                    "file_path": path_str,
                                    "job_name": "",
                                    "step_name": res_name,
                                    "line_number": _find_line_number(tf.raw_text, r"PublicAccessBlockConfiguration"),
                                },
                                description="S3 public access block is disabled.",
                                impact="Public access could be enabled unintentionally.",
                                remediation="Enable all public access block settings.",
                                confidence="High",
                            )
                        )
                        break

        if res_type in {"AWS::IAM::Policy", "AWS::IAM::ManagedPolicy", "AWS::IAM::Role"}:
            policy_doc = props.get("PolicyDocument") or props.get("AssumeRolePolicyDocument") or {}
            if _policy_has_wildcards(policy_doc):
                issues.append(
                    Issue(
                        id="AWS-003",
                        title="IAM policy uses wildcard",
                        threat_type="Privilege Escalation",
                        severity="High",
                        location={
                            "file_path": path_str,
                            "job_name": "",
                            "step_name": res_name,
                            "line_number": _find_line_number(tf.raw_text, r"PolicyDocument|AssumeRolePolicyDocument"),
                        },
                        description="IAM policy grants wildcard actions or resources.",
                        impact="Overly broad permissions enable lateral movement.",
                        remediation="Scope actions and resources to least privilege.",
                        confidence="High",
                    )
                )

        if res_type == "AWS::EC2::SecurityGroup":
            ingress = props.get("SecurityGroupIngress", [])
            if isinstance(ingress, dict):
                ingress = [ingress]
            if isinstance(ingress, list):
                for rule in ingress:
                    if not isinstance(rule, dict):
                        continue
                    cidr = str(rule.get("CidrIp", ""))
                    from_port = rule.get("FromPort")
                    to_port = rule.get("ToPort")
                    if cidr == "0.0.0.0/0" and (from_port in {22, 3389, -1} or to_port in {22, 3389, -1}):
                        issues.append(
                            Issue(
                                id="AWS-004",
                                title="Security group open to the world",
                                threat_type="Unauthorized Access",
                                severity="High",
                                location={
                                    "file_path": path_str,
                                    "job_name": "",
                                    "step_name": res_name,
                                    "line_number": _find_line_number(tf.raw_text, r"SecurityGroupIngress"),
                                },
                                description="Security group allows public access to sensitive ports.",
                                impact="Increases risk of brute force and exploitation.",
                                remediation="Restrict CIDR ranges and limit ports.",
                                confidence="High",
                            )
                        )
                        break

        if res_type == "AWS::RDS::DBInstance" and props.get("PubliclyAccessible") is True:
            issues.append(
                Issue(
                    id="AWS-005",
                    title="RDS instance publicly accessible",
                    threat_type="Data Exposure",
                    severity="High",
                    location={
                        "file_path": path_str,
                        "job_name": "",
                        "step_name": res_name,
                        "line_number": _find_line_number(tf.raw_text, r"PubliclyAccessible"),
                    },
                    description="RDS instance allows public access.",
                    impact="Database could be reached from the internet.",
                    remediation="Place RDS in private subnets and disable public access.",
                    confidence="High",
                )
            )

        if res_type == "AWS::EKS::Cluster":
            vpc = props.get("ResourcesVpcConfig", {}) if isinstance(props.get("ResourcesVpcConfig"), dict) else {}
            if vpc.get("EndpointPublicAccess") is True:
                cidrs = vpc.get("PublicAccessCidrs", [])
                if not cidrs or "0.0.0.0/0" in cidrs:
                    issues.append(
                        Issue(
                            id="AWS-006",
                            title="EKS public endpoint open",
                            threat_type="Unauthorized Access",
                            severity="High",
                            location={
                                "file_path": path_str,
                                "job_name": "",
                                "step_name": res_name,
                                "line_number": _find_line_number(tf.raw_text, r"EndpointPublicAccess"),
                            },
                            description="EKS API endpoint is publicly accessible without CIDR restriction.",
                            impact="Cluster API may be exposed to the internet.",
                            remediation="Disable public access or restrict CIDRs to trusted networks.",
                            confidence="High",
                        )
                    )

    return issues


def _policy_has_wildcards(policy_doc: Any) -> bool:
    try:
        policy_str = json.dumps(policy_doc)
    except (TypeError, ValueError):
        policy_str = str(policy_doc)
    return bool(re.search(r'"Action"\s*:\s*"\*"|"Resource"\s*:\s*"\*"', policy_str))


def _analyze_terraform(tf: TextFile) -> list[Issue]:
    issues: list[Issue] = []
    text = tf.raw_text
    path_str = str(tf.path)

    if re.search(r'resource\s+"aws_s3_bucket"\s+".+?"\s*{[^}]*acl\s*=\s*"(public-read|public-read-write)"', text, re.IGNORECASE | re.DOTALL):
        issues.append(
            Issue(
                id="AWS-101",
                title="S3 bucket public ACL (Terraform)",
                threat_type="Data Exposure",
                severity="High",
                location={
                    "file_path": path_str,
                    "job_name": "",
                    "step_name": "",
                    "line_number": _find_line_number(text, r"acl\s*=\s*\"public-"),
                },
                description="Terraform defines an S3 bucket with a public ACL.",
                impact="S3 data could be publicly exposed.",
                remediation="Use private ACLs and enable public access block.",
                confidence="High",
            )
        )

    if re.search(r"public_access_block.*(block_public_acls\s*=\s*false|ignore_public_acls\s*=\s*false|block_public_policy\s*=\s*false|restrict_public_buckets\s*=\s*false)", text, re.IGNORECASE | re.DOTALL):
        issues.append(
            Issue(
                id="AWS-102",
                title="S3 public access block disabled (Terraform)",
                threat_type="Data Exposure",
                severity="High",
                location={
                    "file_path": path_str,
                    "job_name": "",
                    "step_name": "",
                    "line_number": _find_line_number(text, r"public_access_block"),
                },
                description="Terraform disables S3 public access block settings.",
                impact="Buckets may become publicly accessible.",
                remediation="Enable all S3 public access block controls.",
                confidence="High",
            )
        )

    if re.search(r'Principal\s*=\s*"\*"', text, re.IGNORECASE) or re.search(r'"Principal"\s*:\s*"\*"', text, re.IGNORECASE):
        issues.append(
            Issue(
                id="AWS-103",
                title="S3/IAM policy with wildcard principal (Terraform)",
                threat_type="Privilege Escalation",
                severity="High",
                location={
                    "file_path": path_str,
                    "job_name": "",
                    "step_name": "",
                    "line_number": _find_line_number(text, r"Principal"),
                },
                description="Terraform policy allows wildcard principal.",
                impact="Any principal could gain access.",
                remediation="Restrict principals to trusted identities.",
                confidence="High",
            )
        )

    if re.search(r'cidr_blocks\s*=\s*\[\s*"0\.0\.0\.0/0"\s*\]', text, re.IGNORECASE):
        if re.search(r"from_port\s*=\s*(22|3389|-1)", text, re.IGNORECASE) or re.search(r"protocol\s*=\s*\"-1\"", text, re.IGNORECASE):
            issues.append(
                Issue(
                    id="AWS-104",
                    title="Security group open to the world (Terraform)",
                    threat_type="Unauthorized Access",
                    severity="High",
                    location={
                        "file_path": path_str,
                        "job_name": "",
                        "step_name": "",
                        "line_number": _find_line_number(text, r"cidr_blocks"),
                    },
                    description="Security group rule allows 0.0.0.0/0 to sensitive ports.",
                    impact="Increases risk of brute-force and exploitation.",
                    remediation="Restrict CIDR ranges and ports.",
                    confidence="High",
                )
            )

    if re.search(r'resource\s+"aws_db_instance"\s+".+?"\s*{[^}]*publicly_accessible\s*=\s*true', text, re.IGNORECASE | re.DOTALL):
        issues.append(
            Issue(
                id="AWS-105",
                title="RDS instance publicly accessible (Terraform)",
                threat_type="Data Exposure",
                severity="High",
                location={
                    "file_path": path_str,
                    "job_name": "",
                    "step_name": "",
                    "line_number": _find_line_number(text, r"publicly_accessible"),
                },
                description="Terraform sets RDS publicly accessible.",
                impact="Database may be reachable from the internet.",
                remediation="Disable public access and place RDS in private subnets.",
                confidence="High",
            )
        )

    if re.search(r'resource\s+"aws_eks_cluster"\s+".+?"\s*{[^}]*endpoint_public_access\s*=\s*true', text, re.IGNORECASE | re.DOTALL):
        if re.search(r"public_access_cidrs\s*=\s*\[\s*\"0\.0\.0\.0/0\"\s*\]", text, re.IGNORECASE) or "public_access_cidrs" not in text:
            issues.append(
                Issue(
                    id="AWS-106",
                    title="EKS public endpoint open (Terraform)",
                    threat_type="Unauthorized Access",
                    severity="High",
                    location={
                        "file_path": path_str,
                        "job_name": "",
                        "step_name": "",
                        "line_number": _find_line_number(text, r"endpoint_public_access"),
                    },
                    description="EKS API endpoint is publicly accessible without CIDR restriction.",
                    impact="Cluster API may be exposed to the internet.",
                    remediation="Disable public access or restrict public_access_cidrs.",
                    confidence="High",
                )
            )

    if re.search(r'"Action"\s*:\s*"\*"', text, re.IGNORECASE) or re.search(r'"Resource"\s*:\s*"\*"', text, re.IGNORECASE):
        issues.append(
            Issue(
                id="AWS-107",
                title="IAM policy wildcard actions/resources (Terraform)",
                threat_type="Privilege Escalation",
                severity="High",
                location={
                    "file_path": path_str,
                    "job_name": "",
                    "step_name": "",
                    "line_number": _find_line_number(text, r"Action|Resource"),
                },
                description="Policy document contains wildcard actions or resources.",
                impact="Overly broad permissions enable lateral movement.",
                remediation="Scope actions and resources to least privilege.",
                confidence="High",
            )
        )
    if re.search(r"actions\s*=\s*\[\s*\"\\*\"\s*\]", text, re.IGNORECASE) or re.search(
        r"resources\s*=\s*\[\s*\"\\*\"\s*\]", text, re.IGNORECASE
    ):
        issues.append(
            Issue(
                id="AWS-108",
                title="IAM policy wildcard actions/resources (HCL)",
                threat_type="Privilege Escalation",
                severity="High",
                location={
                    "file_path": path_str,
                    "job_name": "",
                    "step_name": "",
                    "line_number": _find_line_number(text, r"actions\s*=|resources\s*="),
                },
                description="Terraform HCL policy contains wildcard actions or resources.",
                impact="Overly broad permissions enable lateral movement.",
                remediation="Scope actions and resources to least privilege.",
                confidence="High",
            )
        )

    return issues
