<#
.SYNOPSIS
  Register the Windows scheduled task Bb2dash-Exports: the notes-only run of the Inbox decisions exporter.

.DESCRIPTION
  Same shape as desktop/launch/register-logon-task.ps1: every path explicit and verified before
  anything is registered, idempotent through `Register-ScheduledTask -Force`.

  The task runs, from the bb2dash checkout this script sits in:

      node scripts/exports-run.mjs --secrets-dir <SecretsDir> --harness-dir <HarnessDir>

  which files the private vault notes of archived Inbox decisions and marks each row (the day files
  and their pull request stay a manual step). Two triggers: at logon plus 5 minutes, and every 6
  hours. Hidden, below-normal priority, a 15-minute limit, started when a missed time comes round,
  allowed on battery, never two at once. It runs as you, -LogonType Interactive.

  Both folders are required and neither has a default; no default finds the harness on this laptop.
  The script checks that each folder exists, and that the harness one holds hooks/resolve-config.mjs,
  BEFORE it registers anything. When a check fails it prints one line, exits non-zero and registers
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
    if ($Value.Contains('"')) {
        Fail "-$ParamName holds a double quote." 'Pass the folder without quotes inside the path.'
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

# ---------------------------------------------------------------- the task

$arguments = "$RUNNER --secrets-dir `"$secrets`" --harness-dir `"$harness`""
$action = New-ScheduledTaskAction -Execute $node.Source -Argument $arguments -WorkingDirectory $repoDir

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
Write-Output "  node $arguments"
Write-Output "  from $repoDir"
Write-Output ''
Write-Output 'Verify with:'
Write-Output "  (Get-ScheduledTask -TaskName $TaskName).Triggers.Count   # 2"
Write-Output "  Get-ScheduledTaskInfo -TaskName $TaskName"
Write-Output "  Get-Content `"$env:USERPROFILE\.bb2dash-exports\state.json`""
