# bb2dash :: scripts/validate-grading.ps1
# Wrapper kept so the documented command keeps working (82 decision #16). The launcher itself is
# scripts/validate-grading.mjs (brief 96 task 3): it reads ~/.claude.json with JSON.parse, confines
# the session with --restricted and the permission rules, and runs claude from the repo root.
#
#   .\scripts\validate-grading.ps1             # every course, in the brief's order
#   .\scripts\validate-grading.ps1 IST.466     # one course
#   .\scripts\validate-grading.ps1 --dry-run IST.323

node "$PSScriptRoot/validate-grading.mjs" @args
exit $LASTEXITCODE
