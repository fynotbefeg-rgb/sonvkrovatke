# Telegram production panel — candidate, not deployed

Owner goal: start approved work with one button, see Roman's decisions and see
which videos are actually being created. This change adds the authenticated
Telegram transport and panel around the existing SQLite production queue.
It is not a completed autonomous video factory.

## Implemented behavior

- `/start` or `/run`: a menu and, when current Google approvals exist, one short
  `Запустить` ticket for up to ninety approved variants. No approval data in callback.
- Button: re-read Google, verify the frozen revisions/hashes, atomically enqueue
  through existing `handleVerifiedStart` / `ProductionQueue`. It never approves
  on Roman's behalf. Repeat delivery, double click and restart do not duplicate jobs.
- `/approvals`: paginate the current approved variant IDs/revisions, ten per page.
  No full scripts or approver identities are sent to Telegram.
- `/production`: paginate this coordinator's actual jobs. Existing states are
  waiting for source files or waiting for a Windows worker. They are explicitly
  shown as waiting, never as active avatar generation or montage.

Original source limitation: `get_production_queue` contains only approved
variants. It cannot distinguish rejected items from items awaiting a decision,
and it does not expose the separate topic/body/hook review statuses. The panel
states this limitation. No pending/rejected decision is inferred from absence.
Full component status needs a new authenticated read-only Google contract and a
separate reviewed deployment. The candidate in REVIEW_STATUS_PANEL.md adds this
display endpoint and runtime reader; it still requires a Google deployment and
bot update before those statuses are available live.

The button currently **queues waiting work only**. It does not publish a Windows
source plan, create speech in HeyGen, upload sources, finalize a receipt, render,
or expose finished links. Runtime worker state and output/result links are not
connected. There are no fabricated `rendering`/`done` statuses or fake links.
The queue's current per-variant manual provider also does not by itself implement
the new shared-body four-part worker. That integration remains separate.

## Authentication and durable delivery

`telegram-bot-api.mjs` talks only to fixed `https://api.telegram.org` Bot API
methods through POST, rejects redirects, bounds response bytes, and removes
token-containing details from errors. The transport does not retry its own calls.
The candidate in TELEGRAM_RECOVERY.md retries whole polling cycles for transient
errors in continuous mode, retaining cursor/queue guards; one-poll probes and
terminal errors still stop. `getUpdates` allows only messages and callbacks, twenty per poll.

Only objects actually returned by that authenticated polling instance gain local
WeakSet provenance; copied objects or arbitrary HTTP JSON are rejected by the
panel. Authorized numeric operator IDs and private same-user chats are required.
Unknown senders get no response and no private data. This is not an HTTP webhook
handler and there is no public listener or open port.

SQLite retains the polling cursor by authenticated bot ID. The cursor advances
only after handling and replies complete. A lost reply can replay the event,
but queue production keys and callback receipts prevent another job. A status
message may be sent again after a lost response; Telegram message delivery is
not claimed to be exactly once. Start receipts do not substitute for fresh
approval verification on a later worker claim.

## Runtime setup — choose and approve the coordinator first

No token, operator IDs, host, startup task, webhook or live bot has been configured.
This PR makes no live Telegram call. The owner may create a bot in BotFather;
share only its public username in chat. Enter its token privately at deployment.

The bot must run on one persistent trusted coordinator with the existing protected
Google approval access. Do not run SQLite on disposable Actions runners, synchronize
it with Drive, or copy GitHub/cloud secrets onto Windows. Windows' uploader OAuth
does not automatically authenticate the Apps Script approval endpoint. Selecting
a host and a permitted approval-access path is required before deployment; the
entrypoint intentionally refuses Actions and unapproved deployment.

After agreement, the coordinator requires these private environment settings:

- `TELEGRAM_BOT_TOKEN` and comma-separated `TELEGRAM_OPERATOR_IDS`;
- existing `ROMAN_REELS_WEBHOOK_URL` / `ROMAN_REELS_WEBHOOK_TOKEN`;
- `ROMAN_TELEGRAM_QUEUE_PATH`: absolute private persistent `.sqlite` path;
- `ROMAN_TELEGRAM_DEPLOYMENT_APPROVED=true` only after deployment approval.

Node >=22.13. The database contains stored approved scripts; keep it and backups
private and outside Git/Actions artifacts. A process lock allows one polling
instance for the database. An interrupted process can leave a stale lock; inspect
before manually removing it. No recovery routine silently clears locks or DBs.

Explicit one-poll probe:

```sh
node roman-reels/scripts/run-telegram-panel.mjs --once
```

Explicit foreground long-poll coordinator:

```sh
node roman-reels/scripts/run-telegram-panel.mjs --serve
```

Neither command installs an automatic startup task. On Telegram/Google failure
there is no saved approval fallback. Stop the foreground process to stop polling;
keep the DB for restart/dedup. No queue rows are deleted by these commands.

## Verification

Nine offline panel/transport tests cover trusted delivery, operator/private-chat
checks, frozen tickets, callback replays, approval withdrawal, empty/unavailable
Google, pagination/privacy, truthful waiting states, persistent cursor/restart,
lost responses and bounded/sanitized API failures. Twelve existing queue tests
still pass. Both are registered in the existing offline source CI, with no bot
token or live service credentials. Live Telegram login, polling, coordinator
deployment, full review statuses and video execution remain untested.

## Windows preparation (2026-10-13)

Use the owner's existing unattended laptop as the intended coordinator. Hosting
is no longer an open choice; live configuration and bot deployment are still
separate steps. The owner reported no locally configured protected queue access.
Uploader OAuth is not that access. Do not extract secrets from backups, snapshots,
GitHub or browser storage, and do not reset the Google webhook token.

`setup-windows-telegram.ps1` opens a local form for the owner to enter four fields:
the BotFather token, the owner's numeric Telegram ID, the existing Apps Script
deployment URL and its existing webhook token. The Google values must be supplied
by the owner from the live project's Manage deployments / Project settings →
Script properties (`ROMAN_REELS_WEBHOOK_TOKEN`). They must not be copied from
GitHub or placed in Claude/ChatGPT messages, command arguments or screenshots.
No permission to read or copy those values on the owner's behalf is inferred.

```powershell
powershell.exe -NoProfile -STA -File scripts/setup-windows-telegram.ps1
```

Run from `roman-reels`. Do not weaken execution policy if the script is blocked;
report the blocker. Claude must not inspect or screenshot a populated form.
Secret fields are masked. The form makes no network requests and writes only
DPAPI CurrentUser ciphertext to
`%LOCALAPPDATA%\RomanReels\telegram-panel\config.dpapi`; an existing config is
not overwritten. Closing without saving makes no config. The bot token is pinned
to the public identity `Factory_reels_bot` when getMe is eventually called.

The Node runtime can load this file directly without persisting secrets in
process/user/system environment variables. Same Windows user as setup is needed.

```powershell
node scripts/run-telegram-panel.mjs --windows-check-config
node scripts/run-telegram-panel.mjs --windows-check-access
```

The first command performs local validation only. The second only reads the
protected Google queue; neither calls Telegram, polls, creates the production DB,
changes Google, or activates execution. Output is counts/flags only.
After separate bot deployment approval, `--windows-once` / `--windows-serve`
use this config and a private local SQLite DB. They retain the explicit
`ROMAN_TELEGRAM_DEPLOYMENT_APPROVED=true` gate. No startup task is installed.

Windows test cleanup now closes all SQLite handles in one teardown before
deleting its temporary folder. Old temporary folders reported by the owner are
not deleted by this change. Dedicated Windows CI covers both affected tests,
configuration validation, a real DPAPI roundtrip using fake credentials, and
PowerShell syntax parsing. Real form interaction and owner credentials are not
tested by CI.
