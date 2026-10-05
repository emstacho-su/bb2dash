# Pester 3.4 syntax (what Windows 11 ships): `Should Be`, not `Should -Be`.
#   Invoke-Pester -Path desktop/launch
Set-StrictMode -Version Latest
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Import-Module (Join-Path $here 'Bb2dashLaunch.psm1') -Force

$SHA_A = 'a' * 40
$SHA_B = 'b' * 40

function Startup {
    param([hashtable] $Overrides = @{})
    $inputs = @{ BuildExists = $true; NextBuildExists = $false; AppRunning = $false }
    foreach ($k in $Overrides.Keys) { $inputs[$k] = $Overrides[$k] }
    return Get-StartupDecision @inputs
}

function Build {
    param([hashtable] $Overrides = @{})
    $inputs = @{ RemoteSha = $SHA_A; LastBuiltSha = $SHA_A; DockerReady = $true; ComposeFileExists = $false }
    foreach ($k in $Overrides.Keys) { $inputs[$k] = $Overrides[$k] }
    return Get-BuildDecision @inputs
}

Describe 'Get-StartupDecision (before any network or Docker call)' {

    It 'launches the current build (the common logon)' {
        $d = Startup
        ($d.Actions -join ',') | Should Be 'Launch'
    }

    It 'activates a finished build before launching when the app is not running' {
        $d = Startup (@{ NextBuildExists = $true })
        ($d.Actions -join ',') | Should Be 'Activate,Launch'
    }

    It 'never activates while the app is running (the exe is locked) and does not relaunch it' {
        $d = Startup (@{ NextBuildExists = $true; AppRunning = $true })
        ($d.Actions -join ',') | Should Be ''
        $d.Reason | Should Match 'running'
    }

    It 'uses a finished build even when the current junction is missing' {
        $d = Startup (@{ BuildExists = $false; NextBuildExists = $true })
        ($d.Actions -join ',') | Should Be 'Activate,Launch'
    }

    It 'reports a first run when nothing is built anywhere' {
        $d = Startup (@{ BuildExists = $false })
        ($d.Actions -join ',') | Should Be 'FirstRun'
    }
}

Describe 'Get-BuildDecision (after the fetch)' {

    It 'does nothing when desktop/ is unchanged: no container at all' {
        $d = Build
        ($d.Actions -join ',') | Should Be ''
        $d.Reason | Should Match 'unchanged'
        $d.Warning | Should Be ''
    }

    It 'rebuilds when the desktop/ tree hash moved and Docker answers' {
        $d = Build (@{ RemoteSha = $SHA_B })
        ($d.Actions -join ',') | Should Be 'Build'
    }

    It 'defers the rebuild with a warning when Docker is not ready' {
        $d = Build (@{ RemoteSha = $SHA_B; DockerReady = $false })
        ($d.Actions -join ',') | Should Be ''
        $d.Warning | Should Match 'Docker'
    }

    It 'skips the build check with a warning when the tree hash is unknown' {
        $d = Build (@{ RemoteSha = '' })
        ($d.Actions -join ',') | Should Be ''
        $d.Warning | Should Match 'build ref'
    }

    It 'builds when nothing was ever built (empty last hash)' {
        $d = Build (@{ LastBuiltSha = '' })
        ($d.Actions -join ',') | Should Be 'Build'
    }

    It 'brings the Phase 14 compose stack up when a compose file exists' {
        $d = Build (@{ ComposeFileExists = $true })
        ($d.Actions -join ',') | Should Be 'Compose'
    }

    It 'orders Build before Compose when both apply' {
        $d = Build (@{ RemoteSha = $SHA_B; ComposeFileExists = $true })
        ($d.Actions -join ',') | Should Be 'Build,Compose'
    }

    It 'does not try compose when Docker is down' {
        $d = Build (@{ ComposeFileExists = $true; DockerReady = $false })
        ($d.Actions -join ',') | Should Be ''
    }

    It 'rejects a hash that is not 40 hex characters' {
        { Build (@{ RemoteSha = 'not-a-sha' }) } | Should Throw
    }
}

