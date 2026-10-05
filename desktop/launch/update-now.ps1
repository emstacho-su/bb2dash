<#
.SYNOPSIS
  Update now (2026-09-30): wait for bb2dash to exit, point `current` at a newer build,
  and start the app again.

.DESCRIPTION
  The app runs this when Stack presses "Update now", in two stages (2026-10-04):

    Stage 1, -Detach: the app runs it as a plain hidden child and waits for it to exit.
       It does not swap. It starts a second run of itself, without -Detach, through
       Start-Process (Invoke-HelperHandoff), logs that run's pid and exits 0, or 6 when
       the start failed. The app cannot start the helper detached itself: Windows
       PowerShell 5.1 with no console exits 0 without running its script. And a plain
       child of the app dies with the app, while a process Start-Process launches from
       that child does not.
    Stage 2, the helper itself: it writes the swap-pending marker, which the app waits
       for before it quits, and then:

    1. Wait up to -TimeoutSeconds for every bb2dash process to exit (Windows locks a
       running exe's files, which is why the builder never swaps while the app runs).
    2. Repoint the `current` junction at builds\<Tree>\win-unpacked -- the same junction
       logic logon-build.ps1 uses -- restoring the old target if that fails.
    3. Start the Bb2dash-App task (Start-Process on current\bb2dash.exe when the task is
       not registered).

  It runs from the installed copy under %LOCALAPPDATA%\bb2dash-launch\launch. If anything
  fails, the old build stays current; if the app never exited, nothing is started,
  otherwise the app is started on the old build. A live helper for another build (a
  fresh swap-pending naming it) makes this one refuse and exit 5 without touching
  anything. Every step of both stages is logged to logs\update-now.log. The logic is Invoke-UpdateSwap and
  Invoke-HelperHandoff in Bb2dashLaunch.psm1, pinned by Bb2dashLaunch.Tests.ps1.

.EXAMPLE
  powershell -NoProfile -File update-now.ps1 -Tree 31215cf503f565cd7113d01b14266e4b2ce1000d -Detach
#>
[CmdletBinding(PositionalBinding = $false)]
param(
    [Parameter(Mandatory)] [string] $Tree,
    [string] $StateDir = (Join-Path $env:LOCALAPPDATA 'bb2dash-launch'),
    [string] $AppTaskName = 'Bb2dash-App',
    [int] $TimeoutSeconds = 60,
    [switch] $Detach
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$APP_PROCESS_NAME = 'bb2dash'
$LOG_ROLL_BYTES = 512KB
$EXIT_OK = 0
$EXIT_FAILED = 5
$EXIT_HANDOFF_FAILED = 6

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

$log = { param($level, $message) Write-UpdateLog $level $message }

if ($Detach) {
    # Stage 1: hand off and exit. No fallback here: the app is still running, and when this
    # exits non-zero it stays on its build and says the helper could not start.
    try {
        Import-Module (Join-Path $PSScriptRoot 'Bb2dashLaunch.psm1') -Force
        # PS 5.1 joins -ArgumentList with spaces and never quotes; the list arrives quoted.
        # -WindowStyle Hidden here is what hides the helper's window (the list carries none).
        $startProcess = {
            param($filePath, $argumentList, $workingDirectory)
            Start-Process -FilePath $filePath -ArgumentList ($argumentList -join ' ') -WindowStyle Hidden `
                -WorkingDirectory $workingDirectory -PassThru
        }
        $handoff = Invoke-HelperHandoff -PowerShellPath (Get-Process -Id $PID).Path -ScriptPath $PSCommandPath `
            -Tree $Tree -StateDir $StateDir -AppTaskName $AppTaskName -TimeoutSeconds $TimeoutSeconds `
            -StartProcess $startProcess -Log $log
        if ($handoff.Ok) { exit $EXIT_OK } else { exit $EXIT_HANDOFF_FAILED }
    } catch {
        $failure = $_.Exception.Message
        try { Write-UpdateLog 'ERROR' "update-now hand-off failed: $failure" } catch { [Console]::Error.WriteLine("update-now hand-off failed: $failure") }
        exit $EXIT_HANDOFF_FAILED
    }
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
        # The module itself did not load: the same wait and start, inline (nothing while the app runs).
        $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
        while ((& $testAppRunning) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
        if (& $testAppRunning) {
            [Console]::Error.WriteLine("the app is still running after ${TimeoutSeconds}s; nothing started")
        } else {
            try { & $startApp '' } catch { [Console]::Error.WriteLine("could not start the app: $($_.Exception.Message)") }
        }
    }
    exit $EXIT_FAILED
}
