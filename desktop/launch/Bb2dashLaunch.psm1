<#
.SYNOPSIS
  The pure half of the logon launcher: decide what to do, read and write the
  small state record, name the build command. No file, process or network
  access in here -- logon-build.ps1 owns the side effects, this module owns the
  logic, and Bb2dashLaunch.Tests.ps1 pins the logic.

.DESCRIPTION
  Two decisions, in the order the script runs them:

    Get-StartupDecision  what to do before any network or Docker call: point
                         `current` at a finished build (Activate) and start the
                         app (Launch), or report that nothing is built yet
                         (FirstRun), or that the app is already up (nothing).
    Get-BuildDecision    after the fetch: rebuild (Build) when the desktop/
                         tree hash moved and Docker answers; bring the Phase 14
                         stack up (Compose) when a compose.yaml exists.

  Every function returns a new object and mutates nothing it was handed.
  Inputs are validated at the boundary (a hash is 40 hex characters or empty;
  a state file that does not parse is an empty state, flagged, never a crash).

  "Sha" throughout is the git tree hash of desktop/ at the build ref
  (`git rev-parse origin/main:desktop`), not a commit: a commit that only
  touches web/ must not trigger a rebuild of the shell.
#>
Set-StrictMode -Version Latest

$script:ShaPattern = '^[0-9a-f]{40}$'

function Test-Sha {
    param([AllowEmptyString()][string] $Value)
    return ($Value -eq '') -or ($Value -match $script:ShaPattern)
}

function Assert-Sha {
    param([string] $Name, [AllowEmptyString()][string] $Value)
    if (-not (Test-Sha $Value)) {
        throw "$Name must be 40 hex characters or empty; got '$Value'."
    }
}

<#
.SYNOPSIS
  What to do at once, before the network is touched.

.OUTPUTS
  [pscustomobject] Actions (string[] from Activate, Launch, FirstRun), Reason.

.NOTES
  Activate = repoint the `current` junction at a finished build. It is only
  ever offered while the app is not running: Windows locks a running exe's
  files. FirstRun means nothing is built anywhere; the script must build in
  the foreground and launch afterwards.
#>
function Get-StartupDecision {
    [CmdletBinding()]
    param(
        [bool] $BuildExists,
        [bool] $NextBuildExists,
        [bool] $AppRunning
    )
    if (-not ($BuildExists -or $NextBuildExists)) {
        return [pscustomobject]@{ Actions = [string[]] @('FirstRun'); Reason = 'no build exists yet' }
    }
    if ($AppRunning) {
        return [pscustomobject]@{ Actions = [string[]] @(); Reason = 'app already running: no activate (exe is locked) and no relaunch' }
    }
    $actions = @()
    $reasons = @()
    if ($NextBuildExists) { $actions += 'Activate'; $reasons += 'a finished build is waiting' }
    $actions += 'Launch'
    $reasons += 'launching the current build'
    return [pscustomobject]@{ Actions = [string[]] $actions; Reason = ($reasons -join '; ') }
}

<#
.SYNOPSIS
  Whether to rebuild and whether to bring a compose stack up, once the fetch
  has answered.

.OUTPUTS
  [pscustomobject] Actions (string[] from Build, Compose), Reason, Warning.
#>
function Get-BuildDecision {
    [CmdletBinding()]
    param(
        [AllowEmptyString()][string] $RemoteSha,
        [AllowEmptyString()][string] $LastBuiltSha,
        [bool] $DockerReady,
        [bool] $ComposeFileExists
    )
    Assert-Sha -Name 'RemoteSha' -Value $RemoteSha
    Assert-Sha -Name 'LastBuiltSha' -Value $LastBuiltSha

    $actions = @()
    $warning = ''
    if ($RemoteSha -eq '') {
        $reason = 'desktop/ tree hash unknown'
        $warning = 'the build ref could not be resolved; skipping the build check this time'
    } elseif ($RemoteSha -eq $LastBuiltSha) {
        $reason = 'desktop/ unchanged since the last build'
    } elseif (-not $DockerReady) {
        $reason = 'rebuild deferred'
        $warning = 'desktop/ changed but the Docker engine is not ready; the rebuild waits for the next logon'
    } else {
        $actions += 'Build'
        $reason = 'desktop/ changed: rebuilding'
    }

    if ($ComposeFileExists -and $DockerReady) { $actions += 'Compose'; $reason += '; compose.yaml present' }

    return [pscustomobject]@{ Actions = [string[]] $actions; Reason = $reason; Warning = $warning }
}

