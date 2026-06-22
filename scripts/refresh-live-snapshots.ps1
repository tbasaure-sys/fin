param(
  [string]$FinModelRoot = "",
  [string]$RepoRoot = "",
  [string]$PythonExe = "",
  [int]$MacroTimeoutSeconds = 900,
  [int]$MosaicLiveTimeoutSeconds = 420,
  [int]$MosaicOfflineTimeoutSeconds = 240,
  [switch]$SkipGit,
  [switch]$LocalOnly
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

if (-not $FinModelRoot) {
  $FinModelRoot = (Resolve-Path (Join-Path $RepoRoot "..\02_Finance\Fin_model")).Path
}

if (-not $PythonExe) {
  $PythonExe = if ($env:PYTHON) { $env:PYTHON } else { "python" }
}

$LocalDir = Join-Path $RepoRoot "_local_data"
$LogPath = Join-Path $LocalDir "live-snapshot-refresh.log"
$LockPath = Join-Path $LocalDir "live-snapshot-refresh.lock"
New-Item -ItemType Directory -Force -Path $LocalDir | Out-Null

function Write-Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -LiteralPath $LogPath -Value $line -Encoding utf8
  Write-Host $line
}

function Invoke-Checked {
  param(
    [string]$WorkingDirectory,
    [string]$FilePath,
    [string[]]$Arguments,
    [int]$TimeoutSeconds = 900
  )
  Write-Log ("RUN {0} {1}" -f $FilePath, ($Arguments -join " "))
  $stdoutPath = Join-Path $LocalDir ("stdout-{0}.log" -f ([guid]::NewGuid().ToString("N")))
  $stderrPath = Join-Path $LocalDir ("stderr-{0}.log" -f ([guid]::NewGuid().ToString("N")))
  try {
    $process = Start-Process `
      -FilePath $FilePath `
      -ArgumentList $Arguments `
      -WorkingDirectory $WorkingDirectory `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath `
      -PassThru `
      -WindowStyle Hidden

    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      if ($env:OS -eq "Windows_NT") {
        & taskkill.exe /PID $process.Id /T /F | Out-Null
      } else {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      }
      throw "Command timed out after $TimeoutSeconds seconds"
    }
    $process.WaitForExit()
    $process.Refresh()

    foreach ($line in (Get-Content -LiteralPath $stdoutPath -ErrorAction SilentlyContinue)) {
      Write-Log ([string]$line)
    }
    foreach ($line in (Get-Content -LiteralPath $stderrPath -ErrorAction SilentlyContinue)) {
      Write-Log ([string]$line)
    }

    $exitCode = $process.ExitCode
    if ($null -eq $exitCode) {
      $exitCode = 0
    }
    if ($exitCode -ne 0) {
      throw "Command failed with exit code $exitCode"
    }
  } finally {
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Get-ChangedSnapshotFiles {
  Push-Location $RepoRoot
  try {
    $status = git status --porcelain -- public/data/macro_brain_latest.json public/data/mosaic_embed.json
    return @($status | Where-Object { $_ })
  } finally {
    Pop-Location
  }
}

$lockStream = $null
try {
  $lockStream = [System.IO.File]::Open($LockPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  $lockBytes = [System.Text.Encoding]::UTF8.GetBytes("pid=$PID started=$(Get-Date -Format o)")
  $lockStream.Write($lockBytes, 0, $lockBytes.Length)

  Write-Log "Starting BLS Prime live snapshot refresh."
  Write-Log "RepoRoot: $RepoRoot"
  Write-Log "FinModelRoot: $FinModelRoot"

  $macroArgs = @("code_scripts\macro_brain_v2.py", "--refresh", "--json")
  if ($LocalOnly) {
    $macroArgs += "--local-only"
  }
  Invoke-Checked -WorkingDirectory $FinModelRoot -FilePath $PythonExe -Arguments $macroArgs -TimeoutSeconds $MacroTimeoutSeconds

  $mosaicArgs = @("code_scripts\build_mosaic_observatory.py", "--live-fred", "--prefer-cache")
  try {
    Invoke-Checked -WorkingDirectory $FinModelRoot -FilePath $PythonExe -Arguments $mosaicArgs -TimeoutSeconds $MosaicLiveTimeoutSeconds
  } catch {
    Write-Log ("MOSAIC live refresh failed; trying cache-only fallback. Cause: {0}" -f $_.Exception.Message)
    $mosaicFallbackArgs = @("code_scripts\build_mosaic_observatory.py", "--live-fred", "--prefer-cache", "--offline")
    Invoke-Checked -WorkingDirectory $FinModelRoot -FilePath $PythonExe -Arguments $mosaicFallbackArgs -TimeoutSeconds $MosaicOfflineTimeoutSeconds
  }

  $npmExe = if ($env:OS -eq "Windows_NT") { "npm.cmd" } else { "npm" }
  Invoke-Checked -WorkingDirectory $RepoRoot -FilePath $npmExe -Arguments @("run", "snapshots:sync") -TimeoutSeconds 120

  $macroPublic = Get-Content -LiteralPath (Join-Path $RepoRoot "public\data\macro_brain_latest.json") -Raw | ConvertFrom-Json
  $mosaicPublic = Get-Content -LiteralPath (Join-Path $RepoRoot "public\data\mosaic_embed.json") -Raw | ConvertFrom-Json
  Write-Log ("Validated public Macro Brain JSON: run_date={0}, observations={1}, series={2}" -f $macroPublic.run_date, $macroPublic.observations, $macroPublic.series_count)
  Write-Log ("Validated public MOSAIC JSON: generated_at={0}, index={1}, markets={2}" -f $mosaicPublic.generated_at, $mosaicPublic.global_disequilibrium_index, @($mosaicPublic.markets).Count)

  $changes = Get-ChangedSnapshotFiles
  if ($changes.Count -eq 0) {
    Write-Log "No public snapshot changes to commit."
    exit 0
  }

  if ($SkipGit) {
    Write-Log "Snapshot files changed, but -SkipGit was provided. Leaving changes in the working tree."
    exit 0
  }

  Push-Location $RepoRoot
  try {
    git add -- public/data/macro_brain_latest.json public/data/mosaic_embed.json
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    git commit -m "Refresh live snapshots $stamp"
    git push origin main
  } finally {
    Pop-Location
  }

  Write-Log "Finished BLS Prime live snapshot refresh."
} catch {
  Write-Log ("ERROR: {0}" -f $_.Exception.Message)
  exit 1
} finally {
  if ($lockStream) {
    $lockStream.Dispose()
  }
  Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
}
