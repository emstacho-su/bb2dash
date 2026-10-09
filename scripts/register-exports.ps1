<#
.SYNOPSIS
  Register the Windows scheduled task Bb2dash-Exports: the notes-only run of the Inbox decisions exporter.

.DESCRIPTION
  Same shape as desktop/launch/register-logon-task.ps1: every path explicit and verified before
  anything is registered, idempotent through `Register-ScheduledTask -Force`.

  The task runs, from the bb2dash checkout this script sits in:

      node scripts/exports-run.mjs --secrets-dir <SecretsDir> --harness-dir <HarnessDir>

  started through a hidden powershell.exe (-WindowStyle Hidden -Command "& node ...; exit
  $LASTEXITCODE"), as register-logon-task.ps1 starts its build: node.exe started directly would open
  a console window on the desktop at every run, and the task's -Hidden setting does not prevent it.
  The command ends with the runner's exit code, so the task's last result is still that code.

  which files the private vault notes of archived Inbox decisions and marks each row (the day files
  and their pull request stay a manual step). Two triggers: at logon plus 5 minutes, and every 6
  hours. Hidden, below-normal priority, a 15-minute limit, started when a missed time comes round,
  allowed on battery, never two at once. It runs as you, -LogonType Interactive.

  Both folders are required and neither has a default; no default finds the harness on this laptop.
  The script checks that each folder exists, and that the harness one holds hooks/resolve-config.mjs,
  BEFORE it registers anything (a path holding a double quote or a backtick is refused). When a check fails it prints one line, exits non-zero and registers
  nothing. It opens no file in the secrets folder (the exporter reads the service key at run time)
  and it does not read .env.

.PARAMETER SecretsDir
  The secrets folder that holds bb2dash_mcp_service_key (outside every repository).

.PARAMETER HarnessDir
  The agentic-harness checkout; its hooks/resolve-config.mjs names the vault.

.PARAMETER TaskName
  Default Bb2dash-Exports.

.EXAMPLE
  .\register-exports.ps1 -SecretsDir C:/Users/<you>/.bb2dash-secrets -HarnessDir C:/Users/<you>/agentic-harness
#>
[CmdletBinding(PositionalBinding = $false)]
param(
    [string] $SecretsDir = '',
    [string] $HarnessDir = '',
    [string] $TaskName = 'Bb2dash-Exports'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PRIORITY_BELOW_NORMAL = 7
$LOGON_DELAY = 'PT5M'
$REPEAT_HOURS = 6
$TIME_LIMIT_MINUTES = 15
$FIRST_REPEAT_IN_MINUTES = 10
$RUNNER = 'scripts/exports-run.mjs'
$RESOLVER = 'hooks/resolve-config.mjs'

function Fail {
    param([string] $Message, [string] $Fix)
    [Console]::Error.WriteLine("$Message`n  Fix: $Fix")
    exit 2
}

# A folder, as a full path without a trailing slash (a trailing backslash would escape the closing quote).
function Resolve-Folder {
    param([string] $Value, [string] $ParamName)
    if ([string]::IsNullOrWhiteSpace($Value)) {
        Fail "-$ParamName is required and has no default." "Pass -$ParamName with a C:/... folder."
    }
    if ($Value.Contains('"') -or $Value.Contains('`')) {
        Fail "-$ParamName holds a double quote or a backtick." 'Pass a folder whose path holds neither.'
    }
    if (-not (Test-Path -LiteralPath $Value -PathType Container)) {
        Fail "-$ParamName '$Value' is not an existing folder." "Create it, or pass the real $ParamName."
    }
    return (Resolve-Path -LiteralPath $Value).ProviderPath.TrimEnd('\', '/')
}

# ---------------------------------------------------------------- validation (nothing is registered yet)

$secrets = Resolve-Folder $SecretsDir 'SecretsDir'
$harness = Resolve-Folder $HarnessDir 'HarnessDir'

if (-not (Test-Path -LiteralPath (Join-Path $harness $RESOLVER) -PathType Leaf)) {
    Fail "$RESOLVER was not found under $harness." 'Pass -HarnessDir with the agentic-harness checkout.'
}

$repoDir = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).ProviderPath.TrimEnd('\', '/')
if (-not (Test-Path -LiteralPath (Join-Path $repoDir $RUNNER) -PathType Leaf)) {
    Fail "$RUNNER was not found under $repoDir." 'Run this script from the bb2dash checkout (the one that holds scripts/exports-run.mjs).'
}

$node = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $node) {
    Fail 'node.exe was not found on PATH.' 'Install Node 22 or later, then run this again.'
}
if ($node.Source.Contains('"') -or $node.Source.Contains('`')) {
    Fail 'The path of node.exe holds a double quote or a backtick.' 'Install Node under a path that holds neither.'
}

$powershell = Join-Path $env:SystemRoot 'System32WindowsPowerShell1.0powershell.exe'
if (-not (Test-Path -LiteralPath $powershell -PathType Leaf)) {
    Fail "powershell.exe was not found at $powershell." 'This script targets Windows PowerShell 5.1.'
}

# ---------------------------------------------------------------- the task

# A task that starts node.exe directly opens a console window on the desktop (an Interactive logon),
# and the task's -Hidden setting only hides the task in the list. So, as register-logon-task.ps1 does,
# the action is a hidden powershell.exe that starts node and ends with the runner's own exit code,
# which is then the task's last result. Every value goes in as a single-quoted PowerShell string
# (a quote inside it is doubled), so a path with a space or an apostrophe survives; a double quote
# or a backtick was refused above, because the whole command sits inside double quotes.
function ConvertTo-SingleQuoted {
    param([string] $Value)
    return "'" + $Value.Replace("'", "''") + "'"
}

$nodeCommand = ('& {0} {1} --secrets-dir {2} --harness-dir {3}; exit $LASTEXITCODE' -f
    (ConvertTo-SingleQuoted $node.Source), (ConvertTo-SingleQuoted $RUNNER),
    (ConvertTo-SingleQuoted $secrets), (ConvertTo-SingleQuoted $harness))
$arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"$nodeCommand`""
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $repoDir

$user = "$env:USERDOMAIN\$env:USERNAME"
$atLogon = New-ScheduledTaskTrigger -AtLogOn -User $user
$atLogon.Delay = $LOGON_DELAY
# No -RepetitionDuration: on Windows 10 and later the repetition then has no end.
$everySixHours = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes($FIRST_REPEAT_IN_MINUTES) `
    -RepetitionInterval (New-TimeSpan -Hours $REPEAT_HOURS)

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes $TIME_LIMIT_MINUTES) `
    -Priority $PRIORITY_BELOW_NORMAL -Hidden

$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger @($atLogon, $everySixHours) `
    -Settings $settings `
    -Principal $principal `
    -Description 'bb2dash: files the vault notes of archived Inbox decisions (notes only; no git, no gh, no docker). State: ~/.bb2dash-exports/state.json.' `
    -Force | Out-Null

Write-Output "Registered '$TaskName': at logon + 5 min and every $REPEAT_HOURS h, below-normal priority, $TIME_LIMIT_MINUTES min limit."
Write-Output "  powershell.exe (hidden) runs: $nodeCommand"
Write-Output "  from $repoDir"
Write-Output ''
Write-Output 'Verify with:'
Write-Output "  (Get-ScheduledTask -TaskName $TaskName).Triggers.Count   # 2"
Write-Output "  Get-ScheduledTaskInfo -TaskName $TaskName"
Write-Output "  Get-Content `"$env:USERPROFILE\.bb2dash-exports\state.json`""
