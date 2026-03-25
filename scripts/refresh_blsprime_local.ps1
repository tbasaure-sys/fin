param(
  [string]$PythonExe = "C:\conda\python.exe",
  [switch]$SkipPortfolioManager,
  [switch]$DailyScreenOnly
)

$ErrorActionPreference = "Stop"

$metaRoot = Split-Path -Parent $PSScriptRoot
$financeRoot = Split-Path -Parent $metaRoot
$portfolioRoot = Join-Path $financeRoot "portfolio_manager"
$artifactRoot = Join-Path $metaRoot "artifacts\dashboard\latest"
$redactScript = Join-Path $PSScriptRoot "redact_dashboard_artifact.py"
$appName = if ($env:BLS_PRIME_APP_NAME) { $env:BLS_PRIME_APP_NAME } elseif ($env:NEXT_PUBLIC_BLS_APP_NAME) { $env:NEXT_PUBLIC_BLS_APP_NAME } else { "Allocator Workspace" }

if (!(Test-Path $PythonExe)) {
  throw "Python executable not found at $PythonExe"
}

if (!(Test-Path $portfolioRoot)) {
  throw "Portfolio manager repo not found at $portfolioRoot"
}

function Write-Step($message) {
  Write-Host ""
  Write-Host "==> $message" -ForegroundColor Cyan
}

function Show-Stamp($path) {
  if (Test-Path $path) {
    $item = Get-Item $path
    Write-Host ("{0}  {1}" -f $item.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss"), $item.FullName)
  } else {
    Write-Host "missing  $path" -ForegroundColor Yellow
  }
}

if (-not $SkipPortfolioManager) {
  Write-Step "Refreshing portfolio_manager outputs"
  Push-Location $portfolioRoot
  try {
    if ($DailyScreenOnly) {
      & $PythonExe -m portfolio_manager.cli --config .\config\defaults.yaml --daily-screen-only
    } else {
      & $PythonExe -m portfolio_manager.cli --config .\config\defaults.yaml
    }
  } finally {
    Pop-Location
  }
}

if ($DailyScreenOnly) {
  Write-Step "Daily screen only mode selected"
  Write-Host "This updates portfolio_manager daily screen files, but it does NOT rebuild the full $appName snapshot."
  Write-Host "Run again without -DailyScreenOnly to refresh discovery_screener.csv and the full terminal-facing stack."
  Show-Stamp (Join-Path $portfolioRoot "output\daily_screen\daily_screener.csv")
  exit 0
}

Write-Step "Refreshing meta_alpha_allocator dashboard snapshot"
$env:PYTHONPATH = (Resolve-Path (Join-Path $metaRoot "src"))
Push-Location $metaRoot
try {
  & $PythonExe -m meta_alpha_allocator.cli dashboard refresh | Out-Null
} finally {
  Pop-Location
}

Write-Step "Updated files"
Show-Stamp (Join-Path $portfolioRoot "output\latest\discovery_screener.csv")
Show-Stamp (Join-Path $portfolioRoot "output\latest\screener.csv")
Show-Stamp (Join-Path $metaRoot "output\production\latest\current_allocator_decision.json")
Show-Stamp (Join-Path $metaRoot "output\dashboard\latest\dashboard_snapshot.json")

Write-Step "Publishing deployable artifact"
New-Item -ItemType Directory -Force $artifactRoot | Out-Null
& $PythonExe $redactScript (Join-Path $metaRoot "output\dashboard\latest") $artifactRoot | Out-Null
Show-Stamp (Join-Path $artifactRoot "dashboard_snapshot.json")

Write-Host ""
Write-Host "Local $appName refresh complete and artifact published." -ForegroundColor Green
