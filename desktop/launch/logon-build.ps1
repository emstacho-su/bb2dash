<#
.SYNOPSIS
  What runs at logon: launch the desktop shell from the build that is already
  active, and only then -- only if desktop/ changed on the build ref -- rebuild
  it in an ephemeral container for the next logon.

.DESCRIPTION
  Order matters and is the whole design:

    1. git fetch in the main checkout; read the tree hash of desktop/ at
       -BuildRef (origin/main). Nothing is pulled or checked out in the
       checkout you work in: the Sync terminal runs there.
    2. Decide (Bb2dashLaunch.psm1, pure, tested).
    3. If a finished build is waiting and the app is not running, repoint the
       `current` junction at it (Activate).
    4. Launch: start the Bb2dash-App scheduled task, which runs
       current\bb2dash.exe at normal priority with no time limit, outside this
       task's process tree. Falls back to Start-Process when the task is not
       registered (a manual run). This step never waits on Docker.
    5. Build, if desktop/ changed and the Docker engine answers (waiting up to
       -DockerWaitSeconds for Docker Desktop's own autostart): check out the
       build ref in the detached build worktree, `docker compose run --rm` the
       build service (compose.build.yaml), land the result in
       builds\<tree>\win-unpacked, record the tree hash. Activate now if the
       app has been quit, otherwise at the next logon.
    6. If the repo root has a compose.yaml (Phase 14), `docker compose up -d`.
       Today there is none, so this is a no-op that costs a Test-Path.

  First run only (no build anywhere): build in the foreground, then launch.

  Layout under -StateDir (%LOCALAPPDATA%\bb2dash-launch):
    builds\<tree>\win-unpacked\bb2dash.exe   one folder per built desktop/ tree
    current                                  junction -> the active win-unpacked
    state.json                               lastBuiltSha, lastBuildAt, lastResult
    logs\logon-build.log                     one line per step, rolls at 512 KB

  Every step logs; failures set a non-zero exit code and are never swallowed.
  register-logon-task.ps1 writes the two Task Scheduler entries.

.PARAMETER RepoDir
  Your bb2dash checkout (fetched, never pulled). Default C:/Users/<you>/projects/bb2dash.

.PARAMETER BuildRef
  What gets built. Default origin/main.

.PARAMETER BuildWorktree
  A detached `git worktree` of RepoDir that only the build touches. Created on
  first use. Default <RepoDir>-build.

.PARAMETER DockerWaitSeconds
  How long the build half may wait for the Docker engine. The launch half
  never waits. Default 600.

.PARAMETER NoLaunch
  Do everything except start the app (for rehearsals and the first setup).

.EXAMPLE
  powershell -NoProfile -File desktop/launch/logon-build.ps1
  powershell -NoProfile -File desktop/launch/logon-build.ps1 -NoLaunch -Verbose
#>
[CmdletBinding(PositionalBinding = $false)]
param(
    [string] $RepoDir = "C:/Users/$env:USERNAME/projects/bb2dash",
    [string] $BuildRef = 'origin/main',
    [string] $BuildWorktree = '',
    [string] $StateDir = (Join-Path $env:LOCALAPPDATA 'bb2dash-launch'),
    [string] $AppTaskName = 'Bb2dash-App',
    [int] $DockerWaitSeconds = 600,
    [switch] $NoLaunch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'Bb2dashLaunch.psm1') -Force

# ---------------------------------------------------------------- constants

$EXIT_OK = 0
$EXIT_VALIDATION = 2
$EXIT_BUILD_FAILED = 3
$EXIT_LAUNCH_FAILED = 4
$LOG_ROLL_BYTES = 512KB
$DOCKER_POLL_SECONDS = 10
$KEEP_BUILDS = 2
$APP_PROCESS_NAME = 'bb2dash'
$BUILD_MUTEX_NAME = 'Local\Bb2dashLaunchBuild'
$EXE_NAME = 'bb2dash.exe'

if ($BuildWorktree -eq '') { $BuildWorktree = "$($RepoDir.TrimEnd('/', '\'))-build" }

$ComposeBuildFile = Join-Path $PSScriptRoot 'compose.build.yaml'
$StackComposeFile = Join-Path $RepoDir 'compose.yaml'
$BuildsRoot = Join-Path $StateDir 'builds'
$CurrentLink = Join-Path $StateDir 'current'
$StateFile = Join-Path $StateDir 'state.json'
$LogDir = Join-Path $StateDir 'logs'
$LogFile = Join-Path $LogDir 'logon-build.log'

# ---------------------------------------------------------------- logging

function Write-Log {
    param([string] $Level, [string] $Message)
    $line = '{0} [{1}] {2}' -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $Level, $Message
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
    if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt $LOG_ROLL_BYTES) {
        Move-Item -Force $LogFile "$LogFile.1"
    }
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
    Write-Verbose $line
    if ($Level -eq 'ERROR') { [Console]::Error.WriteLine($line) }
}

