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
