from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import re

from parser import find_additional_files, load_text_file, parse_workflows
from reporter import build_report, report_to_json, write_report
from rules_engine import analyze
from scorer import score_issues


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="GitHub Actions security scanner")
    parser.add_argument("--repo-path", default=".", help="Path to the repository root")
    parser.add_argument("--repo-url", default="", help="Git clone URL to scan")
    parser.add_argument("--branch", default="", help="Optional git branch or tag to checkout")
    parser.add_argument("--output", default="", help="Optional JSON output file path")
    parser.add_argument("--output-dir", default="", help="Directory to store JSON/PDF reports")
    parser.add_argument("--pdf", action="store_true", help="Generate a PDF report using reportlab")
    return parser.parse_args()


def _normalize_path(repo_path: Path, raw_path: str) -> Path | None:
    if not raw_path:
        return None
    raw_path = raw_path.strip().strip('"').strip("'")
    path = Path(raw_path)
    if path.is_absolute():
        return None
    return (repo_path / path).resolve()


def _collect_referenced_files(workflows, repo_path: Path) -> list[Path]:
    referenced: set[Path] = set()
    docker_build_re = re.compile(r"docker\\s+build(?:\\s+[^\\n]*)?", re.IGNORECASE)
    docker_file_re = re.compile(r"(?:-f|--file)\\s+([^\\s]+)")
    script_re = re.compile(r"\\b(bash|sh|python|pwsh|powershell)\\s+([^\\s]+)")
    exec_re = re.compile(r"\\./([^\\s]+)")

    for wf in workflows:
        data = wf.data
        jobs = data.get("jobs", {})
        if not isinstance(jobs, dict):
            continue
        for job in jobs.values():
            if not isinstance(job, dict):
                continue
            steps = job.get("steps", [])
            if not isinstance(steps, list):
                continue
            for step in steps:
                if not isinstance(step, dict):
                    continue
                run_cmd = str(step.get("run", ""))
                uses = str(step.get("uses", ""))
                with_inputs = step.get("with", {})

                if run_cmd:
                    if docker_build_re.search(run_cmd):
                        file_match = docker_file_re.search(run_cmd)
                        if file_match:
                            path = _normalize_path(repo_path, file_match.group(1))
                            if path:
                                referenced.add(path)
                        else:
                            default = repo_path / "Dockerfile"
                            if default.exists():
                                referenced.add(default.resolve())

                    for match in script_re.finditer(run_cmd):
                        path = _normalize_path(repo_path, match.group(2))
                        if path:
                            referenced.add(path)

                    for match in exec_re.finditer(run_cmd):
                        path = _normalize_path(repo_path, match.group(1))
                        if path:
                            referenced.add(path)

                if uses and "docker/build-push-action" in uses and isinstance(with_inputs, dict):
                    dockerfile_path = with_inputs.get("file") or with_inputs.get("dockerfile")
                    if dockerfile_path:
                        path = _normalize_path(repo_path, str(dockerfile_path))
                        if path:
                            referenced.add(path)

    return sorted(referenced)


def _run_tool(cmd: list[str], cwd: Path) -> tuple[int, str, str]:
    try:
        result = subprocess.run(
            cmd,
            cwd=str(cwd),
            text=True,
            capture_output=True,
            timeout=180,
            check=False,
        )
    except (subprocess.SubprocessError, OSError):
        return 127, "", ""
    return result.returncode, result.stdout, result.stderr


