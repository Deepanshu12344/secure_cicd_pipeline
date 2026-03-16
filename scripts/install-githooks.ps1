$ErrorActionPreference = "Stop"

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
  Write-Error "Unable to find git repo root."
  exit 1
}

Set-Location $repoRoot
git config core.hooksPath ".githooks"

Write-Host "Git hooks installed at .githooks"
Write-Host "Pre-commit gate enabled."
