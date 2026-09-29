<#
.SYNOPSIS
  The pure half of the logon launcher: decide what to do, read and write the
  small state record, name the build command. No file, process or network
  access in here -- logon-build.ps1 owns the side effects, this module owns the
  logic, and Bb2dashLaunch.Tests.ps1 pins the logic.

.DESCRIPTION
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
  Turn what logon-build.ps1 observed into an ordered list of actions.

.OUTPUTS
  [pscustomobject] Actions (string[] drawn from Activate, Launch, Build,
  Compose, Skip), Reason (why), Warning ('' or one line).

.NOTES
  The order is the point: the app is launched from whatever build is already
  active before any container runs, so a changed repo never delays the
  window. Only the very first run, with no build at all, builds first.
  Activate = repoint the `current` junction at a finished build; it is only
  ever offered when the app is not running, because the running exe's files
  are locked.
#>
function Get-LaunchDecision {
    [CmdletBinding()]
    param(
        [AllowEmptyString()][string] $RemoteSha,
        [AllowEmptyString()][string] $LastBuiltSha,
        [bool] $BuildExists,
        [bool] $NextBuildExists,
        [bool] $AppRunning,
        [bool] $DockerReady,
        [bool] $ComposeFileExists
    )
    Assert-Sha -Name 'RemoteSha' -Value $RemoteSha
    Assert-Sha -Name 'LastBuiltSha' -Value $LastBuiltSha

    if (-not ($BuildExists -or $NextBuildExists)) {
        return Get-FirstRunDecision -DockerReady $DockerReady
    }

    $actions = @()
    $reasons = @()

    if ($AppRunning) {
        $reasons += 'app already running: no activate (exe is locked) and no relaunch'
    } else {
        if ($NextBuildExists) { $actions += 'Activate'; $reasons += 'a finished build is waiting' }
        $actions += 'Launch'
    }

    $build = Get-BuildVerdict -RemoteSha $RemoteSha -LastBuiltSha $LastBuiltSha -DockerReady $DockerReady
    if ($build.Build) { $actions += 'Build' }
    $reasons += $build.Reason

    if ($ComposeFileExists -and $DockerReady) { $actions += 'Compose'; $reasons += 'compose.yaml present' }

    return [pscustomobject]@{
        Actions = [string[]] $actions
        Reason  = ($reasons -join '; ')
        Warning = $build.Warning
    }
}

function Get-FirstRunDecision {
    param([bool] $DockerReady)
    if (-not $DockerReady) {
        return [pscustomobject]@{
            Actions = [string[]] @('Skip')
            Reason  = 'no build exists yet and Docker is not ready, so nothing can be built or launched'
            Warning = 'Docker engine unreachable; start Docker Desktop and run again'
        }
    }
    return [pscustomobject]@{
        Actions = [string[]] @('Build', 'Launch')
        Reason  = 'first run: no build exists, building before launch'
        Warning = ''
    }
}

function Get-BuildVerdict {
    param([AllowEmptyString()][string] $RemoteSha, [AllowEmptyString()][string] $LastBuiltSha, [bool] $DockerReady)
    if ($RemoteSha -eq '') {
        return @{ Build = $false; Reason = 'remote unknown'; Warning = 'git fetch did not yield a tree hash; skipping the build check this time' }
    }
    if ($RemoteSha -eq $LastBuiltSha) {
        return @{ Build = $false; Reason = 'desktop/ unchanged since the last build'; Warning = '' }
    }
    if (-not $DockerReady) {
        return @{ Build = $false; Reason = 'rebuild deferred'; Warning = 'desktop/ changed but the Docker engine is not ready; the rebuild waits for the next logon' }
    }
    return @{ Build = $true; Reason = 'desktop/ changed: rebuilding after launch'; Warning = '' }
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
  container a killed script left behind before starting its own.
#>
function Get-BuildCommand {
    [CmdletBinding()]
    param([Parameter(Mandatory)] [string] $ComposeFile)
    return [pscustomobject]@{
        Executable    = 'docker'
        ContainerName = 'bb2dash-build'
        Arguments     = [string[]] @('compose', '-f', $ComposeFile, 'run', '--rm', '--name', 'bb2dash-build', 'build')
    }
}

Export-ModuleMember -Function Get-LaunchDecision, ConvertTo-LaunchState, New-LaunchState, ConvertTo-LaunchStateJson, Get-BuildCommand
