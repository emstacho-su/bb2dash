<#
.SYNOPSIS
  Update now (2026-09-30): wait for bb2dash to exit, point `current` at a newer build,
  and start the app again.

.DESCRIPTION
  The app spawns this, detached and hidden, when Stack presses "Update now", and then
  quits. It runs from the installed copy under %LOCALAPPDATA%\bb2dash-launch\launch.

    1. Wait up to -TimeoutSeconds for every bb2dash process to exit (Windows locks a
       running exe's files, which is why the builder never swaps while the app runs).
    2. Repoint the `current` junction at builds\<Tree>\win-unpacked -- the same junction
       logic logon-build.ps1 uses -- restoring the old target if that fails.
    3. Start the Bb2dash-App task (Start-Process on current\bb2dash.exe when the task is
       not registered).

  If anything fails, the old build stays current and the app is started on it. Every
  step is logged to logs\update-now.log. The logic is Invoke-UpdateSwap in
  Bb2dashLaunch.psm1, pinned by Bb2dashLaunch.Tests.ps1.

.EXAMPLE
  powershell -NoProfile -File update-now.ps1 -Tree 31215cf503f565cd7113d01b14266e4b2ce1000d
#>
[CmdletBinding(PositionalBinding = $false)]
param(
    [Parameter(Mandatory)] [string] $Tree,
    [string] $StateDir = (Join-Path $env:LOCALAPPDATA 'bb2dash-launch'),
    [string] $AppTaskName = 'Bb2dash-App',
    [int] $TimeoutSeconds = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$APP_PROCESS_NAME = 'bb2dash'
$LOG_ROLL_BYTES = 512KB
$EXIT_OK = 0
$EXIT_FAILED = 5

$LogDir = Join-Path $StateDir 'logs'
$LogFile = Join-Path $LogDir 'update-now.log'

function Write-UpdateLog {
    param([string] $Level, [string] $Message)
    $line = '{0} [{1}] {2}' -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $Level, $Message
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
    if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt $LOG_ROLL_BYTES) {
        Move-Item -Force $LogFile "$LogFile.1"
    }
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Verbose $line
}

$testAppRunning = { $null -ne (Get-Process -Name $APP_PROCESS_NAME -ErrorAction SilentlyContinue) }
$startApp = {
    param($exe)
    if (Get-ScheduledTask -TaskName $AppTaskName -ErrorAction SilentlyContinue) {
        Start-ScheduledTask -TaskName $AppTaskName
    } else {
        $exe = Join-Path (Join-Path $StateDir 'current') 'bb2dash.exe'
        Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) | Out-Null
    }
}
$log = { param($level, $message) Write-UpdateLog $level $message }

try {
    Import-Module (Join-Path $PSScriptRoot 'Bb2dashLaunch.psm1') -Force

    $result = Invoke-UpdateSwap -StateDir $StateDir -Tree $Tree -TimeoutSeconds $TimeoutSeconds `
        -TestAppRunning $testAppRunning -StartApp $startApp -Log $log

    Write-UpdateLog 'INFO' "update-now done (swapped=$($result.Swapped), launched=$($result.Launched))"
    if ($result.Launched) { exit $EXIT_OK } else { exit $EXIT_FAILED }
} catch {
    $failure = $_.Exception.Message
    # Last resort: wait for the app to exit (Task Scheduler drops a start while it still
    # runs), then start whatever `current` points at, so a failed update never leaves Stack
    # with no app. Logging here is best effort: it may be the very thing that failed.
    try { Write-UpdateLog 'ERROR' "update-now failed: $failure" } catch { [Console]::Error.WriteLine("update-now failed: $failure") }
    if (Get-Command Invoke-UpdateFallback -ErrorAction SilentlyContinue) {
        $null = Invoke-UpdateFallback -TimeoutSeconds $TimeoutSeconds -TestAppRunning $testAppRunning `
            -StartApp { & $startApp '' } -Log $log
    } else {
        # The module itself did not load: the same wait and start, inline.
        $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
        while ((& $testAppRunning) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
        try { & $startApp '' } catch { [Console]::Error.WriteLine("could not start the app: $($_.Exception.Message)") }
    }
    exit $EXIT_FAILED
}