<#
.SYNOPSIS
  Whether the build step has any reason to wait for Docker at all: a rebuild
  is wanted, or a compose stack exists. Kept here, next to Get-BuildDecision,
  so the script never re-derives "is a rebuild wanted" on its own.
#>
function Test-DockerNeeded {
    [CmdletBinding()]
    param(
        [AllowEmptyString()][string] $RemoteSha,
        [AllowEmptyString()][string] $LastBuiltSha,
        [bool] $ComposeFileExists
    )
    Assert-Sha -Name 'RemoteSha' -Value $RemoteSha
    Assert-Sha -Name 'LastBuiltSha' -Value $LastBuiltSha
    $rebuild = ($RemoteSha -ne '') -and ($RemoteSha -ne $LastBuiltSha)
    return [bool] ($rebuild -or $ComposeFileExists)
}

function New-EmptyLaunchState {
    param([bool] $Invalid = $false)
    return [pscustomobject]@{
        LastBuiltSha = ''
        LastBuildAt  = ''
        LastResult   = ''
        Invalid      = $Invalid
    }
}

<#
.SYNOPSIS
  Parse state.json. Anything that is not exactly the expected shape becomes an
  empty state with Invalid = $true, so a torn write costs one extra build, not
  a crash at logon.
#>
function ConvertTo-LaunchState {
    [CmdletBinding()]
    param([AllowEmptyString()][AllowNull()][string] $Json)

    if ($null -eq $Json -or $Json.Trim() -eq '') { return New-EmptyLaunchState }

    try {
        $raw = $Json | ConvertFrom-Json -ErrorAction Stop
    } catch {
        return New-EmptyLaunchState -Invalid $true
    }
    if ($null -eq $raw -or $raw -isnot [pscustomobject]) { return New-EmptyLaunchState -Invalid $true }

    $sha = ''
    if ($raw.PSObject.Properties['lastBuiltSha']) { $sha = [string] $raw.lastBuiltSha }
    if (-not (Test-Sha $sha)) { return New-EmptyLaunchState -Invalid $true }

    $at = ''
    if ($raw.PSObject.Properties['lastBuildAt']) { $at = [string] $raw.lastBuildAt }
    $result = ''
    if ($raw.PSObject.Properties['lastResult']) { $result = [string] $raw.lastResult }

    return [pscustomobject]@{
        LastBuiltSha = $sha
        LastBuildAt  = $at
        LastResult   = $result
        Invalid      = $false
    }
}

<# Return a new state record; $Previous is not touched. #>
function New-LaunchState {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [pscustomobject] $Previous,
        [Parameter(Mandatory)] [AllowEmptyString()][string] $LastBuiltSha,
        [Parameter(Mandatory)] [string] $LastResult,
        [Parameter(Mandatory)] [datetime] $Now
    )
    Assert-Sha -Name 'LastBuiltSha' -Value $LastBuiltSha
    return [pscustomobject]@{
        LastBuiltSha = $LastBuiltSha
        LastBuildAt  = $Now.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")
        LastResult   = $LastResult
        Invalid      = $false
    }
}

function ConvertTo-LaunchStateJson {
    [CmdletBinding()]
    param([Parameter(Mandatory)] [pscustomobject] $State)
    return ([ordered]@{
        lastBuiltSha = $State.LastBuiltSha
        lastBuildAt  = $State.LastBuildAt
        lastResult   = $State.LastResult
    } | ConvertTo-Json -Compress)
}

<#
.SYNOPSIS
  The ephemeral build: `docker compose run --rm --name bb2dash-build build`.
  `run --rm` creates a container for this one command and removes it on exit;
  only the named volumes survive. The fixed name lets a later run remove a
  container a killed script left behind before starting its own. Arguments
  only: the script supplies the docker.exe it resolved, because a scheduled
  task's PATH may not carry docker.
#>
function Get-BuildCommand {
    [CmdletBinding()]
    param([Parameter(Mandatory)] [string] $ComposeFile)
    return [pscustomobject]@{
        ContainerName = 'bb2dash-build'
        Arguments     = [string[]] @('compose', '-f', $ComposeFile, 'run', '--rm', '--name', 'bb2dash-build', 'build')
    }
}

Export-ModuleMember -Function Get-StartupDecision, Get-BuildDecision, Test-DockerNeeded, ConvertTo-LaunchState, New-LaunchState, ConvertTo-LaunchStateJson, Get-BuildCommand
