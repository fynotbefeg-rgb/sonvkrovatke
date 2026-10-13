# Manual fictional cloud delivery probe — prepared, not deployed

This fills the missing cloud publisher for one bounded transport test. It does not connect the Windows
production queue/outbox to GitHub, approve topics, generate avatars, upload sources or run montage.
The bot and Windows runtime are not restarted or reconfigured by this workflow.

## Entry and permissions

Use the existing registered `roman-reels-check.yml` workflow on `feature/codex-pipeline` only.
`windows_delivery_probe` defaults to false. When true, every existing service/production/check job is
skipped; only the probe can run. It has a fixed `roman-windows-delivery-writer` concurrency group and
`cancel-in-progress: false`. Any future mailbox publisher must share that same group. This is one
serialized writer, not a transaction across Drive files or a production queue.

The existing `GDRIVE_SA_JSON` secret stays in Actions; it is never copied to Windows. Configure three
private repository variables from the verified local configs, not from guesses:

- `ROMAN_WINDOWS_DELIVERY_FILE_ID`: existing mailbox file.
- `ROMAN_WINDOWS_DELIVERY_FOLDER_ID`: its `_windows-jobs` parent in project assets.
- `ROMAN_WINDOWS_DELIVERY_ACK_FILE_ID`: existing acknowledgement file.

No actual identifiers are committed in this candidate. Missing/aliased/invalid IDs are refused before
OAuth. The account needs writer access only to the mailbox and reader access to its folder and ack file.
No files or permissions are created by the probe. No live variable or secret has been changed here.

## One technical exchange

After owner authorizes deployment and the bounded test:

1. Manually dispatch with `windows_delivery_probe=true`, action `inspect`. Confirm mailbox empty and
   account reads both pinned slots. Initial ack is `{"ackVersion":"1.0.0","status":"empty"}`.
2. Dispatch action `publish_fixture`. It publishes only the hard-coded fictional `transport-test`
   plan from `windows-delivery-probe.mjs`, all texts synthetic, all approval statuses pending, all
   generation/upload/render permissions false. Paths under `C:\RomanReels\transport-test-only` are
   data only; no media or folders are created there. The envelope lifetime is 15 minutes.
3. On Windows within that lifetime, run `node scripts/ack-windows-plan.mjs`, then run it again as a new
   process. Expected: `received`/`acknowledged`, then `already_received`/`already_acknowledged`; same bytes,
   one staged directory and one local acknowledgement. Do not restart the bot or turn on a scheduler.
4. Dispatch action `inspect`. Expected: `acknowledged=true` for the exact current envelope.
5. Only then dispatch `clear_acknowledged_fixture`. Same writer restores the mailbox's exact empty JSON;
   cloud and local acknowledgement records, local packet, and logs remain untouched. Confirm empty.

Until receipt, publication repeats reuse an unexpired envelope; an expired identical plan may be renewed.
After receipt, repeats never renew the envelope. An old receipt cannot acknowledge renewed bytes.
Any valid real or modified plan, malformed slot, changed metadata, wrong checksum or authentication
failure blocks the probe. Cleanup is refused without an exact matching receipt for this fixed fixture.
Ambiguous writes are never blindly retried: next invocation inspects actual bytes before deciding;
a repeated cleanup after lost response reports `already_empty`, without another write.

The workflow emits only status and false permission flags. It uploads no credential, script, Drive ID,
config or private artifact. Tests: eight offline Fake Drive cases plus existing publisher and receiver
suites. Linux and Windows CI run the probe and publisher tests. Real service access/exchange remains
unverified until this controlled test is explicitly executed.

## Separate remaining work

The queue bridge's outbox-to-cloud transport is still missing. This fixture workflow cannot take
arbitrary scripts, paths, file IDs or production plans as dispatch input. No topic is currently approved.
The Windows supervisor and startup task require their own release and live verification; signing into
Windows after a reboot remains necessary for DPAPI CurrentUser access.
