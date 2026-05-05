from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass
class WorkflowFile:
    path: Path
    raw_text: str
    data: dict[str, Any]


@dataclass
class TextFile:
    path: Path
    raw_text: str


def _safe_load_yaml(text: str) -> dict[str, Any]:
    try:
        loaded = yaml.safe_load(text)
        if isinstance(loaded, dict):
            return loaded
        return {}
    except yaml.YAMLError:
        return {}


def find_workflow_files(repo_path: Path) -> list[Path]:
    workflows_dir = repo_path / ".github" / "workflows"
    if not workflows_dir.exists():
        return []
    files = []
    files.extend(workflows_dir.glob("*.yml"))
    files.extend(workflows_dir.glob("*.yaml"))
    return files


def parse_workflows(repo_path: Path) -> list[WorkflowFile]:
    workflows: list[WorkflowFile] = []
    for wf_path in find_workflow_files(repo_path):
        raw_text = wf_path.read_text(encoding="utf-8", errors="ignore")
        data = _safe_load_yaml(raw_text)
        workflows.append(WorkflowFile(path=wf_path, raw_text=raw_text, data=data))
    return workflows


def load_text_file(path: Path) -> TextFile | None:
    if not path.exists() or not path.is_file():
        return None
    raw_text = path.read_text(encoding="utf-8", errors="ignore")
    return TextFile(path=path, raw_text=raw_text)


def find_additional_files(repo_path: Path) -> list[Path]:
    ignore_dirs = {".git", ".venv", "venv", "node_modules", "__pycache__"}
    candidates: list[Path] = []
    for path in repo_path.rglob("*"):
        if not path.is_file():
            continue
        if any(part in ignore_dirs for part in path.parts):
            continue
        if ".github" in path.parts and "workflows" in path.parts:
            continue
        name = path.name.lower()
        suffix = path.suffix.lower()
        if name == "dockerfile" or name.startswith("dockerfile."):
            candidates.append(path)
            continue
        if name.startswith("docker-compose") and suffix in {".yml", ".yaml"}:
            candidates.append(path)
            continue
        if suffix in {".tf", ".tf.json"}:
            candidates.append(path)
            continue
        if suffix in {".yml", ".yaml", ".json"}:
            candidates.append(path)
            continue
        if suffix in {".sh", ".bash", ".ps1", ".py"}:
            candidates.append(path)
            continue
    return candidates


def parse(raw_results: dict[str, Any]) -> dict[str, Any]:
    workflows = raw_results.get("workflows", [])
    extra_files = raw_results.get("extra_files", [])
    external_findings = raw_results.get("external_findings", [])
    repo_path = raw_results.get("repo_path", ".")

    return {
        "repo_path": str(repo_path),
        "workflows": workflows,
        "extra_files": extra_files,
        "external_findings": external_findings,
    }
