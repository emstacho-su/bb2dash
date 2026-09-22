# bb2dash :: scripts/validate-grading.ps1
# Launches the V-1 grading-validation session (docs/planning/sprint-1-hub/briefs/63_GRADING_VALIDATION.md):
# a Claude Code session that can see ONLY the bb2dash materials MCP server plus the four
# file tools, scoped to the validation documents. It cannot reach Supabase, the rag server,
# or a shell. Run from the repo root in PowerShell.
#
#   .\scripts\validate-grading.ps1             # every course, in the brief's order
#   .\scripts\validate-grading.ps1 IST.466     # one course
#
# The bb2dash server entry (command, args, env incl. the service key) is copied from
# ~/.claude.json into a temp file for --mcp-config, so no secret lives in the repo.

param(
  [string]$Course = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$claudeJson = Join-Path $env:USERPROFILE ".claude.json"
if (-not (Test-Path $claudeJson)) { throw "~/.claude.json not found; register the bb2dash MCP server first (mcp-server/README.md)." }

$cfg = Get-Content $claudeJson -Raw | ConvertFrom-Json
$server = $cfg.mcpServers.bb2dash
if ($null -eq $server) { throw "No 'bb2dash' entry under mcpServers in ~/.claude.json." }
if (-not (Test-Path $server.args[0])) { throw "bb2dash server build missing: $($server.args[0]). Run 'npm run build' in mcp-server/." }

$tmp = Join-Path $env:TEMP ("bb2dash-validate-mcp-" + [guid]::NewGuid().ToString("N") + ".json")
@{ mcpServers = @{ bb2dash = $server } } | ConvertTo-Json -Depth 6 | Set-Content -Path $tmp -Encoding utf8

$brief  = "docs/planning/sprint-1-hub/briefs/63_GRADING_VALIDATION.md"
$export = "docs/planning/sprint-1-hub/briefs/64_GRADING_SCHEMA_EXPORT_2026-09-14.md"

$scope = if ($Course) { "Validate course $Course only." } else { "Validate every course in the brief's order, one at a time, stopping for Stack between courses." }
$prompt = @"
You are the V-1 grading-validation session for bb2dash. Read $brief in full, then $export.
$scope
Use ONLY the bb2dash MCP tools (list_courses, search_materials, get_material_text) as evidence. Never fill a gap from general knowledge; write 'not in materials'.
Write each course's verdict file to docs/planning/sprint-1-hub/verification/65_GRADING_VALIDATION_<course_id>.md using the table in the brief, and walk every open row with Stack before writing his call and his why.
"@

$allowed = @(
  "mcp__bb2dash__list_courses",
  "mcp__bb2dash__search_materials",
  "mcp__bb2dash__get_material_text",
  "Read(docs/planning/**)",
  "Glob(docs/planning/**)",
  "Grep(docs/planning/**)",
  "Write(docs/planning/sprint-1-hub/verification/65_GRADING_VALIDATION_*)"
) -join ","

$disallowed = @(
  "Bash", "PowerShell", "Edit", "MultiEdit", "NotebookEdit", "WebFetch", "WebSearch", "Agent",
  "mcp__plugin_supabase_supabase__*", "mcp__Supabase__*", "mcp__rag__*"
) -join ","

try {
  Push-Location $repoRoot
  & claude `
    --strict-mcp-config --mcp-config $tmp `
    --restricted --tools "Read,Write,Glob,Grep" `
    --allowedTools $allowed `
    --disallowedTools $disallowed `
    --append-system-prompt "You are confined to the bb2dash materials corpus and the validation documents. If a tool you need is unavailable, say so and stop; do not work around it." `
    $prompt
}
finally {
  Pop-Location
  Remove-Item -Path $tmp -Force -ErrorAction SilentlyContinue
}
