<#
.SYNOPSIS
  What runs at logon: launch the desktop shell from the build that is already
  active, and only then -- only if desktop/ changed on the build ref -- rebuild
  it in an ephemeral container for the next logon.

.DESCRIPTION
  Order matters and is the whole design:

    1. Startup, with no network call and no Docker call: if a finished build
       is waiting and the app is not running, repoint the `current` junction
       at it (Activate); then Launch. Launch starts the Bb2dash-App scheduled
       task, which runs current\bb2dash.exe at normal priority with no time
       limit, outside this task's process tree; it falls back to
       Start-Process when that task is not registered (a manual run).
    2. git fetch in the main checkout, capped at -FetchTimeoutSeconds, then
       read the tree hash of desktop/ at -BuildRef (origin/main). Nothing is
       pulled or checked out in the checkout you work in: the Sync terminal
       runs there. Offline, the ref as last fetched is used.
    3. Build, if that hash differs from the build that is active or last
       recorded, and the Docker engine answers (waiting up to
       -DockerWaitSeconds for Docker Desktop's own autostart): check the ref
       out in the detached build worktree, `docker compose run --rm` the build
       service (compose.build.yaml), land the result in
       builds\<tree>\win-unpacked, record the hash, refresh the installed copy
       of these scripts. Activate now if the app has been quit, otherwise at
       the next logon.
    4. If the repo root has a compose.yaml (Phase 14), `docker compose up -d`.
       Today there is none, so this is a no-op that costs a Test-Path.

  First run only (nothing built anywhere): steps 2 and 3 run first, in the
  foreground, then the app is launched.

  Layout under -StateDir (%LOCALAPPDATA%\bb2dash-launch):
    launch\                                  the installed copy of these scripts (the task runs this)
    builds\<tree>\win-unpacked\bb2dash.exe   one folder per built desktop/ tree
    current                                  junction -> the active win-unpacked
    state.json                               lastBuiltSha, lastBuildAt, lastResult
    last-check.json                          checkedAt, remoteTree, skip: what the last run could check
    logs\logon-build.log                     one line per step, rolls at 512 KB

  Every step logs; failures set a non-zero exit code and are never swallowed.
  register-logon-task.ps1 installs the copy and writes the two Task Scheduler
  entries.

.PARAMETER RepoDir
  Your bb2dash checkout (fetched, never pulled). Default C:/Users/<you>/projects/bb2dash.

.PARAMETER BuildRef
  What gets built. Default origin/main.

.PARAMETER BuildWorktree
  A detached `git worktree` of RepoDir that only the build touches. Created on
  first use. Default <RepoDir>-build.

.PARAMETER DockerWaitSeconds
  How long the build step may wait for the Docker engine. Default 600. A
  fresh force-request.json in -StateDir (written by the app's "Update desktop
  app", which has already checked Docker) shortens it for that one run; the
  file is consumed. See Get-DockerWaitSeconds.

.PARAMETER FetchTimeoutSeconds
  How long `git fetch` may take before its process tree is killed and the ref
  as last fetched is used instead. Default 45.

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
    [int] $FetchTimeoutSeconds = 45,
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
$APP_PROCESS_NAME = 'bb2dash'
$BUILD_MUTEX_NAME = 'Local\Bb2dashLaunchBuild'
$EXE_NAME = 'bb2dash.exe'
$LAUNCH_FILES = @('logon-build.ps1', 'update-now.ps1', 'Bb2dashLaunch.psm1', 'Bb2dashLaunch.Tests.ps1', 'compose.build.yaml', 'register-logon-task.ps1', 'README.md')

if ($BuildWorktree -eq '') { $BuildWorktree = "$($RepoDir.TrimEnd('/', '\'))-build" }

$ComposeBuildFile = Join-Path $PSScriptRoot 'compose.build.yaml'
$StackComposeFile = Join-Path $RepoDir 'compose.yaml'
$InstalledLaunchDir = Join-Path $StateDir 'launch'
$BuildsRoot = Join-Path $StateDir 'builds'
$CurrentLink = Join-Path $StateDir 'current'
$StateFile = Join-Path $StateDir 'state.json'
$CheckFile = Join-Path $StateDir 'last-check.json'
$ForceRequestFile = Join-Path $StateDir 'force-request.json'
# Set by Get-DesktopTreeHash; read into last-check.json.
$script:FetchOk = $false
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
    # Absolute candidates first: a scheduled task does not see PATH edits made
    # in a shell. -Optional returns $null instead of ending the script.
    param([string] $Name, [string[]] $Candidates, [switch] $Optional)
    foreach ($c in $Candidates) { if (Test-Path $c) { return $c } }
    $onPath = Get-Command $Name -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    if ($Optional) { return $null }
    Fail "$Name was not found." $EXIT_VALIDATION
}

# mingw64\bin\git.exe is the real git; cmd\git.exe is Git for Windows' launcher,
# and killing a launcher on timeout would leave the fetch running underneath.
$Git = Resolve-Tool 'git' @('C:/Program Files/Git/mingw64/bin/git.exe', 'C:/Program Files/Git/cmd/git.exe')
# Docker is needed only by the build step; the launch must work without it.
$Docker = Resolve-Tool 'docker' @('C:/Program Files/Docker/Docker/resources/bin/docker.exe') -Optional
$env:GIT_TERMINAL_PROMPT = '0'

function Invoke-Tool {
    # Runs a native tool; returns @{ ExitCode; Output } and never throws on a
    # non-zero exit. The caller decides what a failure means.
    #
    # Windows PowerShell 5.1 wraps every stderr line of a native command in an
    # ErrorRecord when it is redirected, and under $ErrorActionPreference =
    # 'Stop' that ends the script (git's "fatal: unable to access" on an
    # offline logon did exactly that). So the preference is relaxed for the
    # call only and the records are unwrapped back into text.
    param([string] $Exe, [string[]] $Arguments)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & $Exe @Arguments 2>&1 | ForEach-Object {
            if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { "$_" }
        }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    return @{ ExitCode = $code; Output = ($output -join "`n") }
}

function Invoke-ToolWithTimeout {
    # Like Invoke-Tool, but kills the whole process tree after $TimeoutSeconds.
    # A fetch against an unreachable github.com otherwise sits in TCP retries
    # for minutes, and this script is not allowed to make the logon wait.
    param([string] $Exe, [string[]] $Arguments, [int] $TimeoutSeconds)
    $err = [IO.Path]::GetTempFileName()
    $out = [IO.Path]::GetTempFileName()
    try {
        # PS 5.1 joins -ArgumentList with spaces and never quotes, so a path with a
        # space (`OneDrive - Syracuse University`) would arrive as several arguments.
        $quoted = $Arguments | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }
        $p = Start-Process -FilePath $Exe -ArgumentList ($quoted -join ' ') -NoNewWindow -PassThru `
            -RedirectStandardError $err -RedirectStandardOutput $out
        $null = $p.Handle   # PS 5.1: without the handle cached, ExitCode reads back null after a timed wait
        if (-not $p.WaitForExit($TimeoutSeconds * 1000)) {
            $kill = Invoke-Tool 'taskkill.exe' @('/PID', "$($p.Id)", '/T', '/F')
            if ($kill.ExitCode -ne 0) { Write-Log 'WARN' "could not kill pid $($p.Id) after timeout: $($kill.Output)" }
            return @{ ExitCode = -1; Output = "timed out after ${TimeoutSeconds}s" }
        }
        $p.WaitForExit()   # flushes the exit code once the timed wait has returned
        $text = ((Get-Content -Raw $out -ErrorAction SilentlyContinue) + (Get-Content -Raw $err -ErrorAction SilentlyContinue))
        return @{ ExitCode = $p.ExitCode; Output = ("$text").Trim() }
    } finally {
        Remove-Item -Force $err, $out -ErrorAction SilentlyContinue
    }
}

function Invoke-Git {
    param([string] $Dir, [string[]] $Arguments)
    return Invoke-Tool $Git (@('-C', $Dir) + $Arguments)
}

# ---------------------------------------------------------------- observations

function Test-DockerReady {
    param([int] $TimeoutSeconds)
    if (-not $Docker) { return $false }
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
    # Fetch (bounded), then the tree hash of desktop/ at the build ref. When
    # the fetch fails the ref as last fetched is used, so an offline logon can
    # still build something that was never built. '' only when the ref itself
    # cannot be resolved. Only a line that is exactly a hash is accepted: git
    # may print warnings on the same stream.
    $fetch = Invoke-ToolWithTimeout $Git @('-C', $RepoDir, 'fetch', '--quiet', 'origin') $FetchTimeoutSeconds
    $script:FetchOk = ($fetch.ExitCode -eq 0)
    if ($fetch.ExitCode -ne 0) {
        Write-Log 'WARN' "git fetch failed (offline?), using ${BuildRef} as last fetched: $($fetch.Output)"
    }
    $tree = Invoke-Git $RepoDir @('rev-parse', '--verify', '--quiet', "${BuildRef}:desktop")
    $hash = @($tree.Output -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^[0-9a-f]{40}$' }) | Select-Object -Last 1
    if ($tree.ExitCode -ne 0 -or -not $hash) {
        Write-Log 'WARN' "cannot resolve ${BuildRef}:desktop: $($tree.Output)"
        return ''
    }
    return $hash
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

function Test-BuildOnDisk {
    param([AllowEmptyString()][string] $Tree)
    return ($Tree -ne '') -and (Test-Path (Get-BuildExe $Tree))
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
    # UTF-8 without a BOM: PS 5.1's Set-Content -Encoding UTF8 writes one.
    [IO.File]::WriteAllText($tmp, (ConvertTo-LaunchStateJson -State $State), (New-Object Text.UTF8Encoding $false))
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
    # Returns $true when the worktree sits at the build ref. `prune` first: a
    # worktree folder deleted by hand stays registered and blocks `add`.
    if (-not (Test-Path (Join-Path $BuildWorktree '.git'))) {
        Invoke-Git $RepoDir @('worktree', 'prune') | Out-Null
        $add = Invoke-Git $RepoDir @('worktree', 'add', '--detach', $BuildWorktree, $BuildRef)
        if ($add.ExitCode -ne 0) { Write-Log 'ERROR' "git worktree add failed: $($add.Output)"; return $false }
        Write-Log 'INFO' "created build worktree $BuildWorktree"
        return $true
    }
    $co = Invoke-Git $BuildWorktree @('checkout', '--detach', '--quiet', $BuildRef)
    if ($co.ExitCode -ne 0) { Write-Log 'ERROR' "git checkout $BuildRef in the build worktree failed: $($co.Output)"; return $false }
    return $true
}

function Update-InstalledLaunch {
    # After a successful build, the installed copy of these scripts follows
    # the ref that was built. Only when running as the installed copy; a run
    # straight from a checkout leaves the install alone.
    if ($PSScriptRoot -ne $InstalledLaunchDir) { return }
    $source = Join-Path (Join-Path $BuildWorktree 'desktop') 'launch'
    if (-not (Test-Path (Join-Path $source 'logon-build.ps1'))) { return }
    foreach ($name in $LAUNCH_FILES) {
        $from = Join-Path $source $name
        if (Test-Path $from) { Copy-Item -Force $from (Join-Path $InstalledLaunchDir $name) }
    }
    Write-Log 'INFO' "installed launch scripts refreshed from $source"
}

function Invoke-ContainerBuild {
    # The ephemeral build for one desktop/ tree. Returns $true on success.
    param([string] $Tree)
    if ($Tree -eq (Get-ActiveTree)) {
        Write-Log 'ERROR' "refusing to rebuild $Tree over the active build"
        return $false
    }
    $out = Join-Path $BuildsRoot $Tree
    if (Test-Path $out) { Remove-Item -Recurse -Force $out }   # a partial earlier attempt
    New-Item -ItemType Directory -Force -Path $out | Out-Null

    # The compose file that matches the source being built: the worktree's copy at the
    # build ref when it exists (a commit that bumps the builder image or Electron must
    # build with its own file, or every logon retries the same failing build), else
    # the installed copy.
    $composeFile = Join-Path $BuildWorktree 'desktop\launch\compose.build.yaml'
    if (-not (Test-Path $composeFile)) { $composeFile = $ComposeBuildFile }
    $cmd = Get-BuildCommand -ComposeFile $composeFile
    Invoke-Tool $Docker @('rm', '-f', $cmd.ContainerName) | Out-Null   # a container a killed run left behind
    $env:BB2DASH_BUILD_SRC = (Join-Path $BuildWorktree 'desktop') -replace '\\', '/'
    $env:BB2DASH_BUILD_OUT = $out -replace '\\', '/'

    Write-Log 'INFO' "build start for tree $Tree from $env:BB2DASH_BUILD_SRC"
    $started = Get-Date
    $r = Invoke-Tool $Docker $cmd.Arguments
    $seconds = [int] ((Get-Date) - $started).TotalSeconds
    if ($r.ExitCode -ne 0 -or -not (Test-BuildOnDisk $Tree)) {
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
            # Never the build a pending Update now is switching to (update-now.ps1's marker).
            Remove-OldBuilds -Keep (Get-BuildsToKeep -NewTree $Tree -ActiveTree (Get-ActiveTree) -PendingSwapTree (Read-PendingSwapTree -StateDir $StateDir))
            Update-InstalledLaunch
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

function Invoke-BuildStep {
    # Steps 2-4: fetch, decide, build and compose. Returns $true when nothing failed.
    param([bool] $WaitForDocker)
    $tree = Get-DesktopTreeHash
    $state = Read-State
    $composeExists = Test-Path $StackComposeFile

    # What counts as "already built": the active build, or the recorded one if
    # its folder still exists. A recorded hash whose folder is gone is not a
    # build, so it never masks a needed rebuild.
    $lastBuilt = if ($tree -ne '' -and $tree -eq (Get-ActiveTree)) { $tree } elseif (Test-BuildOnDisk $state.LastBuiltSha) { $state.LastBuiltSha } else { '' }

    # The build ref came back to the active tree while a newer build was waiting in
    # state.json: forget the waiting build, or the next logon would activate a tree
    # that is no longer on the build ref and then rebuild the active one over it.
    if ($tree -ne '' -and $tree -eq (Get-ActiveTree) -and $state.LastBuiltSha -ne $tree) {
        Write-Log 'INFO' "build ref is the active build $tree again; forgetting the waiting build '$($state.LastBuiltSha)'"
        Write-State (New-LaunchState -Previous $state -LastBuiltSha $tree -LastResult 'ok' -Now (Get-Date))
    }

    $needDocker = Test-DockerNeeded -RemoteSha $tree -LastBuiltSha $lastBuilt -ComposeFileExists $composeExists
    $dockerWait = Read-ForceRequestDockerWait
    $wait = if ($WaitForDocker -or $needDocker) { $dockerWait } else { 0 }
    $dockerReady = if ($needDocker -or $WaitForDocker) { Test-DockerReady -TimeoutSeconds $wait } else { $false }

    $decision = Get-BuildDecision -RemoteSha $tree -LastBuiltSha $lastBuilt -DockerReady $dockerReady -ComposeFileExists $composeExists
    Write-Log 'INFO' "build decision: [$($decision.Actions -join ', ')] because $($decision.Reason)"
    if ($decision.Warning) { Write-Log 'WARN' $decision.Warning }

    $ok = $true
    foreach ($action in $decision.Actions) {
        switch ($action) {
            'Build'   { if (-not (Invoke-Build -Tree $tree)) { $ok = $false } }
            'Compose' { if (-not (Invoke-StackCompose)) { $ok = $false } }
        }
    }
    Write-BuildCheck -Check (Get-BuildCheckRecord -RemoteSha $tree -FetchOk $script:FetchOk -Decision $decision -Now (Get-Date))
    return $ok
}

function Read-ForceRequestDockerWait {
    # The Docker wait for this run: -DockerWaitSeconds, or shorter when the app
    # asked through force-request.json. The file is consumed either way, so a
    # later logon run never inherits it.
    if (-not (Test-Path $ForceRequestFile)) { return $DockerWaitSeconds }
    $json = ''
    try {
        $json = Get-Content -Raw -Path $ForceRequestFile
        Remove-Item -Force $ForceRequestFile
    } catch {
        Write-Log 'WARN' "could not read or remove force-request.json: $($_.Exception.Message)"
    }
    $wait = Get-DockerWaitSeconds -Default $DockerWaitSeconds -RequestJson $json -Now (Get-Date)
    Write-Log 'INFO' "app requested this run; Docker wait ${wait}s"
    return $wait
}

function Write-BuildCheck {
    # last-check.json for the app's "Update desktop app"; atomic like Write-State.
    # A failure here is logged, never fatal: the app then reports it could not check.
    param([pscustomobject] $Check)
    try {
        if (-not (Test-Path $StateDir)) { New-Item -ItemType Directory -Force -Path $StateDir | Out-Null }
        $tmp = "$CheckFile.tmp"
        [IO.File]::WriteAllText($tmp, (ConvertTo-BuildCheckJson -Check $Check), (New-Object Text.UTF8Encoding $false))
        Move-Item -Force $tmp $CheckFile
        Write-Log 'INFO' "check recorded: tree '$($Check.remoteTree)', skip '$($Check.skip)'"
    } catch {
        Write-Log 'WARN' "could not write last-check.json: $($_.Exception.Message)"
    }
}

function Invoke-StartupStep {
    # Step 1: no network, no Docker. Returns $true when the app was (or need not be) launched.
    $state = Read-State
    $activeTree = Get-ActiveTree
    $nextExists = ($state.LastBuiltSha -ne $activeTree) -and (Test-BuildOnDisk $state.LastBuiltSha)
    $decision = Get-StartupDecision -BuildExists ($activeTree -ne '') -NextBuildExists $nextExists -AppRunning (Test-AppRunning)
    Write-Log 'INFO' "startup decision: [$($decision.Actions -join ', ')] because $($decision.Reason)"
    foreach ($action in $decision.Actions) {
        switch ($action) {
            'Activate' { Invoke-Activate -Tree $state.LastBuiltSha }
            'Launch'   { Invoke-Launch }
            'FirstRun' { return $false }
        }
    }
    return $true
}

# ---------------------------------------------------------------- main

if (-not (Test-Path (Join-Path $RepoDir '.git'))) { Fail "not a git checkout: $RepoDir" $EXIT_VALIDATION }
if (-not (Test-Path $ComposeBuildFile)) { Fail "missing $ComposeBuildFile" $EXIT_VALIDATION }

Write-Log 'INFO' "logon-build start (repo $RepoDir, ref $BuildRef, scripts $PSScriptRoot)"

$launched = Invoke-StartupStep
if ($launched) {
    $ok = Invoke-BuildStep -WaitForDocker $false
} else {
    # First run: nothing to launch yet, so build in the foreground, then launch.
    $ok = Invoke-BuildStep -WaitForDocker $true
    if ($ok -and (Get-ActiveTree) -ne '') { Invoke-Launch } elseif ($ok) { $ok = $false; Write-Log 'ERROR' 'first run produced no active build' }
}

Write-Log 'INFO' "logon-build done (ok=$ok)"
if ($ok) { exit $EXIT_OK } else { exit $EXIT_BUILD_FAILED }
