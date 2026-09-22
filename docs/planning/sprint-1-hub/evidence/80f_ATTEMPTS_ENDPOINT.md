# Phase 12b · G-7a — the attempts endpoint a student session can read

Discovery 2026-09-17, PM session in Playwright, Stack signed in to Blackboard Ultra himself.
Method: opened IST.352 → Gradebook → "Research - Role of Systems Analyst" (GRADED, one submitted
attempt) and read the requests Blackboard's own page made. Only key names and statuses were kept;
the captured bodies (his submission text and the instructor's feedback) were deleted in the same
sitting.

## Why v3 found nothing

v3 asks `GET /learn/api/v1/courses/<c>/gradebook/columns/<col>/attempts?userId=<me>&limit=100`.
For a student that answers `200 {"results": []}` on every column (21 of 21 in crawl `1b5e8da5`).
Blackboard's own UI never calls it. It walks **column → grade → attempts → attempt detail**.

## The chain Blackboard's UI uses (all `GET`, all `200` for a student)

1. **Grade row for me on a column**
   `/learn/api/v1/courses/<c>/gradebook/columns/<col>/grades?expand=attemptsLeft&userId=<me>`
   → `results[0]`: `id` (the **grade id**), `status` (`GRADED`), `firstAttemptId`,
   `lastAttemptId`, `highestAttemptId`, `lowestAttemptId`, `lastAttemptUrl`, `attemptsLeft`,
   `effectiveScore`, `pointsPossible`, `displayGrade{score,isOverride}`, `isExempt`,
   `instructorFeedback{rawText,displayText}`, `manualGrade`, `manualStatus`.
   (The course-wide list the gradebook page uses —
   `/gradebook/grades?userId=<me>&expand=lastAttempt,attemptsLeft,submissionStatus,…` — is what
   the crawler already reads for `bb_gradebook`; it does not carry the grade `id` in the fields
   we keep, so step 1 is per column.)
2. **Attempts under that grade**
   `/learn/api/v1/courses/<c>/gradebook/columns/<col>/grades/<gradeId>/attempts`
   (the UI adds `?fields=id,status,attemptDate,exempt,overrideStatus`)
   → `results[]`: `id`, `status` (`COMPLETED`), `attemptDate`, `exempt`, `overrideStatus`;
   `paging`, `permissions{viewAttempt…}`.
3. **Attempt detail, with the files**
   `/learn/api/v1/courses/<c>/gradebook/attempts/<attemptId>?columnId=<col>&expand=toolAttemptDetail,attempts,attempts.toolAttemptDetail`
   → top-level keys: `id`, `gradeId`, `courseId`, `userId`, `status`, `attemptDate`,
   `creationDate`, `modifiedDate`, `attemptFirstGradedDate`, `attemptLastGradedDate`, `exempt`,
   `override`, `overrideStatus`, `readyToPost`, `displayGrade{score}`,
   `attemptReceipt{receiptId, submissionDate, submissionTotalSize, submissionType}`
   (`MANUALLY_SUBMITTED`), `studentSubmission{rawText, displayText}`,
   **`studentSubmissionFiles[]`**: `id`, `name`, `linkName`, `fileType` (`STUDENT`),
   `bbFileUuid`, `hasErrors`, `file{fileName, mimeType, permanentUrl, existingFileReference,
   isMedia, forceDownload}`; `submissionHasFilePartsWithErrors`;
   `toolAttemptDetail["resource/x-bb-assessment"]{points, possiblePoints, status, assessment{…}}`.
   `file.permanentUrl` has the shape `https://blackboard.syracuse.edu/bbcswebdav/xid-<n>_1` and
   downloads with the session cookie — the same kind of URL bb-sync step 4 already pulls.
4. `/gradebook/attempts/<attemptId>/submissionResults` → `{}` for this item. Skip.

## What the crawler change is (W-30, `ingest/bb_crawler.js` → v4)

* For every column whose gradebook row shows a submission (`submissionStatus` not `UNOPENED` /
  `NO_STATUS`, or a `lastAttempt`), run steps 1 → 2 → 3. Keep the v3 envelope: one entry per
  column under `attempts`, with `endpoint`, `status`, a `keys` list per response, and now
  `grade`, `attempts[]` and `detail[]` payloads. Bound it: newest `N` attempts per column
  (default 3), one request at a time, as today.
* `stage_attempts` (050/055) reads: attempt `id`, `status`, `attemptDate`,
  `attemptReceipt.submissionDate`, `displayGrade.score`, and per file `name` / `file.fileName`,
  `file.mimeType`, `file.permanentUrl`, `bbFileUuid`. The candidate key lists from v3 are cut to
  these names. A fixture with this exact shape, values invented, goes under
  `db/fixtures/phase12b/`.
* `studentSubmission.rawText` (typed-in submissions) and `instructorFeedback` are text Stack
  wrote or received; store them only in `bb_attempts.raw` (owner-only), never in a log line.
* Note for the skill: `fetch`/XHR issued from Playwright's `evaluate` on the Ultra shell page
  failed with a network error in this sitting while the page's own requests succeeded; the crawl
  ran fine the same morning, so check this before blaming the endpoint if v4 sees status 0.