Describe 'ConvertTo-LaunchState' {

    It 'reads a well-formed state file' {
        $json = '{"lastBuiltSha":"' + $SHA_A + '","lastBuildAt":"2026-09-29T04:00:00Z","lastResult":"ok"}'
        $s = ConvertTo-LaunchState -Json $json
        $s.LastBuiltSha | Should Be $SHA_A
        $s.LastResult | Should Be 'ok'
    }

    It 'falls back to an empty state on invalid JSON and reports it' {
        $s = ConvertTo-LaunchState -Json '{not json'
        $s.LastBuiltSha | Should Be ''
        $s.Invalid | Should Be $true
    }

    It 'falls back to an empty state when the hash field is malformed' {
        $s = ConvertTo-LaunchState -Json '{"lastBuiltSha":"zzz"}'
        $s.LastBuiltSha | Should Be ''
        $s.Invalid | Should Be $true
    }

    It 'treats an empty or missing file as an empty state without flagging it' {
        $s = ConvertTo-LaunchState -Json ''
        $s.LastBuiltSha | Should Be ''
        $s.Invalid | Should Be $false
    }
}

Describe 'New-LaunchState' {

    It 'returns a new record and leaves the original untouched' {
        $before = ConvertTo-LaunchState -Json ('{"lastBuiltSha":"' + $SHA_A + '","lastResult":"ok"}')
        $after = New-LaunchState -Previous $before -LastBuiltSha $SHA_B -LastResult 'ok' -Now ([datetime]'2026-09-29T05:00:00Z')
        $before.LastBuiltSha | Should Be $SHA_A
        $after.LastBuiltSha | Should Be $SHA_B
        $after.LastBuildAt | Should Be '2026-09-29T05:00:00Z'
    }

    It 'serialises to the JSON the reader accepts' {
        $s = New-LaunchState -Previous (ConvertTo-LaunchState -Json '') -LastBuiltSha $SHA_A -LastResult 'ok' -Now ([datetime]'2026-09-29T05:00:00Z')
        $round = ConvertTo-LaunchState -Json (ConvertTo-LaunchStateJson -State $s)
        $round.LastBuiltSha | Should Be $SHA_A
        $round.Invalid | Should Be $false
    }
}

Describe 'Get-BuildCheckRecord (last-check.json: what this run could check)' {
    $NOW = [datetime]'2026-09-30T05:00:00Z'

    It 'records a clean check: fetched, resolved, nothing deferred' {
        $c = Get-BuildCheckRecord -RemoteSha $SHA_A -FetchOk $true -Decision (Build) -Now $NOW
        $c.remoteTree | Should Be $SHA_A
        $c.skip | Should Be ''
        $c.checkedAt | Should Be '2026-09-30T05:00:00Z'
    }

    It 'records docker-not-ready when a needed build was deferred' {
        $c = Get-BuildCheckRecord -RemoteSha $SHA_B -FetchOk $true -Decision (Build (@{ RemoteSha = $SHA_B; DockerReady = $false })) -Now $NOW
        $c.skip | Should Be 'docker-not-ready'
    }

    It 'records fetch-failed when origin could not be fetched, even if the old ref resolved' {
        $c = Get-BuildCheckRecord -RemoteSha $SHA_A -FetchOk $false -Decision (Build) -Now $NOW
        $c.skip | Should Be 'fetch-failed'
    }

    It 'records ref-unresolved when the desktop/ tree hash is unknown' {
        $c = Get-BuildCheckRecord -RemoteSha '' -FetchOk $true -Decision (Build (@{ RemoteSha = '' })) -Now $NOW
        $c.skip | Should Be 'ref-unresolved'
        $c.remoteTree | Should Be ''
    }

    It 'serialises to the three fields the app reads' {
        $c = Get-BuildCheckRecord -RemoteSha $SHA_A -FetchOk $true -Decision (Build) -Now $NOW
        $json = ConvertTo-BuildCheckJson -Check $c
        $json | Should Be ('{"checkedAt":"2026-09-30T05:00:00Z","remoteTree":"' + $SHA_A + '","skip":""}')
    }
}

Describe 'Get-DockerWaitSeconds (force-request.json from the app shortens the Docker wait)' {
    $NOW = [datetime]'2026-09-30T05:00:00Z'

    It 'keeps the default when there is no request (the logon path)' {
        Get-DockerWaitSeconds -Default 600 -RequestJson '' -Now $NOW | Should Be 600
    }

    It 'uses the requested wait from a fresh app request' {
        $json = '{"requestedAt":"2026-09-30T04:59:00Z","dockerWaitSeconds":30}'
        Get-DockerWaitSeconds -Default 600 -RequestJson $json -Now $NOW | Should Be 30
    }

    It 'ignores a stale request (older than 15 minutes)' {
        $json = '{"requestedAt":"2026-09-30T04:40:00Z","dockerWaitSeconds":30}'
        Get-DockerWaitSeconds -Default 600 -RequestJson $json -Now $NOW | Should Be 600
    }

    It 'never lengthens the wait, and ignores anything malformed' {
        Get-DockerWaitSeconds -Default 600 -RequestJson '{"requestedAt":"2026-09-30T04:59:00Z","dockerWaitSeconds":9000}' -Now $NOW | Should Be 600
        Get-DockerWaitSeconds -Default 600 -RequestJson '{"requestedAt":"2026-09-30T04:59:00Z","dockerWaitSeconds":-5}' -Now $NOW | Should Be 600
        Get-DockerWaitSeconds -Default 600 -RequestJson '{"requestedAt":"2026-09-30T04:59:00Z","dockerWaitSeconds":"30"}' -Now $NOW | Should Be 600
        Get-DockerWaitSeconds -Default 600 -RequestJson '{not json' -Now $NOW | Should Be 600
        Get-DockerWaitSeconds -Default 600 -RequestJson '{"dockerWaitSeconds":30}' -Now $NOW | Should Be 600
    }
}

