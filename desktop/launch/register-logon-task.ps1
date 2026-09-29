<#
.SYNOPSIS
  Register (or remove) the two Task Scheduler entries behind the logon build.

.DESCRIPTION
  Same shape as agentic-harness/scripts/register-*.ps1: every path explicit
  and verified before anything is registered, idempotent through
  `Register-ScheduledTask -Force`, `-Unregister` to take both out again.

  Two tasks, on purpose:

  * Bb2dash-LogonBuild -- logon trigger with a delay (default 2 min), hidden,
    priority 7 (below normal), 60 min limit. Runs logon-build.ps1: git fetch,
    launch, and the container rebuild when desktop/ changed.
  * Bb2dash-App -- no trigger. Runs current\bb2dash.exe at normal priority
    with no time limit. logon-build.ps1 starts it with Start-ScheduledTask so
    the app is not a child of the build task: it would otherwise inherit the
    low priority and be killed when the build task hits its time limit.

  Both run as you, -LogonType Interactive, so the window lands on your desktop
  and Windows delivers the toasts. Battery settings are set explicitly; the
  defaults would silently never run a laptop task on battery.

.PARAMETER RepoDir
  Your bb2dash checkout. Default C:/Users/<you>/projects/bb2dash.

.PARAMETER BuildRef
  What logon-build.ps1 builds. Default origin/main.

.PARAMETER DelayMinutes
  Minutes after logon before the build task fires. Default 2.

.PARAMETER Unregister
  Remove both tasks and exit.

.EXAMPLE
  .\register-logon-task.ps1
  .\register-logon-task.ps1 -DelayMinutes 5
  .\register-logon-task.ps1 -Unregister
#>
[CmdletBinding(PositionalBinding = $false)]
param(
    [string] $TaskName = 'Bb2dash-LogonBuild',
    [string] $AppTaskName = 'Bb2dash-App',
    [string] $RepoDir = "C:/Users/$env:USERNAME/projects/bb2dash",
    [string] $StateDir = (Join-Path $env:LOCALAPPDATA 'bb2dash-launch'),
    # What logon-build.ps1 builds. Default origin/main; a branch ref while that branch is unmerged.
    [string] $BuildRef = 'origin/main',
    [int] $DelayMinutes = 2,
    [int] $DockerWaitSeconds = 600,
    [switch] $Unregister
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PRIORITY_BELOW_NORMAL = 7
$PRIORITY_NORMAL = 4
$NO_TIME_LIMIT = 'PT0S'

function Fail {
    param([string] $Message, [string] $Fix)
    [Console]::Error.WriteLine("$Message`n  Fix: $Fix")
    exit 2
}

function Remove-TaskIfPresent {
    param([string] $Name)
    if (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $Name -Confirm:$false
        Write-Output "Removed scheduled task '$Name'."
    } else {
        Write-Output "No scheduled task named '$Name'."
    }
}

if ($Unregister) {
    Remove-TaskIfPresent $TaskName
    Remove-TaskIfPresent $AppTaskName
    exit 0
}

# ---------------------------------------------------------------- validation

$script = Join-Path $RepoDir 'desktop/launch/logon-build.ps1'
if (-not (Test-Path $script)) {
    Fail "logon-build.ps1 was not found at $script." 'Pass -RepoDir with the bb2dash checkout, as a C:/... path.'
}
$script = (Resolve-Path $script).Path

if (-not (Test-Path (Join-Path $RepoDir '.git'))) {
    Fail "$RepoDir is not a git checkout." 'Clone https://github.com/emstacho-su/bb2dash there first.'
}
if ($DelayMinutes -lt 0 -or $DelayMinutes -gt 60) {
    Fail "-DelayMinutes $DelayMinutes is out of range." 'Use 0-60.'
}

$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path $powershell)) {
    Fail "powershell.exe was not found at $powershell." 'This script targets Windows PowerShell 5.1.'
}

$currentDir = Join-Path $StateDir 'current'
$appExe = Join-Path $currentDir 'bb2dash.exe'
if (-not (Test-Path $appExe)) {
    Fail "No built app at $appExe." "Run logon-build.ps1 -NoLaunch once first; it builds and points 'current' at the result."
}

$user = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

# ---------------------------------------------------------------- Bb2dash-App

$appSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -Priority $PRIORITY_NORMAL -Hidden
$appSettings.ExecutionTimeLimit = $NO_TIME_LIMIT

Register-ScheduledTask `
    -TaskName $AppTaskName `
    -Action (New-ScheduledTaskAction -Execute $appExe -WorkingDirectory $currentDir) `
    -Settings $appSettings `
    -Principal $principal `
    -Description 'bb2dash desktop shell. Started by Bb2dash-LogonBuild so the app runs at normal priority, outside the build task.' `
    -Force | Out-Null
Write-Output "Registered '$AppTaskName' -> $appExe (no trigger, no time limit)."

# ---------------------------------------------------------------- Bb2dash-LogonBuild

$arguments = @(
    '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
    '-File', "`"$script`"",
    '-RepoDir', "`"$RepoDir`"",
    '-StateDir', "`"$StateDir`"",
    '-BuildRef', $BuildRef,
    '-AppTaskName', $AppTaskName,
    '-DockerWaitSeconds', "$DockerWaitSeconds"
) -join ' '

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$trigger.Delay = 'PT{0}M' -f $DelayMinutes

$buildSettings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 60) `
    -Priority $PRIORITY_BELOW_NORMAL -Hidden

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action (New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory (Split-Path -Parent $script)) `
    -Trigger $trigger `
    -Settings $buildSettings `
    -Principal $principal `
    -Description "bb2dash: fetch, launch the desktop shell, rebuild it in an ephemeral container when desktop/ changed. Runs $DelayMinutes min after logon. Log: $StateDir\logs\logon-build.log" `
    -Force | Out-Null
Write-Output "Registered '$TaskName': $DelayMinutes min after logon, below-normal priority, interactive session."

Write-Output ''
Write-Output 'Verify with:'
Write-Output "  Get-ScheduledTaskInfo -TaskName $TaskName"
Write-Output "  Start-ScheduledTask -TaskName $TaskName   # run it now"
Write-Output "  Get-Content `"$StateDir\logs\logon-build.log`" -Tail 20"
