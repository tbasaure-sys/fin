param(
  [string]$TaskName = $(if ($env:BLS_PRIME_TASK_NAME) { $env:BLS_PRIME_TASK_NAME } elseif ($env:BLS_PRIME_APP_NAME) { "$($env:BLS_PRIME_APP_NAME) Artifact Refresh" } elseif ($env:NEXT_PUBLIC_BLS_APP_NAME) { "$($env:NEXT_PUBLIC_BLS_APP_NAME) Artifact Refresh" } else { "Allocator Workspace Artifact Refresh" }),
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