Describe 'Test-DockerNeeded' {

    It 'is false when desktop/ is unchanged and there is no compose file' {
        Test-DockerNeeded -RemoteSha $SHA_A -LastBuiltSha $SHA_A -ComposeFileExists $false | Should Be $false
    }

    It 'is true when the tree hash moved' {
        Test-DockerNeeded -RemoteSha $SHA_B -LastBuiltSha $SHA_A -ComposeFileExists $false | Should Be $true
    }

    It 'is true when nothing was ever built' {
        Test-DockerNeeded -RemoteSha $SHA_A -LastBuiltSha '' -ComposeFileExists $false | Should Be $true
    }

    It 'is false when the tree hash is unknown (nothing can be built)' {
        Test-DockerNeeded -RemoteSha '' -LastBuiltSha $SHA_A -ComposeFileExists $false | Should Be $false
    }

    It 'is true when a compose file exists even with nothing to build' {
        Test-DockerNeeded -RemoteSha $SHA_A -LastBuiltSha $SHA_A -ComposeFileExists $true | Should Be $true
    }
}

Describe 'Get-BuildCommand' {

    It 'runs the build service ephemerally through compose, under a fixed container name' {
        $c = Get-BuildCommand -ComposeFile 'C:/x/desktop/launch/compose.build.yaml'
        $c.ContainerName | Should Be 'bb2dash-build'
        ($c.Arguments -join ' ') | Should Be 'compose -f C:/x/desktop/launch/compose.build.yaml run --rm --name bb2dash-build build'
    }
}

# ---------------------------------------------------------------- Update now (2026-09-30)
#
# The app's "Update now" spawns update-now.ps1, which calls Invoke-UpdateSwap: wait for the
# app to exit, repoint `current` at the new build, start the app again. These run against a
# real junction under TestDrive; the process check and the launch are injected.

function New-FakeBuild {
    param([string] $StateDir, [string] $Tree)
    $dir = Join-Path (Join-Path (Join-Path $StateDir 'builds') $Tree) 'win-unpacked'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Set-Content -Path (Join-Path $dir 'bb2dash.exe') -Value 'fake'
    return $dir
}

function Get-CurrentTarget {
    param([string] $StateDir)
    $item = Get-Item (Join-Path $StateDir 'current') -Force
    return [string] ($item.Target | Select-Object -First 1)
}

function New-SwapFixture {
    $stateDir = Join-Path $TestDrive ([guid]::NewGuid().ToString('N'))
    $old = New-FakeBuild -StateDir $stateDir -Tree $SHA_A
    $new = New-FakeBuild -StateDir $stateDir -Tree $SHA_B
    New-Item -ItemType Junction -Path (Join-Path $stateDir 'current') -Target $old | Out-Null
    return [pscustomobject]@{ StateDir = $stateDir; Old = $old; New = $new }
}

Describe 'Get-UpdateSwapDecision' {

    It 'swaps and launches when the app has exited and the new build is on disk' {
        $d = Get-UpdateSwapDecision -Tree $SHA_B -ActiveTree $SHA_A -BuildExists $true -AppExited $true
        ($d.Actions -join ',') | Should Be 'Swap,Launch'
    }

    It 'only relaunches the old build when the app did not exit in time' {
        $d = Get-UpdateSwapDecision -Tree $SHA_B -ActiveTree $SHA_A -BuildExists $true -AppExited $false
        ($d.Actions -join ',') | Should Be 'Launch'
        $d.Reason | Should Match 'did not exit'
    }

    It 'only relaunches when the new build is missing' {
        $d = Get-UpdateSwapDecision -Tree $SHA_B -ActiveTree $SHA_A -BuildExists $false -AppExited $true
        ($d.Actions -join ',') | Should Be 'Launch'
        $d.Reason | Should Match 'not on disk'
    }

    It 'only relaunches when the requested build is already current' {
        $d = Get-UpdateSwapDecision -Tree $SHA_A -ActiveTree $SHA_A -BuildExists $true -AppExited $true
        ($d.Actions -join ',') | Should Be 'Launch'
    }

    It 'rejects a tree that is not 40 hex characters' {
        { Get-UpdateSwapDecision -Tree '..\evil' -ActiveTree $SHA_A -BuildExists $true -AppExited $true } | Should Throw
        { Get-UpdateSwapDecision -Tree '' -ActiveTree $SHA_A -BuildExists $true -AppExited $true } | Should Throw
    }
}

