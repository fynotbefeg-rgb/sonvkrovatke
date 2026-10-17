# Windows source-plan delivery candidate

Status: code and offline tests only. No Drive configuration, cloud publishing workflow,
Windows startup task, avatar generation or montage has been enabled.

The planning adapter merged in PR27 can prepare four explicit upload jobs after a
fresh authenticated approval read. This candidate transports that data to Windows.
It does not make a saved plan an approval authority. Before execution, a controller
must recheck current approvals and bind actual source files to their text hashes.

## Proposed private mailbox — owner approval required before setup

Use one user-owned file `assets/_windows-jobs/source-plan-v1.json`. The initial
contents are exactly:

```json
{"deliveryVersion":"1.0.0","status":"empty","generationAllowed":false,"renderAllowed":false}
```

The existing cloud service account
`roman-reels-render@roman-reels.iam.gserviceaccount.com` needs reader access to the
new `_windows-jobs` folder and writer access to this file only. No public sharing.
The file must be created by the owner: the service account cannot create files in
the owner's My Drive using its own storage quota. Do not assume inherited access
to assets. No existing permissions or incoming files are changed.

Windows uses the uploader's existing owner OAuth token protected with DPAPI.
Browser login is not API authentication. No cookies, GitHub credentials or cloud
webhook secrets are copied to Windows.

## Cloud side

`buildDelivery(plan)` in `windows-plan-delivery.mjs` wraps a validated planner result
with an integrity hash and a five-minute lifetime (maximum fifteen minutes). The
hash detects corruption; it is not a signature or an approval receipt. The producer
must call it immediately after planning from a fresh authenticated approval read.

`publish-windows-plan.py <delivery.json>` requires a configured serialized Actions
writer, the existing `GDRIVE_SA_JSON` credential, and the two pinned IDs in
`ROMAN_WINDOWS_DELIVERY_FILE_ID` / `ROMAN_WINDOWS_DELIVERY_FOLDER_ID`. It only
updates the existing mailbox and checks its location, metadata, bytes and readback.
The serialized workflow/concurrency group has not been configured. Setting
`ROMAN_DELIVERY_SINGLE_WRITER=true` alone does not provide cross-process locking.

This is a **single outstanding plan pilot**, not a queue for ninety videos. A
different pending plan is blocked even after expiry. The same plan may be renewed;
an identical retry performs no write. After an ambiguous write failure, inspect
and reconcile the mailbox before retrying. There is no acknowledgement, automatic
clear, next-plan advance, or production queue replacement in this candidate.

## Windows side

After setup approval, put only the raw IDs into the local file
`%LOCALAPPDATA%\RomanReels\source-uploader\delivery-config.json`:

```json
{"fileId":"OWNER_CREATED_FILE_ID","folderId":"OWNER_CREATED_FOLDER_ID"}
```

From `roman-reels`, run once:

```powershell
node scripts/receive-windows-plan.mjs
```

It reads a maximum of 64 KiB and verifies the pinned file, folder, checksums,
unchanged metadata, expiry and exact packet/job fields. Jobs are data, not commands.
Windows paths are validated correctly even when envelopes are built on Linux.
The local destination is
`%LOCALAPPDATA%\RomanReels\source-uploader\received-plans\<deliveryId>\`,
separate from active uploader jobs. It contains `payload.json`, `packet.json`,
`delivery.json` and four files in `jobs` (`body`, `hook-1`, `hook-2`, `hook-3`).
All execution flags remain false. A completed replay checks existing data and
returns `already_received`; it does not create another directory.

Empty mailbox returns `waiting`. Authentication errors, expired or modified data
stop the run. A crash can leave a `.partial` directory or stale `receive.lock`;
the receiver stops rather than clearing those automatically. Recovery must inspect
the local state explicitly. The receiver makes no Drive writes and never invokes
HeyGen, the uploader, receipt finalizer, renderer, or an automatic startup task.

## Verification and next boundary

Offline receiver tests: 10. Offline publisher tests: 5. Fake Drive checks cover
restarts, corrupt bytes, changed metadata, conflicting plans, lost responses,
expiry, Windows path aliases and the read-only bounded transport. Existing
planner/uploader/receipt tests are retained. No real mailbox has been tested.

Next: agree this mailbox and minimal permissions, configure it, then run an empty
mailbox read and one synthetic staging/replay test. Do not activate production or
generate an avatar during that test. A later execution controller, fresh approval
recheck and acknowledged queue progression remain separate work.
