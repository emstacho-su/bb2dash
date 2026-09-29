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