Describe 'Invoke-UpdateSwap' {

    It 'waits for the app to exit, repoints current at the new build, and starts the app' {
        $f = New-SwapFixture
        $script:polls = 0
        $script:launched = @()
        $r = Invoke-UpdateSwap -StateDir $f.StateDir -Tree $SHA_B -TimeoutSeconds 5 -PollMilliseconds 10 `
            -TestAppRunning { $script:polls++; return ($script:polls -lt 3) } `
            -StartApp { param($exe) $script:launched += $exe } `
            -Log { param($level, $message) }
        $r.Swapped | Should Be $true
        $r.Launched | Should Be $true
        $script:polls | Should Be 3
        (Get-CurrentTarget $f.StateDir) | Should Be $f.New
        $script:launched.Count | Should Be 1
        $script:launched[0] | Should Be (Join-Path (Join-Path $f.StateDir 'current') 'bb2dash.exe')
    }

    It 'keeps the old build current and relaunches it when the app never exits' {
        $f = New-SwapFixture
        $script:launched = 0
        $script:lines = @()
        $r = Invoke-UpdateSwap -StateDir $f.StateDir -Tree $SHA_B -TimeoutSeconds 0 -PollMilliseconds 10 `
            -TestAppRunning { $true } `
            -StartApp { param($exe) $script:launched++ } `
            -Log { param($level, $message) $script:lines += "$level $message" }
        $r.Swapped | Should Be $false
        (Get-CurrentTarget $f.StateDir) | Should Be $f.Old
        $script:launched | Should Be 1
        ($script:lines -join "`n") | Should Match 'did not exit'
    }

    It 'keeps the old build current and relaunches it when the new build is missing' {
        $f = New-SwapFixture
        Remove-Item -Recurse -Force (Join-Path (Join-Path $f.StateDir 'builds') $SHA_B)
        $script:launched = 0
        $r = Invoke-UpdateSwap -StateDir $f.StateDir -Tree $SHA_B -TimeoutSeconds 1 -PollMilliseconds 10 `
            -TestAppRunning { $false } -StartApp { param($exe) $script:launched++ } -Log { param($level, $message) }
        $r.Swapped | Should Be $false
        (Get-CurrentTarget $f.StateDir) | Should Be $f.Old
        $script:launched | Should Be 1
    }

    It 'reports a launch that throws, after the swap has already happened' {
        $f = New-SwapFixture
        $script:lines = @()
        $r = Invoke-UpdateSwap -StateDir $f.StateDir -Tree $SHA_B -TimeoutSeconds 1 -PollMilliseconds 10 `
            -TestAppRunning { $false } -StartApp { param($exe) throw 'task missing' } `
            -Log { param($level, $message) $script:lines += "$level $message" }
        $r.Swapped | Should Be $true
        $r.Launched | Should Be $false
        ($script:lines -join "`n") | Should Match 'ERROR'
    }

    It 'refuses a malformed tree without touching current or launching anything unknown' {
        $f = New-SwapFixture
        $script:launched = 0
        { Invoke-UpdateSwap -StateDir $f.StateDir -Tree 'not-a-tree' -TimeoutSeconds 1 -PollMilliseconds 10 `
            -TestAppRunning { $false } -StartApp { param($exe) $script:launched++ } -Log { param($level, $message) } } | Should Throw
        (Get-CurrentTarget $f.StateDir) | Should Be $f.Old
    }
}

Describe 'Set-CurrentBuild' {

    It 'repoints the junction and reports the previous target' {
        $f = New-SwapFixture
        $r = Set-CurrentBuild -CurrentLink (Join-Path $f.StateDir 'current') -Target $f.New
        $r.Ok | Should Be $true
        $r.Previous | Should Be $f.Old
        (Get-CurrentTarget $f.StateDir) | Should Be $f.New
        Test-Path (Join-Path $f.Old 'bb2dash.exe') | Should Be $true   # the old build itself is untouched
    }

    It 'creates the junction when there was none' {
        $stateDir = Join-Path $TestDrive ([guid]::NewGuid().ToString('N'))
        $new = New-FakeBuild -StateDir $stateDir -Tree $SHA_B
        $r = Set-CurrentBuild -CurrentLink (Join-Path $stateDir 'current') -Target $new
        $r.Ok | Should Be $true
        (Get-CurrentTarget $stateDir) | Should Be $new
    }

    It 'refuses a target without bb2dash.exe and leaves current alone' {
        $f = New-SwapFixture
        $empty = Join-Path $f.StateDir 'empty'
        New-Item -ItemType Directory -Path $empty | Out-Null
        $r = Set-CurrentBuild -CurrentLink (Join-Path $f.StateDir 'current') -Target $empty
        $r.Ok | Should Be $false
        (Get-CurrentTarget $f.StateDir) | Should Be $f.Old
    }
}

# ---------------------------------------------------------------- code review round (2026-09-30)
#
# The swap and the builder share the builder's mutex, so a build finishing mid-swap can
# neither repoint `current` nor prune the build being switched to; and a pending swap names
# its build in a marker the builder's pruning keeps.

function Start-MutexHolder {
    # Holds a named mutex in a separate process (a mutex is re-entrant on its own thread,
    # so the test thread cannot play "the builder" itself). Returns once it is held.
    param([string] $Name, [int] $HoldSeconds)
    $ready = Join-Path $TestDrive ([guid]::NewGuid().ToString('N'))
    $job = Start-Job -ArgumentList $Name, $HoldSeconds, $ready -ScriptBlock {
        param($n, $s, $r)
        $m = New-Object System.Threading.Mutex($false, $n)
        $null = $m.WaitOne()
        Set-Content -Path $r -Value 'held'
        Start-Sleep -Seconds $s
        $m.ReleaseMutex()
        $m.Dispose()
    }
    $deadline = (Get-Date).AddSeconds(30)
    while (-not (Test-Path $ready)) {
        if ((Get-Date) -ge $deadline) { throw 'the mutex holder never started' }
        Start-Sleep -Milliseconds 100
    }
    return $job
}

function Invoke-TestSwap {
    param([pscustomobject] $Fixture, [string] $MutexName, [int] $LockWaitSeconds = 5, [scriptblock] $TestAppRunning = { $false })
    $script:launched = 0
    $script:lines = @()
    return Invoke-UpdateSwap -StateDir $Fixture.StateDir -Tree $SHA_B -TimeoutSeconds 1 -PollMilliseconds 10 `
        -MutexName $MutexName -LockWaitSeconds $LockWaitSeconds `
        -TestAppRunning $TestAppRunning `
        -StartApp { param($exe) $script:launched++ } `
        -Log { param($level, $message) $script:lines += "$level $message" }
}

Describe 'Invoke-UpdateSwap and the builder mutex' {

    It 'swaps when the builder is idle, and leaves the mutex free afterwards' {
        $f = New-SwapFixture
        $name = 'Local\Bb2dashTest' + [guid]::NewGuid().ToString('N')
        $r = Invoke-TestSwap -Fixture $f -MutexName $name
        $r.Swapped | Should Be $true
        $m = New-Object System.Threading.Mutex($false, $name)
        $m.WaitOne(0) | Should Be $true
        $m.ReleaseMutex(); $m.Dispose()
    }

    It 'waits for a builder that finishes within the bound, then swaps' {
        $f = New-SwapFixture
        $name = 'Local\Bb2dashTest' + [guid]::NewGuid().ToString('N')
        $job = Start-MutexHolder -Name $name -HoldSeconds 2
        try {
            $r = Invoke-TestSwap -Fixture $f -MutexName $name -LockWaitSeconds 20
            $r.Swapped | Should Be $true
            (Get-CurrentTarget $f.StateDir) | Should Be $f.New
            ($script:lines -join "`n") | Should Match 'builder'
        } finally { $job | Wait-Job | Remove-Job -Force }
    }

    It 'keeps the old build and relaunches it when the builder holds the mutex past the bound' {
        $f = New-SwapFixture
        $name = 'Local\Bb2dashTest' + [guid]::NewGuid().ToString('N')
        $job = Start-MutexHolder -Name $name -HoldSeconds 6
        try {
            $r = Invoke-TestSwap -Fixture $f -MutexName $name -LockWaitSeconds 1
            $r.Swapped | Should Be $false
            $script:launched | Should Be 1
            (Get-CurrentTarget $f.StateDir) | Should Be $f.Old
            ($script:lines -join "`n") | Should Match 'builder'
        } finally { $job | Wait-Job | Remove-Job -Force }
    }

    It 'names its build in the pending-swap marker while it runs, and removes it after' {
        $f = New-SwapFixture
        $name = 'Local\Bb2dashTest' + [guid]::NewGuid().ToString('N')
        $marker = Join-Path $f.StateDir 'swap-pending'
        $script:seen = ''
        $r = Invoke-TestSwap -Fixture $f -MutexName $name -TestAppRunning {
            if (Test-Path $marker) { $script:seen = (Get-Content -Raw $marker).Trim() }
            return $false
        }
        $r.Swapped | Should Be $true
        $script:seen | Should Be $SHA_B
        Test-Path $marker | Should Be $false
    }
}

