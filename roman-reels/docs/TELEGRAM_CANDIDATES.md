# Unreviewed candidates in Telegram — candidate, not deployed

Owner correction: Roman has not viewed or approved the proposed topics. Historical
dropdowns in the spreadsheet are not treated as his verified decisions. The
previous topic-migration proposal was not authorized or applied and is not input
for this feature.

## Behavior

New `Кандидаты тем` button / `/candidates` shows one editorial candidate per page:
title, business task, reference link, evidence caveat and
`Ожидает просмотра Романом. Тема не согласована.` No approve/start buttons.

The section reads only a local candidate catalog. It works while Google shared
review is disabled or unavailable. The menu still offers candidate navigation
if the Google approval read fails; no frozen production ticket is issued then.
Private operator/chat checks happen before reading catalog content.

This does not enable `ROMAN_SHARED_REVIEW_ENABLED`, register topic packets, change
spreadsheet rows, import old marks, grant approvals, fill the production queue,
generate scripts, create avatars or run montage. Existing live Google approval
readers and start-ticket checks remain authoritative and unchanged. Candidate
metadata cannot be passed as a production approval manifest.

## Data contract

`catalogVersion=1.0.0`, `reviewApprovalGranted=false`, `generationAllowed=false`,
`renderAllowed=false`, at most90 `topics`, at most64KiB total. Every topic has exact
fields `candidateId`, `title`, `businessTask`, `referenceUrl`, `evidenceNote`,
`reviewStatus=awaiting_roman_review`. Lengths and duplicate IDs are checked;
only HTTPS references to Instagram/TikTok/YouTube, with no embedded credentials,
are accepted. Links are displayed, not automatically visited. Evidence text is
operator-supplied, not a new claim of verified views, free tools or effectiveness.

The prepared private catalog contains two previously proposed candidates, both
unreviewed according to the owner. Real candidate contents/Drive identifiers
remain outside Git. Offline fixtures are fictional. This is an editorial list
reflecting that owner declaration, not a live record of Roman reading messages.
After his decision, refresh the catalog explicitly and verify it against live
review data; do not continue treating old candidate annotations as current facts.

## Installation after owner permission

1. Merge this PR into feature/codex-pipeline and update Windows fast-forward.
   Existing bot remains on its current code until a controlled restart.
2. Download the exact prepared JSON privately via the owner's existing Drive
   uploader OAuth; verify the separately provided SHA256 before installation.
   Never copy cookies/cloud secrets. Do not use the old topic-migration packet.
3. From roman-reels, explicitly install the downloaded candidate file:

```powershell
node scripts/install-telegram-candidates.mjs <downloaded-file.json>
```

This copies validated bytes to
`%LOCALAPPDATA%\RomanReels\telegram-panel\candidate-topics.json`. No network or
bot launch. Identical repeats return already_installed; a different existing file
is blocked, never overwritten. Partial/unreadable data fails closed and requires
inspection rather than silent reset. Original download is not deleted.

4. Restart only the verified tracked bot, preserving config/DB/cursor and existing
   process-only deployment flag. Validate owned stale lock before removal as in
   TELEGRAM_RECOVERY.md; no second poller or unrelated process changes.
5. Owner opens `/start` then `Кандидаты тем`. Expected: two unreviewed cards and
   reference links, no generation/approval buttons. Existing approval screen still
   truthfully reports disabled Google shared review. Google/autostart unchanged.

Non-Windows trusted coordinator may explicitly set
`ROMAN_TELEGRAM_CANDIDATES_PATH`; otherwise this section reports unavailable. The
Windows runtime uses the pinned private profile path, not another token or service.

## Verification

Seven new offline tests cover disabled/unavailable Google, unauthorized access,
approval/command injection, inability to start from candidate data, pagination,
bounded invalid-file handling and actual filesystem install/replay/conflict.
Panel11 and polling recovery8 pass locally. Linux/Windows CI run the new suite.
No live bot, queue, Google settings or topic registrations changed by root.
