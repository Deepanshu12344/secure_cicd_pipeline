import unittest
from pathlib import Path

from parser import find_additional_files, load_text_file, parse_workflows
from rules_engine import analyze


class ScannerTests(unittest.TestCase):
    def test_sample_repo_findings(self) -> None:
        repo_path = Path(__file__).resolve().parent.parent
        workflows = parse_workflows(repo_path)
        additional_paths = find_additional_files(repo_path)
        extra_files = [tf for tf in (load_text_file(p) for p in additional_paths) if tf is not None]
        issues = analyze(workflows, extra_files)
        issue_ids = {issue.id for issue in issues}

        expected = {"SEC-002", "AWS-104", "K8S-005", "DC-003", "AWS-005"}
        self.assertTrue(expected.issubset(issue_ids))


if __name__ == "__main__":
    unittest.main()