function Fail {
    param([string] $Message, [int] $Code)
    Write-Log 'ERROR' $Message
    exit $Code
}

# ---------------------------------------------------------------- tools

function Resolve-Tool {
    param([string] $Name, [string[]] $Candidates)
    foreach ($c in $Candidates) { if (Test-Path $c) { return $c } }
    $onPath = Get-Command $Name -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    Fail "$Name was not found. A scheduled task does not see PATH edits made in a shell." $EXIT_VALIDATION
}

$Git = Resolve-Tool 'git' @('C:/Program Files/Git/cmd/git.exe')
$Docker = Resolve-Tool 'docker' @('C:/Program Files/Docker/Docker/resources/bin/docker.exe')
$env:GIT_TERMINAL_PROMPT = '0'

function Invoke-Tool {
    # Runs a native tool; returns @{ ExitCode; Output } and never throws on a
    # non-zero exit. The caller decides what a failure means.
    param([string] $Exe, [string[]] $Arguments)
    $output = & $Exe @Arguments 2>&1 | ForEach-Object { "$_" }
    return @{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
}

function Invoke-Git {
    param([string] $Dir, [string[]] $Arguments)
    return Invoke-Tool $Git (@('-C', $Dir) + $Arguments)
}

# ---------------------------------------------------------------- observations

function Test-DockerReady {
    param([int] $TimeoutSeconds)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $r = Invoke-Tool $Docker @('version', '--format', '{{.Server.Version}}')
        if ($r.ExitCode -eq 0 -and $r.Output.Trim() -ne '') { return $true }
        if ((Get-Date) -ge $deadline) { return $false }
        Start-Sleep -Seconds $DOCKER_POLL_SECONDS
    } while ($true)
}

function Test-AppRunning {
    return $null -ne (Get-Process -Name $APP_PROCESS_NAME -ErrorAction SilentlyContinue)
}

function Get-DesktopTreeHash {
    # The tree hash of desktop/ at the build ref, or '' when the fetch failed.
    $fetch = Invoke-Git $RepoDir @('fetch', '--quiet', 'origin')
    if ($fetch.ExitCode -ne 0) {
        Write-Log 'WARN' "git fetch failed (offline?): $($fetch.Output)"
        return ''
    }
    $tree = Invoke-Git $RepoDir @('rev-parse', '--verify', '--quiet', "${BuildRef}:desktop")
    if ($tree.ExitCode -ne 0) {
        Write-Log 'WARN' "cannot resolve ${BuildRef}:desktop: $($tree.Output)"
        return ''
    }
    return $tree.Output.Trim()
}

