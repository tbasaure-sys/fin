param(
  [string]$TaskName = "BLS Prime Artifact Refresh",
  [string]$RepoRoot = "/home/t14_ultra_7_tomas/code/fin",
  [switch]$PushArtifacts,
  [switch]$SkipPortfolioManager
)

$ErrorActionPreference = "Stop"

$refreshArgs = "cd $RepoRoot && ./scripts/refresh_blsprime_local.sh"
if ($PushArtifacts) {
  $refreshArgs += " --push"
}
if ($SkipPortfolioManager) {
  $refreshArgs += " --skip-portfolio-manager"
}

$taskCommand = "wsl.exe bash -lc `"$refreshArgs`""

Write-Host ""
Write-Host "Installing scheduled task '$TaskName'" -ForegroundColor Cyan
Write-Host $taskCommand

schtasks.exe /Create /F /SC MINUTE /MO 5 /TN $TaskName /TR $taskCommand | Out-Null

Write-Host "Task installed. It will run every 5 minutes while Windows is on." -ForegroundColor Green
