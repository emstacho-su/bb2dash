<#
.SYNOPSIS
  The pure half of the logon launcher: decide what to do, read and write the
  small state record, name the build command. No file, process or network
  access in here -- logon-build.ps1 owns the side effects, this module owns the
  logic, and Bb2dashLaunch.Tests.ps1 pins the logic. One exception, at the end:
  the Update now helper (2026-09-30), whose junction swap is tested against a
  real junction and whose process and task calls are injected scriptblocks.

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

# ---------------------------------------------------------------- Update now (2026-09-30)
#
# The app's "Update now" button spawns update-now.ps1, detached, and quits. That script
# calls Invoke-UpdateSwap below. These are the module's only functions with side effects:
# Set-CurrentBuild touches the `current` junction (and nothing else), and Invoke-UpdateSwap
# reaches the process table and Task Scheduler only through the scriptblocks it is handed,
# so Bb2dashLaunch.Tests.ps1 drives both against a junction under TestDrive.

$script:UpdateExeName = 'bb2dash.exe'
# The same name logon-build.ps1 uses ($BUILD_MUTEX_NAME); keep the two in step.
$script:BuildMutexName = 'Local\Bb2dashLaunchBuild'
# <StateDir>\swap-pending holds the tree a running Update now is switching to.
$script:PendingSwapFile = 'swap-pending'

<#
.SYNOPSIS
  What Update now may do once it has waited for the app: Swap (repoint current at the
  new build) and Launch, or Launch alone -- the old build stays current -- with the reason.
#>
function Get-UpdateSwapDecision {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [AllowEmptyString()][string] $Tree,
        [AllowEmptyString()][string] $ActiveTree = '',
        [bool] $BuildExists,
        [bool] $AppExited
    )
    if ($Tree -notmatch $script:ShaPattern) { throw "Tree must be 40 hex characters; got '$Tree'." }
    Assert-Sha -Name 'ActiveTree' -Value $ActiveTree

    if (-not $AppExited) {
        return [pscustomobject]@{ Actions = [string[]] @('Launch'); Reason = 'the app did not exit in time: the old build stays current' }
    }
    if (-not $BuildExists) {
        return [pscustomobject]@{ Actions = [string[]] @('Launch'); Reason = "build $Tree is not on disk: the old build stays current" }
    }
    if ($Tree -eq $ActiveTree) {
        return [pscustomobject]@{ Actions = [string[]] @('Launch'); Reason = "build $Tree is already current" }
    }
    return [pscustomobject]@{ Actions = [string[]] @('Swap', 'Launch'); Reason = "switching current to build $Tree" }
}

function Get-JunctionTarget {
    param([string] $Path)
    if (-not (Test-Path $Path)) { return '' }
    $item = Get-Item $Path -Force
    if (-not $item.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { return '' }
    return [string] ($item.Target | Select-Object -First 1)
}

<#
.SYNOPSIS
  Repoint the `current` junction at -Target, the same way logon-build.ps1's
  Invoke-Activate does, and put the previous target back if the new junction cannot be
  created. Never deletes a build folder: only the junction itself is removed.

.OUTPUTS
  [pscustomobject] Ok, Previous, Reason.
#>
function Set-CurrentBuild {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $CurrentLink,
        [Parameter(Mandatory)] [string] $Target
    )
    $previous = Get-JunctionTarget $CurrentLink
    if (-not (Test-Path (Join-Path $Target $script:UpdateExeName))) {
        return [pscustomobject]@{ Ok = $false; Previous = $previous; Reason = "no $($script:UpdateExeName) under $Target" }
    }
    try {
        if (Test-Path $CurrentLink) { [IO.Directory]::Delete($CurrentLink) }   # the junction only, never its target
        New-Item -ItemType Junction -Path $CurrentLink -Target $Target | Out-Null
        return [pscustomobject]@{ Ok = $true; Previous = $previous; Reason = "current -> $Target" }
    } catch {
        $why = $_.Exception.Message
        if ($previous -ne '' -and -not (Test-Path $CurrentLink)) {
            try { New-Item -ItemType Junction -Path $CurrentLink -Target $previous | Out-Null } catch { $why += "; restoring $previous also failed: $($_.Exception.Message)" }
        }
        return [pscustomobject]@{ Ok = $false; Previous = $previous; Reason = "could not repoint current: $why" }
    }
}

