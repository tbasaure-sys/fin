param(
  [string]$TaskName = "BLS Prime Live Snapshot Refresh",
  [string]$StartTime = "07:45",
  [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$RefreshScript = Join-Path $RepoRoot "scripts\refresh-live-snapshots.ps1"
if (-not (Test-Path -LiteralPath $RefreshScript)) {
  throw "Refresh script not found: $RefreshScript"
}

$argument = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $RefreshScript
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::Parse($StartTime))
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Runs Macro Brain and MOSAIC, publishes public JSON snapshots, commits and pushes them to GitHub." `
  -Force | Out-Null

Get-ScheduledTask -TaskName $TaskName | Select-Object TaskName, State
