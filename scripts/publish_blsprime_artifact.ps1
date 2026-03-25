param(
  [string]$PythonExe = "C:\conda\python.exe",
  [string]$CommitMessage = $(if ($env:BLS_PRIME_ARTIFACT_COMMIT_MESSAGE) { $env:BLS_PRIME_ARTIFACT_COMMIT_MESSAGE } elseif ($env:BLS_PRIME_APP_NAME) { "Update $($env:BLS_PRIME_APP_NAME) dashboard artifact" } elseif ($env:NEXT_PUBLIC_BLS_APP_NAME) { "Update $($env:NEXT_PUBLIC_BLS_APP_NAME) dashboard artifact" } else { "Update dashboard artifact" }),
  [switch]$Push,
  [switch]$SkipRefresh,
  [switch]$SkipPortfolioManager
)

$ErrorActionPreference = "Stop"

$metaRoot = Split-Path -Parent $PSScriptRoot
$refreshScript = Join-Path $PSScriptRoot "refresh_blsprime_local.ps1"
$artifactPath = "artifacts/dashboard/latest"

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

if (!(Test-Path $refreshScript)) {
  throw "Refresh script not found at $refreshScript"
}

Push-Location $metaRoot
try {
  if (-not $SkipRefresh) {
    Write-Step "Refreshing and publishing dashboard artifact"
    $refreshArgs = @{
      PythonExe = $PythonExe
    }
    if ($SkipPortfolioManager) {
      $refreshArgs.SkipPortfolioManager = $true
    }
    & $refreshScript @refreshArgs
  }

  Write-Step "Staging artifact files"
  git add $artifactPath

  $cachedDiff = git diff --cached --name-only -- $artifactPath
  if (-not $cachedDiff) {
    Write-Host "No artifact changes detected. Nothing to commit." -ForegroundColor Yellow
    exit 0
  }

  Write-Step "Committing artifact update"
  git commit -m $CommitMessage

  if ($Push) {
    Write-Step "Pushing to origin"
    git push
  } else {
    Write-Host "Commit created locally. Re-run with -Push or run 'git push' when ready." -ForegroundColor Green
  }
} finally {
  Pop-Location
}
