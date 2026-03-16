$ErrorActionPreference = "Stop"

param(
  [Parameter(Mandatory = $true)]
  [string]$Version
)

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
  Write-Error "Unable to find git repo root."
  exit 1
}

Set-Location $repoRoot

$tag = "v$Version"

git status --porcelain | ForEach-Object { throw "Working tree is dirty. Commit changes before tagging." }

git tag -a $tag -m "Release $tag"
git push origin $tag

Write-Host "Tagged and pushed $tag"
