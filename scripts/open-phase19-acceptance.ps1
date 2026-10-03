# Opens Phase 19's acceptance script (brief 99) in Notepad, with the preview link and the
# walk notes the PM added, so Stack can tick it off while he walks the preview.
#   powershell -ExecutionPolicy Bypass -File scripts\open-phase19-acceptance.ps1
$ErrorActionPreference = 'Stop'

$Brief = Join-Path $PSScriptRoot '..\docs\planning\sprint-2\briefs\99_PHASE19_content_history.md'
$Out = Join-Path $env:TEMP 'phase19-acceptance.txt'
$Preview = 'https://web-git-feat-content-history-19-emstacho-sus-projects.vercel.app'
$StartMarker = "Stack's acceptance script, walked on the preview:"
$EndMarker = 'What proves each requirement:'

if (-not (Test-Path $Brief)) { throw "Brief not found: $Brief" }
$text = Get-Content -Raw -Encoding UTF8 -Path $Brief
$start = $text.IndexOf($StartMarker)
$end = $text.IndexOf($EndMarker)
if ($start -lt 0 -or $end -le $start) { throw 'Acceptance script section not found in brief 99.' }
$steps = $text.Substring($start, $end - $start).Trim()

$notes = @"
PHASE 19 ACCEPTANCE (PR #60)
Preview (open it signed in to Vercel): $Preview

$steps

PM NOTES FOR THE WALK
- Step 2: IST.352 has two live folders named "WK01 - ..." (Welcome, and the renamed week folder).
  The check is that "WK01 - The Systems Development Environment" appears once and "WK01 - Chapter 1" is gone.
- Step 3: the Stream is the week timeline, so materials show in a "New and changed materials" block
  above it (newest 8, older under a fold). Say if you want it somewhere else.
- Step 4 already passed live with your sync 866 (task 27). Repeat it if you want to watch "sync running".
- Step 5 needs a sync, so the Sync button must be free: no other sync queued or claimed.
  The interrupted line appears at the first 2-minute tick after 30 minutes.
  Your installed desktop app is main's build, so its toast still says "Sync failed"; "Sync interrupted"
  arrives with the first desktop build after the merge (the reducer is unit-tested).
- Inbox item 2636 is the PM's earlier proof of step 5's rule; dismiss it when you are done.
- Step 6: there are ten rows, not nine; the tenth records migration block 170-179.
"@

Set-Content -Path $Out -Value $notes -Encoding UTF8
Start-Process notepad.exe -ArgumentList "`"$Out`""
