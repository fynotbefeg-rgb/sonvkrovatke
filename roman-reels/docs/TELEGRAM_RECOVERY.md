# Telegram polling recovery — candidate, not deployed

The owner confirmed the live status button correctly reports disabled Google
review. Claude reported the previous poller exited after 153 cycles with a generic
error, and a new process is running the clock-skew branch. The precise cause of
the previous exit is unknown; no claim that it was definitely network failure.

This candidate includes PR32's reviewed display-clock fix and adds recovery to
the existing poller. It changes no Google files, feature flags, credentials,
database format, approval policy, avatar generation, upload or rendering.

## Recovery policy

Continuous `--serve` / `--windows-serve` modes recover from network errors and
HTTP 500/502/503/504. Delays grow 1, 2, 4, 8, 16, then 30 seconds maximum, reset
after a successful poll. The process keeps its DB lock: no second worker spawned.
HTTP429 honors valid `retry_after` up to five minutes; absent values default to
thirty seconds. If Telegram requests more than five minutes, stop and report
`rate_limit_deferred` rather than retry earlier than requested.

401,403,409, other invalid requests, bad identity, malformed/oversized data and
configuration/state errors stop. No token reset, webhook deletion, permission
change or automatic lock clearing. `--once` modes remain fail-fast with no retry.

The transport itself does not blindly resend individual writes. The controller
replays a poll from the unchanged durable cursor after transient failure. Each
callback rechecks current approvals; queue production keys/callback receipts
prevent another job. Cursor advances only after handling/reply completes. Reply
messages can repeat after an ambiguous lost response; message delivery is not
claimed to be exactly once. An expired ticket still blocks; existing waiting
jobs remain and workers must verify approval again before any real execution.

One exact Telegram400 response for an expired `answerCallbackQuery` is ignored
because it only acknowledges a spinner. It does not skip operator authentication,
ticket expiry or approval recheck. Other400 responses still stop.

## Diagnostics

Only whitelisted metadata is logged, never URLs, tokens, raw descriptions, full
exceptions or approved text:

- `telegram_identity_verified`: getMe passed expected bot identity;
- `telegram_poll_completed`: processed update count;
- `telegram_retry_wait`: category, HTTP status, method, safe network code,
  consecutive failure count and wait duration;
- `telegram_stopped`: sanitized terminal category and false execution flags.

Diagnostic categories distinguish network/rate limit/server failure from invalid
token, access denied, polling conflict and protocol/configuration errors. This
enables a useful operator report without exposing credentials in command output.

## Installation after owner approval

Merge this PR into feature/codex-pipeline; it includes PR32's ancestor commit, so
do not duplicate the clock fix. Update Windows fast-forward only. Preserve private
DPAPI configuration, SQLite data/cursor and Google Version6/flags. Verify and stop
only the tracked old bot process (last reported PID8044, recheck before stopping).
If a lock remains, confirm its recorded process is gone and no other bot uses the
DB before removing that one stale lock under restart authorization. Do not reset
the database, stop unrelated Node/MCP processes or start two pollers.

Start the same `--windows-serve` command with the existing process-only deployment
approval flag. Verify identity/poll events and phone commands. Do not disable the
network/firewall for a live fault test; offline fault tests already exercise the
retry and replay path. Keep remote access available.

This is recovery within a running process, not Windows startup or a service
watchdog. Sleep, logout, process crash or Windows reboot still need restoration.
No startup task or change to Windows login/power settings is included.

## Verification

Eight offline recovery tests: startup recovery, bounded/reset backoff, rate-limit
respect, fatal statuses/protocol, one-poll fail-fast, lost reply and approval
revocation with one job, exact expired acknowledgement, sanitized diagnostics.
Panel11 and private-config4 pass locally (real DPAPI test Windows-only).
Linux and actual Windows CI run the recovery tests with synthetic credentials.
No live bot/process, Google, credential or production changes made by root.