<#
.SYNOPSIS
  Update now: wait for the app to exit, repoint `current` at build -Tree, start the app.
  On any failure the old build stays current and the app is started on it; every step
  is logged through -Log.

.OUTPUTS
  [pscustomobject] Swapped, Launched, Reason.
#>
function Invoke-UpdateSwap {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $StateDir,
        [Parameter(Mandatory)] [AllowEmptyString()][string] $Tree,
        [Parameter(Mandatory)] [scriptblock] $TestAppRunning,
        [Parameter(Mandatory)] [scriptblock] $StartApp,
        [Parameter(Mandatory)] [scriptblock] $Log,
        [int] $TimeoutSeconds = 60,
        [int] $PollMilliseconds = 500,
        # The builder's own mutex (logon-build.ps1 $BUILD_MUTEX_NAME): while the swap holds
        # it, no build can finish, repoint `current` or prune the build being switched to.
        [string] $MutexName = $script:BuildMutexName,
        [int] $LockWaitSeconds = 120
    )
    if ($Tree -notmatch $script:ShaPattern) { throw "Tree must be 40 hex characters; got '$Tree'." }

    # Named before anything waits, so a build that finishes meanwhile keeps this build
    # (Get-BuildsToKeep). Removed when the swap is over, whatever happened.
    $marker = Join-Path $StateDir $script:PendingSwapFile
    $swap = [pscustomobject]@{ Swapped = $false; Reason = '' }
    $mutex = $null
    $locked = $false
    try {
        [IO.File]::WriteAllText($marker, $Tree, (New-Object Text.UTF8Encoding $false))
        $mutex = New-Object System.Threading.Mutex($false, $MutexName)
        $locked = Wait-BuildMutex -Mutex $mutex -Seconds $LockWaitSeconds -Log $Log
        if ($locked) {
            $swap = Invoke-SwapStep -StateDir $StateDir -Tree $Tree -TestAppRunning $TestAppRunning `
                -Log $Log -TimeoutSeconds $TimeoutSeconds -PollMilliseconds $PollMilliseconds
        } else {
            $swap.Reason = "the builder was still running after ${LockWaitSeconds}s: the old build stays current"
            & $Log 'WARN' $swap.Reason
        }
    } finally {
        if ($locked) { $mutex.ReleaseMutex() }
        if ($null -ne $mutex) { $mutex.Dispose() }
        Remove-Item -Force $marker -ErrorAction SilentlyContinue
    }

    $launched = $false
    $exe = Join-Path (Join-Path $StateDir 'current') $script:UpdateExeName
    try {
        & $StartApp $exe
        $launched = $true
        & $Log 'INFO' "app started on $(if ($swap.Swapped) { "build $Tree" } else { 'the old build' })"
    } catch {
        & $Log 'ERROR' "the app could not be started: $($_.Exception.Message)"
    }
    return [pscustomobject]@{ Swapped = $swap.Swapped; Launched = $launched; Reason = $swap.Reason }
}

<# Take the builder's mutex, waiting up to -Seconds for a running build. True when held. #>
function Wait-BuildMutex {
    param([System.Threading.Mutex] $Mutex, [int] $Seconds, [scriptblock] $Log)
    try {
        if ($Mutex.WaitOne(0)) { return $true }
        & $Log 'INFO' "the builder is running; waiting up to ${Seconds}s for it before switching builds"
        return $Mutex.WaitOne($Seconds * 1000)
    } catch [System.Threading.AbandonedMutexException] {
        # A builder that was killed mid-run: the mutex is ours now.
        & $Log 'WARN' 'the builder mutex was abandoned by a killed run; taking it'
        return $true
    }
}

<#
  Under the builder's mutex: wait for the app to exit, re-evaluate what is on disk and
  current now (a build may have finished while the swap waited), and repoint `current`.
#>
function Invoke-SwapStep {
    param(
        [string] $StateDir, [string] $Tree, [scriptblock] $TestAppRunning, [scriptblock] $Log,
        [int] $TimeoutSeconds, [int] $PollMilliseconds
    )
    $currentLink = Join-Path $StateDir 'current'
    $target = Join-Path (Join-Path (Join-Path $StateDir 'builds') $Tree) 'win-unpacked'
    & $Log 'INFO' "update to $Tree requested; waiting up to ${TimeoutSeconds}s for the app to exit"

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $exited = $false
    while ($true) {
        if (-not (& $TestAppRunning)) { $exited = $true; break }
        if ((Get-Date) -ge $deadline) { break }
        Start-Sleep -Milliseconds $PollMilliseconds
    }

    $activeTarget = Get-JunctionTarget $currentLink
    $activeTree = ''
    if ($activeTarget -ne '') {
        $leaf = Split-Path -Leaf (Split-Path -Parent $activeTarget)
        if ($leaf -match $script:ShaPattern) { $activeTree = $leaf }
    }
    $decision = Get-UpdateSwapDecision -Tree $Tree -ActiveTree $activeTree `
        -BuildExists (Test-Path (Join-Path $target $script:UpdateExeName)) -AppExited $exited
    $level = if ($decision.Actions -contains 'Swap') { 'INFO' } else { 'WARN' }
    & $Log $level "update decision: [$($decision.Actions -join ', ')] because $($decision.Reason)"

    $swapped = $false
    if ($decision.Actions -contains 'Swap') {
        $set = Set-CurrentBuild -CurrentLink $currentLink -Target $target
        if ($set.Ok) {
            $swapped = $true
            & $Log 'INFO' $set.Reason
        } else {
            & $Log 'ERROR' "$($set.Reason); the old build stays current"
        }
    }
    return [pscustomobject]@{ Swapped = $swapped; Reason = $decision.Reason }
}

<# The tree a pending Update now is switching to, from its marker; '' when none or malformed. #>
function Read-PendingSwapTree {
    [CmdletBinding()]
    param([Parameter(Mandatory)] [string] $StateDir)
    $marker = Join-Path $StateDir $script:PendingSwapFile
    if (-not (Test-Path $marker)) { return '' }
    $text = ([string] (Get-Content -Raw -Path $marker -ErrorAction SilentlyContinue)).Trim()
    if ($text -match $script:ShaPattern) { return $text }
    return ''
}

<#
.SYNOPSIS
  The build folders pruning must keep: the one just built, the active one, and the one a
  pending Update now is switching to. Empty and malformed entries are dropped.
#>
function Get-BuildsToKeep {
    [CmdletBinding()]
    param(
        [AllowEmptyString()][string] $NewTree = '',
        [AllowEmptyString()][string] $ActiveTree = '',
        [AllowEmptyString()][string] $PendingSwapTree = ''
    )
    return [string[]] @(@($NewTree, $ActiveTree, $PendingSwapTree) |
        Where-Object { $_ -match $script:ShaPattern } | Select-Object -Unique)
}

Export-ModuleMember -Function Get-StartupDecision, Get-BuildDecision, Test-DockerNeeded, ConvertTo-LaunchState, New-LaunchState, ConvertTo-LaunchStateJson, Get-BuildCommand, Get-UpdateSwapDecision, Set-CurrentBuild, Invoke-UpdateSwap, Read-PendingSwapTree, Get-BuildsToKeep
