$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$GitDir = Join-Path $RepoRoot (git -C $RepoRoot rev-parse --git-dir)
$HooksDir = Join-Path $GitDir 'hooks'
$Source = Join-Path $PSScriptRoot 'git-hooks/prepare-commit-msg'
$Target = Join-Path $HooksDir 'prepare-commit-msg'

if (-not (Test-Path $Source)) {
  Write-Error "Hook not found: $Source"
}

New-Item -ItemType Directory -Force -Path $HooksDir | Out-Null
Copy-Item -Path $Source -Destination $Target -Force

Write-Host "Installed: $Target"