def _scan_with_external_tools(repo_path: Path) -> list[dict]:
    findings: list[dict] = []

    if shutil.which("pip-audit"):
        code, out, err = _run_tool(["pip-audit", "--format", "json"], repo_path)
        try:
            data = json.loads(out) if out else {}
        except ValueError:
            data = {}
        vulns = data.get("vulnerabilities", []) if isinstance(data, dict) else []
        if code != 0 or vulns:
            findings.append(
                {
                    "tool": "pip-audit",
                    "severity": "High" if vulns else "Medium",
                    "message": f"pip-audit found {len(vulns)} vulnerability records",
                    "location": str(repo_path / "requirements.txt"),
                    "raw_error": err.strip(),
                }
            )

    if shutil.which("semgrep"):
        code, out, err = _run_tool(["semgrep", "--json", "."], repo_path)
        try:
            data = json.loads(out) if out else {}
        except ValueError:
            data = {}
        results = data.get("results", []) if isinstance(data, dict) else []
        if code != 0 or results:
            findings.append(
                {
                    "tool": "semgrep",
                    "severity": "High" if results else "Medium",
                    "message": f"semgrep found {len(results)} findings",
                    "location": str(repo_path),
                    "raw_error": err.strip(),
                }
            )

    if shutil.which("trivy"):
        code, out, err = _run_tool(["trivy", "fs", "--format", "json", "."], repo_path)
        try:
            data = json.loads(out) if out else {}
        except ValueError:
            data = {}

        results = data.get("Results", []) if isinstance(data, dict) else []
        vuln_count = 0
        for result in results:
            if isinstance(result, dict):
                vulnerabilities = result.get("Vulnerabilities", [])
                if isinstance(vulnerabilities, list):
                    vuln_count += len(vulnerabilities)
        if code != 0 or vuln_count > 0:
            findings.append(
                {
                    "tool": "trivy",
                    "severity": "High" if vuln_count else "Medium",
                    "message": f"trivy found {vuln_count} vulnerabilities",
                    "location": str(repo_path),
                    "raw_error": err.strip(),
                }
            )

    return findings


def scan(repo_path: str = ".", repo_url: str = "", branch: str = "") -> dict:
    resolved_repo = Path(repo_path).resolve()
    temp_dir: Path | None = None

    if repo_url:
        if shutil.which("git") is None:
            raise RuntimeError("git not found in PATH")
        temp_dir = Path(tempfile.mkdtemp(prefix="cicd-scan-"))
        clone_cmd = ["git", "clone", repo_url, str(temp_dir)]
        if branch:
            clone_cmd = ["git", "clone", "--branch", branch, "--single-branch", repo_url, str(temp_dir)]
        result = subprocess.run(clone_cmd, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "git clone failed")
        resolved_repo = temp_dir.resolve()

    workflows = parse_workflows(resolved_repo)
    referenced_paths = _collect_referenced_files(workflows, resolved_repo)
    additional_paths = find_additional_files(resolved_repo)
    all_paths = sorted({*referenced_paths, *additional_paths})
    extra_files = [tf for tf in (load_text_file(p) for p in all_paths) if tf is not None]
    external_findings = _scan_with_external_tools(resolved_repo)

    if temp_dir:
        try:
            shutil.rmtree(temp_dir)
        except OSError:
            pass

    return {
        "repo_path": str(resolved_repo),
        "workflows": workflows,
        "extra_files": extra_files,
        "external_findings": external_findings,
    }


def main() -> int:
    args = _parse_args()
    repo_path = Path(args.repo_path).resolve()
    temp_dir: Path | None = None

    if args.repo_url:
        if shutil.which("git") is None:
            print("git not found in PATH", file=sys.stderr)
            return 1
        temp_dir = Path(tempfile.mkdtemp(prefix="cicd-scan-"))
        clone_cmd = ["git", "clone", args.repo_url, str(temp_dir)]
        if args.branch:
            clone_cmd = ["git", "clone", "--branch", args.branch, "--single-branch", args.repo_url, str(temp_dir)]
        try:
            subprocess.run(clone_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        except subprocess.CalledProcessError as exc:
            print(exc.stderr.strip() or "git clone failed", file=sys.stderr)
            return 1
        repo_path = temp_dir.resolve()

    workflows = parse_workflows(repo_path)
    referenced_paths = _collect_referenced_files(workflows, repo_path)
    additional_paths = find_additional_files(repo_path)
    all_paths = sorted({*referenced_paths, *additional_paths})
    extra_files = [tf for tf in (load_text_file(p) for p in all_paths) if tf is not None]
    issues = analyze(workflows, extra_files)
    score = score_issues(issues)

    pipeline_name = repo_path.name
    report = build_report(pipeline_name, issues, score)

    output_written = False
    if args.output_dir:
        out_dir = Path(args.output_dir).resolve()
        out_dir.mkdir(parents=True, exist_ok=True)
        json_path = out_dir / "report.json"
        write_report(report, json_path)
        output_written = True
        if args.pdf:
            from report_generator import build_pdf_report

            pdf_path = out_dir / "report.pdf"
            build_pdf_report(report, pdf_path)

    if args.output:
        write_report(report, Path(args.output))
        output_written = True

    if not output_written:
        print(report_to_json(report))

    if temp_dir:
        try:
            shutil.rmtree(temp_dir)
        except OSError:
            pass

    if score.critical_count > 0:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