Describe 'Invoke-UpdateSwap and a pending swap for another build (R2-1)' {

    function Set-Marker {
        param([pscustomobject] $Fixture, [string] $Tree, [int] $AgeSeconds = 0)
        $path = Join-Path $Fixture.StateDir 'swap-pending'
        [IO.File]::WriteAllText($path, $Tree)
        if ($AgeSeconds -gt 0) { (Get-Item $path).LastWriteTime = (Get-Date).AddSeconds(-$AgeSeconds) }
        return $path
    }

    It 'refuses while a fresh marker names another build: nothing written, no mutex, nothing started' {
        $f = New-SwapFixture
        $other = 'c' * 40
        $marker = Set-Marker -Fixture $f -Tree $other
        $before = (Get-Item $marker).LastWriteTimeUtc
        $name = 'Local\Bb2dashTest' + [guid]::NewGuid().ToString('N')
        $r = Invoke-TestSwap -Fixture $f -MutexName $name
        $r.Swapped | Should Be $false
        $r.Launched | Should Be $false
        $r.Reason | Should Match "another update is in progress for build $other"
        $script:launched | Should Be 0
        ($script:lines -join "`n") | Should Match "another update is in progress for build $other"
        [IO.File]::ReadAllText($marker) | Should Be $other
        (Get-Item $marker).LastWriteTimeUtc | Should Be $before
        (Get-CurrentTarget $f.StateDir) | Should Be $f.Old
        $m = $null
        [System.Threading.Mutex]::TryOpenExisting($name, [ref] $m) | Should Be $false
    }

    It 'overwrites a marker for another build older than the wait bounds (a leftover) and swaps' {
        $f = New-SwapFixture
        # Invoke-TestSwap waits 1 s for the app and 5 s for the mutex: older than 6 s is a leftover.
        $null = Set-Marker -Fixture $f -Tree ('c' * 40) -AgeSeconds 3600
        $r = Invoke-TestSwap -Fixture $f -MutexName ('Local\Bb2dashTest' + [guid]::NewGuid().ToString('N'))
        $r.Swapped | Should Be $true
        (Get-CurrentTarget $f.StateDir) | Should Be $f.New
    }

    It 'proceeds over a fresh marker naming its own build' {
        $f = New-SwapFixture
        $null = Set-Marker -Fixture $f -Tree $SHA_B
        $r = Invoke-TestSwap -Fixture $f -MutexName ('Local\Bb2dashTest' + [guid]::NewGuid().ToString('N'))
        $r.Swapped | Should Be $true
    }
}

