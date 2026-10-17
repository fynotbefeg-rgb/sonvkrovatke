# Detailed review status — candidate, not installed in Google

The owner reported successful live Telegram polling on Windows after configuring
the local DPAPI file. The original panel only saw approved production variants.
This candidate adds a read-only component-status endpoint and connects it to the
existing `Утверждения Романа` button. No second bot, queue or approval system.

## Google contract

Authenticated POST action `get_review_status_snapshot`, using the existing token.
Response: version/source/capture time, enabled flag, at most ninety registered
topics, `approvalWrites=false`, `productionAllowed=false`. Each topic contains
its ID, short title (160 characters), revision, topic-only/shared kind, and the
five statuses `topic`, `body`, `hook1`, `hook2`, `hook3`. No full speech, approver
identities, receipt hashes, private row bindings or Script Properties are exported.
The response is capped at 200 KB. Disabled review returns enabled=false/topics=[].

| Status | Panel meaning |
|---|---|
| approved | Current matching receipt from an allowed approver, not in the future |
| pending | Empty decision field, awaiting a decision |
| not_approved | `Не утверждено` currently in the table; rejection author not verified |
| unverified | Unknown decision or `Утверждено` without current trusted receipt |
| binding_changed | Registered packet no longer matches the table or current topic selection |
| not_created | Body/hooks do not exist for this topic-only revision yet |

Negative edits have no named rejection receipt in the current contract. The bot
does not claim that Roman personally rejected a negative dropdown. A changed
shared packet blocks the bound component display rather than borrowing old
approvals. A newer topic-only revision replaces the older shared revision in the
view; old body/hook approvals are not shown for the new topic. Withdrawal of the
standalone topic overrides its previously copied shared approval.

Reads use the existing lock, but perform no sheet/property writes, cleanup,
approval grants, trigger changes or feature-toggle changes. An edit detected
between reads yields binding_changed. This is a point-in-time display only:
its metadata is never accepted as a production manifest or ticket authority.
Existing production queue/read/start logic is unchanged.

## Bot behavior

The new runtime injects `readReviewStatuses` into the existing panel. Five topics
per page; each shows the topic, body and three hook statuses. A disabled feature,
empty registry or unavailable endpoint is explained explicitly. Failure never
means all topics were rejected and never falls back to a saved snapshot. Old
direct panel callers without this reader retain their approved-variants view.
The new reader verifies exact schema, capture freshness, duplicate IDs, component
states, false permission flags, byte cap and fixed Google response-only redirects.
Webhook token/body are not forwarded to Googleusercontent. No automatic retries.

## Reviewed installation plan — owner permission required

1. Merge the candidate PR only with owner's permission. The owner's laptop is
   the existing host. No real bot/process/Google update has been performed here.
2. Claude checks the live project and creates a fresh local backup outside Git.
   Compare live `RomanApproval.gs` and `SharedReview.gs` to the expected source
   from base e703a135fc3c4eade2a78b10020aafd787b10f75. If they differ, stop and
   prepare a new review; do not overwrite unknown changes. Code.gs in the live
   project stays unchanged: it uses the already-installed addon wrapper. The
   repository Code.gs change preserves the standalone installer contract only.
3. After separate Google update permission, replace only those two files, verify
   saved source hashes, then create a new version of the same existing deployment.
   Keep its URL, execute-as/access settings, flags, rows, approvals and triggers.
   Record previous version privately for rollback. No secret values in reports.
4. Read the new endpoint through existing local credentials, counts/flags only.
   Check the original queue still responds. Do not fabricate review rows or
   approvals to make this live check nonempty. Empty/disabled is a valid result;
   actual current state must be read, not inferred from queue count.
5. Update Windows only fast-forward, then restart only the tracked bot process
   after verifying its identity. Preserve DPAPI config, SQLite DB and cursor.
   A force-stopped old runtime can leave production.sqlite.lock: confirm its
   recorded process is stopped and no other bot uses the DB before reporting or
   removing that one stale lock under restart authorization. Never clear a live
   lock, reset the DB or start a second poller. Other files/processes stay intact.
6. Owner tests the existing approval button from the phone. No generation,
   avatar provider, source upload, montage or startup task is activated.

Rollback: restore only the two backed-up Google source files, select the previous
deployment version, and run the previous bot code if needed. Preserve all runtime
state and report the actual result. If permission review blocks an operation,
report it instead of attempting another route around the rejection.

## Evidence

Offline new Google/reader tests: 8 (the harness also runs 10 existing approval
tests). Panel: 11, including two detailed-view tests. Shared-review25,
topic-only24, approved planner8 passed locally. Actual Google deployment,
nonempty live component display and bot restart remain untested. Offline CI
covers Google contract and Windows panel compatibility; no real credentials.
