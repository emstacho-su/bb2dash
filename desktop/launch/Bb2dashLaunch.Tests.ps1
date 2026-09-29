# Pester 3.4 syntax (what Windows 11 ships): `Should Be`, not `Should -Be`.
#   Invoke-Pester -Path desktop/launch
Set-StrictMode -Version Latest
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Import-Module (Join-Path $here 'Bb2dashLaunch.psm1') -Force

$SHA_A = 'a' * 40
$SHA_B = 'b' * 40

function NewInputs {
    param([hashtable] $Overrides = @{})
    $base = @{
        RemoteSha         = $SHA_A
        LastBuiltSha      = $SHA_A
        BuildExists       = $true
        NextBuildExists   = $false
        AppRunning        = $false
        DockerReady       = $true
        ComposeFileExists = $false
    }
    foreach ($k in $Overrides.Keys) { $base[$k] = $Overrides[$k] }
    return $base
}

function Decide {
    param([hashtable] $Overrides = @{})
    $inputs = NewInputs $Overrides
    return Get-LaunchDecision @inputs
}

Describe 'Get-LaunchDecision' {

    It 'launches only when the build is current (the common logon: no container at all)' {
        $d = Decide
        ($d.Actions -join ',') | Should Be 'Launch'
        $d.Reason | Should Match 'unchanged'
    }

    It 'launches the existing build first, then rebuilds when desktop/ changed' {
        $d = Decide (@{ RemoteSha = $SHA_B })
        ($d.Actions -join ',') | Should Be 'Launch,Build'
    }

    It 'builds before launching when no build exists yet (first run)' {
        $d = Decide (@{ BuildExists = $false; LastBuiltSha = '' })
        ($d.Actions -join ',') | Should Be 'Build,Launch'
    }

    It 'does nothing but say why when there is no build and Docker is down' {
        $d = Decide (@{ BuildExists = $false; LastBuiltSha = ''; DockerReady = $false })
        ($d.Actions -join ',') | Should Be 'Skip'
        $d.Reason | Should Match 'Docker'
    }

    It 'activates a finished build before launching when the app is not running' {
        $d = Decide (@{ NextBuildExists = $true })
        ($d.Actions -join ',') | Should Be 'Activate,Launch'
    }

    It 'never activates while the app is running (the exe is locked) and does not relaunch it' {
        $d = Decide (@{ NextBuildExists = $true; AppRunning = $true })
        ($d.Actions -join ',') | Should Be ''
        $d.Reason | Should Match 'running'
    }

    It 'still launches the old build when the remote moved but Docker is not ready, and warns' {
        $d = Decide (@{ RemoteSha = $SHA_B; DockerReady = $false })
        ($d.Actions -join ',') | Should Be 'Launch'
        $d.Warning | Should Match 'Docker'
    }

    It 'skips the build when the tree hash is unknown (fetch failed)' {
        $d = Decide (@{ RemoteSha = '' })
        ($d.Actions -join ',') | Should Be 'Launch'
        $d.Warning | Should Match 'fetch'
    }

    It 'brings the Phase 14 compose stack up after the app when a compose file exists' {
        $d = Decide (@{ ComposeFileExists = $true })
        ($d.Actions -join ',') | Should Be 'Launch,Compose'
    }

    It 'does not try compose when Docker is down' {
        $d = Decide (@{ ComposeFileExists = $true; DockerReady = $false })
        ($d.Actions -join ',') | Should Be 'Launch'
    }

    It 'uses a next build that exists even when the current build is missing' {
        $d = Decide (@{ BuildExists = $false; NextBuildExists = $true })
        ($d.Actions -join ',') | Should Be 'Activate,Launch'
    }

    It 'rejects a SHA that is not 40 hex characters' {
        { Decide (@{ RemoteSha = 'not-a-sha' }) } | Should Throw
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

    It 'falls back to an empty state when the SHA field is malformed' {
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

Describe 'Get-BuildCommand' {

    It 'runs the build service ephemerally through compose' {
        $c = Get-BuildCommand -ComposeFile 'C:/x/desktop/launch/compose.build.yaml'
        $c.Executable | Should Be 'docker'
        ($c.Arguments -join ' ') | Should Be 'compose -f C:/x/desktop/launch/compose.build.yaml run --rm --name bb2dash-build build'
    }
}