function Get-ActiveTree {
    # The tree hash the `current` junction points at, or '' when there is none.
    if (-not (Test-Path $CurrentLink)) { return '' }
    $item = Get-Item $CurrentLink -Force
    if (-not $item.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { return '' }
    $target = [string] ($item.Target | Select-Object -First 1)
    if (-not (Test-Path (Join-Path $target $EXE_NAME))) { return '' }
    return (Split-Path -Leaf (Split-Path -Parent $target))
}

function Get-BuildExe {
    param([string] $Tree)
    return Join-Path (Join-Path (Join-Path $BuildsRoot $Tree) 'win-unpacked') $EXE_NAME
}

function Read-State {
    if (-not (Test-Path $StateFile)) { return ConvertTo-LaunchState -Json '' }
    $state = ConvertTo-LaunchState -Json (Get-Content -Raw -Path $StateFile)
    if ($state.Invalid) { Write-Log 'WARN' 'state.json was unreadable; treating as no previous build' }
    return $state
}

function Write-State {
    param([pscustomobject] $State)
    if (-not (Test-Path $StateDir)) { New-Item -ItemType Directory -Force -Path $StateDir | Out-Null }
    $tmp = "$StateFile.tmp"
    Set-Content -Path $tmp -Value (ConvertTo-LaunchStateJson -State $State) -Encoding UTF8 -NoNewline
    Move-Item -Force $tmp $StateFile
}

# ---------------------------------------------------------------- actions

function Invoke-Activate {
    param([string] $Tree)
    if (Test-AppRunning) {
        Write-Log 'INFO' "app is running; build $Tree becomes current at the next logon"
        return
    }
    $target = Split-Path -Parent (Get-BuildExe $Tree)
    try {
        if (Test-Path $CurrentLink) { [IO.Directory]::Delete($CurrentLink) }   # removes the junction only, never its target
        New-Item -ItemType Junction -Path $CurrentLink -Target $target | Out-Null
        Write-Log 'INFO' "current -> $target"
    } catch {
        Write-Log 'WARN' "could not repoint current: $($_.Exception.Message)"
    }
}

function Remove-OldBuilds {
    param([string[]] $Keep)
    if (-not (Test-Path $BuildsRoot)) { return }
    foreach ($dir in Get-ChildItem -Directory $BuildsRoot) {
        if ($Keep -contains $dir.Name) { continue }
        try {
            Remove-Item -Recurse -Force $dir.FullName
            Write-Log 'INFO' "pruned old build $($dir.Name)"
        } catch {
            Write-Log 'WARN' "could not prune $($dir.Name): $($_.Exception.Message)"
        }
    }
}

function Invoke-Launch {
    if ($NoLaunch) { Write-Log 'INFO' '-NoLaunch: not starting the app'; return }
    $exe = Join-Path $CurrentLink $EXE_NAME
    if (-not (Test-Path $exe)) { Fail "no executable at $exe" $EXIT_LAUNCH_FAILED }
    try {
        if (Get-ScheduledTask -TaskName $AppTaskName -ErrorAction SilentlyContinue) {
            Start-ScheduledTask -TaskName $AppTaskName
            Write-Log 'INFO' "launched via task $AppTaskName"
        } else {
            Start-Process -FilePath $exe -WorkingDirectory $CurrentLink | Out-Null
            Write-Log 'INFO' "launched $exe directly (task $AppTaskName not registered)"
        }
    } catch {
        Fail "launch failed: $($_.Exception.Message)" $EXIT_LAUNCH_FAILED
    }
}

function Update-BuildWorktree {
    # Returns $true when the worktree sits at the build ref.
    if (-not (Test-Path (Join-Path $BuildWorktree '.git'))) {
        $add = Invoke-Git $RepoDir @('worktree', 'add', '--detach', $BuildWorktree, $BuildRef)
        if ($add.ExitCode -ne 0) { Write-Log 'ERROR' "git worktree add failed: $($add.Output)"; return $false }
        Write-Log 'INFO' "created build worktree $BuildWorktree"
        return $true
    }
    $co = Invoke-Git $BuildWorktree @('checkout', '--detach', '--quiet', $BuildRef)
    if ($co.ExitCode -ne 0) { Write-Log 'ERROR' "git checkout $BuildRef in the build worktree failed: $($co.Output)"; return $false }
    return $true
}

function Invoke-ContainerBuild {
    # The ephemeral build for one desktop/ tree. Returns $true on success.
    param([string] $Tree)
    $out = Join-Path $BuildsRoot $Tree
    if (Test-Path $out) { Remove-Item -Recurse -Force $out }   # a partial earlier attempt
    New-Item -ItemType Directory -Force -Path $out | Out-Null

    $cmd = Get-BuildCommand -ComposeFile $ComposeBuildFile
    Invoke-Tool $Docker @('rm', '-f', $cmd.ContainerName) | Out-Null   # a container a killed run left behind
    $env:BB2DASH_BUILD_SRC = (Join-Path $BuildWorktree 'desktop') -replace '\\', '/'
    $env:BB2DASH_BUILD_OUT = $out -replace '\\', '/'

    Write-Log 'INFO' "build start for tree $Tree from $env:BB2DASH_BUILD_SRC"
    $started = Get-Date
    $r = Invoke-Tool $cmd.Executable $cmd.Arguments
    $seconds = [int] ((Get-Date) - $started).TotalSeconds
    if ($r.ExitCode -ne 0 -or -not (Test-Path (Get-BuildExe $Tree))) {
        $tail = ($r.Output -split "`n" | Select-Object -Last 20) -join "`n"
        Write-Log 'ERROR' "build failed after ${seconds}s (exit $($r.ExitCode)). Last lines:`n$tail"
        return $false
    }
    Write-Log 'INFO' "build ok in ${seconds}s -> $out"
    return $true
}

function Invoke-Build {
    # Worktree + container + state, under a mutex so two runs never build at once.
    param([string] $Tree)
    $mutex = New-Object System.Threading.Mutex($false, $BUILD_MUTEX_NAME)
    if (-not $mutex.WaitOne(0)) {
        Write-Log 'INFO' 'another build is already running; not starting a second'
        return $false
    }
    try {
        if (-not (Update-BuildWorktree)) { return $false }
        $previous = Read-State
        $ok = Invoke-ContainerBuild -Tree $Tree
        $result = if ($ok) { 'ok' } else { 'failed' }
        $recorded = if ($ok) { $Tree } else { $previous.LastBuiltSha }
        Write-State (New-LaunchState -Previous $previous -LastBuiltSha $recorded -LastResult $result -Now (Get-Date))
        if ($ok) {
            Invoke-Activate -Tree $Tree
            Remove-OldBuilds -Keep @($Tree, (Get-ActiveTree))
        }
        return $ok
    } finally {
        $mutex.ReleaseMutex()
        $mutex.Dispose()
    }
}

function Invoke-StackCompose {
    $r = Invoke-Tool $Docker @('compose', '-f', $StackComposeFile, 'up', '-d', '--wait')
    if ($r.ExitCode -ne 0) { Write-Log 'ERROR' "compose up failed: $($r.Output)"; return $false }
    Write-Log 'INFO' 'compose stack up'
    return $true
}

function Invoke-Actions {
    param([pscustomobject] $Decision, [string] $Tree, [string] $WaitingTree)
    Write-Log 'INFO' "decision: [$($Decision.Actions -join ', ')] because $($Decision.Reason)"
    if ($Decision.Warning) { Write-Log 'WARN' $Decision.Warning }
    $ok = $true
    foreach ($action in $Decision.Actions) {
        switch ($action) {
            'Activate' { Invoke-Activate -Tree $WaitingTree }
            'Launch'   { Invoke-Launch }
            'Build'    { if (-not (Invoke-Build -Tree $Tree)) { $ok = $false } }
            'Compose'  { if (-not (Invoke-StackCompose)) { $ok = $false } }
            'Skip'     { }
        }
    }
    return $ok
}

# ---------------------------------------------------------------- main

if (-not (Test-Path (Join-Path $RepoDir '.git'))) { Fail "not a git checkout: $RepoDir" $EXIT_VALIDATION }
if (-not (Test-Path $ComposeBuildFile)) { Fail "missing $ComposeBuildFile" $EXIT_VALIDATION }

Write-Log 'INFO' "logon-build start (repo $RepoDir, ref $BuildRef)"
$tree = Get-DesktopTreeHash
$state = Read-State
$activeTree = Get-ActiveTree
$buildExists = $activeTree -ne ''
$nextExists = ($state.LastBuiltSha -ne '') -and ($state.LastBuiltSha -ne $activeTree) -and (Test-Path (Get-BuildExe $state.LastBuiltSha))
$composeExists = Test-Path $StackComposeFile

# The launch half gets one quick look at Docker; only a first run waits for it.
$dockerReady = if ($buildExists -or $nextExists) { Test-DockerReady -TimeoutSeconds 0 } else { Test-DockerReady -TimeoutSeconds $DockerWaitSeconds }

$decision = Get-LaunchDecision -RemoteSha $tree -LastBuiltSha $state.LastBuiltSha `
    -BuildExists $buildExists -NextBuildExists $nextExists -AppRunning (Test-AppRunning) `
    -DockerReady $dockerReady -ComposeFileExists $composeExists
$ok = Invoke-Actions -Decision $decision -Tree $tree -WaitingTree $state.LastBuiltSha

# Second look: the app is up. If Docker was still starting and there is build
# or compose work to do, wait for it now and do only that work.
$workPending = ($tree -ne '' -and $tree -ne $state.LastBuiltSha) -or $composeExists
if (-not $dockerReady -and $workPending -and ($decision.Actions -notcontains 'Skip')) {
    if (Test-DockerReady -TimeoutSeconds $DockerWaitSeconds) {
        $later = Get-LaunchDecision -RemoteSha $tree -LastBuiltSha $state.LastBuiltSha `
            -BuildExists $true -NextBuildExists $false -AppRunning $true `
            -DockerReady $true -ComposeFileExists $composeExists
        if (-not (Invoke-Actions -Decision $later -Tree $tree -WaitingTree '')) { $ok = $false }
    } else {
        Write-Log 'WARN' "Docker did not come up within ${DockerWaitSeconds}s; build/compose wait for the next logon"
    }
}

Write-Log 'INFO' "logon-build done (ok=$ok)"
if ($ok) { exit $EXIT_OK } else { exit $EXIT_BUILD_FAILED }