Describe 'Get-BuildsToKeep (pruning never deletes a swap target)' {

    It 'keeps the new build, the active build and the pending swap target' {
        $keep = Get-BuildsToKeep -NewTree $SHA_A -ActiveTree $SHA_B -PendingSwapTree ('c' * 40)
        ($keep | Sort-Object) -join ',' | Should Be (@($SHA_A, $SHA_B, ('c' * 40)) -join ',')
    }

    It 'drops empty and malformed entries' {
        $keep = Get-BuildsToKeep -NewTree $SHA_A -ActiveTree '' -PendingSwapTree '..\evil'
        ($keep -join ',') | Should Be $SHA_A
    }
}

Describe 'Read-PendingSwapTree' {

    It 'reads the marker, and is empty when it is missing or malformed' {
        $dir = Join-Path $TestDrive ([guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $dir | Out-Null
        Read-PendingSwapTree -StateDir $dir | Should Be ''
        Set-Content -Path (Join-Path $dir 'swap-pending') -Value $SHA_B
        Read-PendingSwapTree -StateDir $dir | Should Be $SHA_B
        Set-Content -Path (Join-Path $dir 'swap-pending') -Value 'junk'
        Read-PendingSwapTree -StateDir $dir | Should Be ''
    }
}

Describe 'Invoke-UpdateFallback (update-now.ps1 catch path)' {

    It 'waits for the app to exit before starting it again' {
        $script:polls = 0
        $script:startedAfter = -1
        $r = Invoke-UpdateFallback -TimeoutSeconds 5 -PollMilliseconds 10 `
            -TestAppRunning { $script:polls++; return ($script:polls -lt 4) } `
            -StartApp { $script:startedAfter = $script:polls } `
            -Log { param($level, $message) }
        $r.Launched | Should Be $true
        $script:startedAfter | Should Be 4
    }

    It 'starts the app anyway once the bound has passed' {
        $script:started = 0
        $r = Invoke-UpdateFallback -TimeoutSeconds 0 -PollMilliseconds 10 `
            -TestAppRunning { $true } -StartApp { $script:started++ } -Log { param($level, $message) }
        $script:started | Should Be 1
        $r.Launched | Should Be $true
    }

    It 'still starts the app when logging itself throws, and never throws' {
        $script:started = 0
        { $script:r = Invoke-UpdateFallback -TimeoutSeconds 1 -PollMilliseconds 10 `
            -TestAppRunning { $false } -StartApp { $script:started++ } `
            -Log { param($level, $message) throw 'disk full' } } | Should Not Throw
        $script:started | Should Be 1
        $script:r.Launched | Should Be $true
    }

    It 'reports a start that fails instead of throwing' {
        { $script:r = Invoke-UpdateFallback -TimeoutSeconds 1 -PollMilliseconds 10 `
            -TestAppRunning { $false } -StartApp { throw 'task missing' } `
            -Log { param($level, $message) throw 'disk full' } } | Should Not Throw
        $script:r.Launched | Should Be $false
    }
}

# ---------------------------------------------------------------- the hand-off (2026-10-04)
#
# Windows PowerShell 5.1 started detached (no console) exits 0 without running its script,
# so the app runs `update-now.ps1 -Detach` as a plain hidden child and that stage starts the
# real helper with Start-Process (W-71). The argv is pure; the start is an injected scriptblock.

$HANDOFF_SCRIPT = 'C:\Users\s\AppData\Local\bb2dash-launch\launch\update-now.ps1'
$HANDOFF_STATE = 'C:\Users\s\AppData\Local\bb2dash-launch'
$HANDOFF_POWERSHELL = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'

function New-TestHandoffArguments {
    param([hashtable] $Overrides = @{})
    $inputs = @{ ScriptPath = $HANDOFF_SCRIPT; Tree = $SHA_B; StateDir = $HANDOFF_STATE; AppTaskName = 'Bb2dash-App'; TimeoutSeconds = 60 }
    foreach ($k in $Overrides.Keys) { $inputs[$k] = $Overrides[$k] }
    return New-HelperHandoffArgumentList @inputs
}

function Get-ArgumentAfter {
    param([string[]] $Arguments, [string] $Name)
    $i = [array]::IndexOf($Arguments, $Name)
    if ($i -lt 0 -or $i -ge ($Arguments.Count - 1)) { return $null }
    return $Arguments[$i + 1]
}

function Invoke-TestHandoff {
    param([scriptblock] $StartProcess)
    $script:lines = @()
    return Invoke-HelperHandoff -PowerShellPath $HANDOFF_POWERSHELL -ScriptPath $HANDOFF_SCRIPT -Tree $SHA_B `
        -StateDir $HANDOFF_STATE -AppTaskName 'Bb2dash-App' -TimeoutSeconds 60 -StartProcess $StartProcess `
        -Log { param($level, $message) $script:lines += "$level $message" }
}

Describe 'New-HelperHandoffArgumentList (update-now.ps1 -Detach)' {

    It 'runs the same script, and never with -Detach again' {
        $a = New-TestHandoffArguments
        ($a -contains '-Detach') | Should Be $false
        (Get-ArgumentAfter $a '-File') | Should Be $HANDOFF_SCRIPT
        ($a -contains '-NoProfile') | Should Be $true
        ($a -contains '-NonInteractive') | Should Be $true
    }

    It 'leaves hiding the window to Start-Process -WindowStyle Hidden, not to the child argv (R2-7)' {
        $a = New-TestHandoffArguments
        ($a -contains '-WindowStyle') | Should Be $false
        ($a -contains 'Hidden') | Should Be $false
    }

    It 'puts every PowerShell option before -File (what follows -File goes to the script)' {
        $a = New-TestHandoffArguments
        $file = [array]::IndexOf($a, '-File')
        foreach ($option in @('-NoProfile', '-NonInteractive', '-ExecutionPolicy')) {
            [array]::IndexOf($a, $option) | Should BeLessThan $file
        }
    }

    It 'carries the tree, the state folder, the app task and the timeout' {
        $a = New-TestHandoffArguments (@{ AppTaskName = 'Bb2dash-NoSuchTask'; TimeoutSeconds = 7 })
        (Get-ArgumentAfter $a '-Tree') | Should Be $SHA_B
        (Get-ArgumentAfter $a '-StateDir') | Should Be $HANDOFF_STATE
        (Get-ArgumentAfter $a '-AppTaskName') | Should Be 'Bb2dash-NoSuchTask'
        (Get-ArgumentAfter $a '-TimeoutSeconds') | Should Be '7'
    }

    It 'quotes an element with a space, because Start-Process joins the list unquoted' {
        $a = New-TestHandoffArguments (@{ StateDir = 'C:\Users\s\OneDrive - Syracuse University\launch' })
        (Get-ArgumentAfter $a '-StateDir') | Should Be '"C:\Users\s\OneDrive - Syracuse University\launch"'
        $s = New-TestHandoffArguments (@{ ScriptPath = 'C:\a b\update-now.ps1' })
        (Get-ArgumentAfter $s '-File') | Should Be '"C:\a b\update-now.ps1"'
    }

    It 'keeps a trailing backslash literal inside the quotes' {
        $a = New-TestHandoffArguments (@{ StateDir = 'C:\a b\' })
        (Get-ArgumentAfter $a '-StateDir') | Should Be '"C:\a b\\"'
    }

    It 'refuses a malformed tree and an element with a double quote' {
        { New-TestHandoffArguments (@{ Tree = '..\evil' }) } | Should Throw
        { New-TestHandoffArguments (@{ StateDir = 'C:\a" -Evil "b' }) } | Should Throw
    }
}

Describe 'Invoke-HelperHandoff' {

    It 'starts PowerShell once with the hand-off list, in the state folder, and logs the pid' {
        $script:calls = @()
        $r = Invoke-TestHandoff -StartProcess {
            param($filePath, $argumentList, $workingDirectory)
            $script:calls += , @($filePath, $argumentList, $workingDirectory)
            return [pscustomobject]@{ Id = 4242 }
        }
        $r.Ok | Should Be $true
        $r.ProcessId | Should Be 4242
        $script:calls.Count | Should Be 1
        $script:calls[0][0] | Should Be $HANDOFF_POWERSHELL
        ($script:calls[0][1] -join ' ') | Should Be ((New-TestHandoffArguments) -join ' ')
        $script:calls[0][2] | Should Be $HANDOFF_STATE
        ($script:lines -join "`n") | Should Match 'INFO .*pid 4242'
    }

    It 'reports a start that throws, at ERROR, instead of swallowing it' {
        $r = Invoke-TestHandoff -StartProcess { param($f, $a, $w) throw 'access denied' }
        $r.Ok | Should Be $false
        $r.Reason | Should Match 'access denied'
        ($script:lines -join "`n") | Should Match 'ERROR .*access denied'
    }

    It 'counts a start that returns no process as a failure' {
        $r = Invoke-TestHandoff -StartProcess { param($f, $a, $w) $null }
        $r.Ok | Should Be $false
        ($script:lines -join "`n") | Should Match 'ERROR'
    }

    It 'still reports a successful start when logging it throws (R2-3)' {
        $script:starts = 0
        $r = Invoke-HelperHandoff -PowerShellPath $HANDOFF_POWERSHELL -ScriptPath $HANDOFF_SCRIPT -Tree $SHA_B `
            -StateDir $HANDOFF_STATE -AppTaskName 'Bb2dash-App' -TimeoutSeconds 60 `
            -StartProcess { param($f, $a, $w) $script:starts++; [pscustomobject]@{ Id = 4242 } } `
            -Log { param($level, $message) throw 'disk full' }
        $r.Ok | Should Be $true
        $r.ProcessId | Should Be 4242
        $script:starts | Should Be 1
    }

    It 'still reports a failed start when logging the failure throws' {
        $r = Invoke-HelperHandoff -PowerShellPath $HANDOFF_POWERSHELL -ScriptPath $HANDOFF_SCRIPT -Tree $SHA_B `
            -StateDir $HANDOFF_STATE -AppTaskName 'Bb2dash-App' -TimeoutSeconds 60 `
            -StartProcess { param($f, $a, $w) throw 'access denied' } `
            -Log { param($level, $message) throw 'disk full' }
        $r.Ok | Should Be $false
        $r.Reason | Should Match 'access denied'
    }
}
