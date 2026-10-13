# Codex handoff — Roman Reels automation
Updated: 2026-10-10

## Authoritative specification 3.0 — start here

LATEST Drive intake: DRIVE_AUTOMATIC_INTAKE.md. Existing GDRIVE_SA_JSON reader
confirmed incoming access on Actions; writer granted only to user-owned state JSON
1hOa9obXHrlj-BKQw9vTfHYoUJ6gp5EYP under assets/_pipeline-state. No new secrets.
New bounded scan downloads by ID, verifies Drive MD5/metadata, receipt revision/text
hashes/SHA/decode and persists source-set handoffs. No render/generation performed.
API returned no ETag; ONLY serialized Actions writer plus journal content-hash
readback guard, not a distributed CAS. Do not allow Windows to write this ledger.
Transient retries capped at 3; leases persist; revoked/missing full approvals block
ready handoff. renderAllowed=false always. Fixed two-topic editorial registry remains.
Real isolated six-MP4+receipt fixture downloaded/validated; synthetic approval forbidden.
Default branch is main. Draft PR #7 contains only a three-hour schedule dispatcher,
feature/roman-intake-scheduler, 9da0b6a. No main changes/merge/schedule enabled.
OWNER PERMISSION needed for that one file because of explicit main restriction.
See research/drive-intake-integration-report.json for repeat and CI evidence.

LATEST: six-part DEVELOPMENT intake/assembly implemented, INCOMING_SIX_PARTS.md.
Native Drive incoming created/verified: 1Qs3YJQB9Hr8H7B0Fa7MWlwsQ0LLGBPoQ inside
existing assets folder; empty, not connected to Actions/rclone/watchers yet.
New source-set-v2.schema.json is opt-in; v1 unchanged. Incoming receipt binds
topic/revision/exact text hashes and MP4 checksums; complete six-part media decode
and unique path/bytes checks precede assembly. Three hooks + shared body + two
platform endings produce six QC-checked development sources, never overwrite.
prepare-assembled-jobs supports both formats; v2 requires both real ending speech
artifacts and offsets their words/segments after body. Factory contract v1 stays
unchanged (platform suffix in topicId); approval remains pending, provenance sidecar.
Two exact recording layouts prepared, incoming-recording-layouts-v2.json.
Synthetic fixtures are not Roman recordings or speech verification; no new final
montage render, live production, Google approval, Telegram or HeyGen launch.
Source assembly and downstream contract jobs verified locally: 10 platform intake,
5 legacy assembly, 4 legacy job, 6 contract and 10 media Python tests; both JS
ending/shared-body suites pass. Evidence: research/six-part-intake-test-report.json.
Earlier "v1 only" notes are historical; full production integration remains absent.

Owner reports Roman approved platform endings (chat: Утвердил). Recorded all
four exact ending texts/hashes in research/platform-endings-approval-record.json;
scope is endings ONLY, source is owner relay, not authenticated bot identity.
Complete review pack ROMAN_RECORDING_TEXTS.md prepared with both bodies, six hooks
and approved endings. Live D5:D10 still blank at 12:01 UTC; no full-script approval
reported. Do not request voice recording until hooks/shared bodies are approved.
Existing full draft statuses and productionReady=false preserved. No paid calls.

Owner requests Instagram/TikTok-specific endings. Opt-in editorial builder
platform-ending-drafts.mjs prepared 12 pending full variants for two topics.
Same 3 hooks/body, separate ending/platform IDs and full-script hashes; TikTok
CTA requests DM keyword, never comments. Official ManyChat docs checked; no
Roman account capability or live automation verified. PLATFORM_ENDINGS.md.
FFmpeg concatenate supports optional third part; real media order/QC test passes.
6 ending + 3 shared-body + 5 source-set tests pass. Media source-set v1 and speech
adapter remain unchanged; full platform-ending render integration not completed.
Sheet C/B/D preserved, D5:D10 still blank at last read. No HeyGen/messages launched.

B5/B8 now read as Утверждено. After primary-source checks, Codex prepared
6 editorial hooks in C5:C10 and 2 shared-body drafts in
research/approved-topics-drafts-v1.json (not Gemini API-generated).
B decisions preserved; D decisions still blank; no canonical approval changes.
sharedBodyDrafts validates both sets and body hashes; full variants 128–136 words.
See SELECTED_TOPICS_RESEARCH.md for methods/sources and remaining research limits.
Live sheet-change automation is not wired; this was explicit one-shot completion.

Owner supplied Roman's voice-message screen recording; local CPU ASR completed
without paid APIs. Roman wants deep research of the selected business problem,
current alternatives, costs and practitioner examples BEFORE script generation.
Interest in two new themes is not exact-script approval. Owner separately says
Roman records his own voice for now; require three audio hooks + shared audio body
and verify allowed own-audio/avatar workflow in HeyGen before implementation.
See ROMAN_EDITORIAL_REQUIREMENTS.md. No synthetic voice or real HeyGen launched.

Owner requests autonomous reference discovery and handoff to Windows HeyGen,
then Claude's montage runtime. Reviewable integration proposal recorded in
AUTONOMOUS_PRODUCTION_FLOW.md and CODEX_TASKS.md. Weekly Apify cap $1,
monthly cap $5 APPROVED by owner 2026-10-10. Recurring scheduling and durable
budget guard are not yet deployed.
Existing $1 permission was one probe only. Four parts per topic -> three reels.
Simple Sheet gates/Telegram transport/durable cloud ledger remain disconnected;
HeyGen UI has policy_permission_required and Windows remains unavailable.

Apify requested for reference analysis. Read-only account access verified by successful
GitHub Actions run 38040963236, automation/roman-reels-v1; no Actor started.
APIFY_TOKEN absent locally, GitHub secrets cannot be read/listed by current integration,
but Actions can use the existing secret. No Apify connector found in plugin search.
Owner explicitly approved up to $1 including transcript and video. Bounded staged
collector implemented in scripts/apify-reference-research.mjs: two profile runs
at $0.10 each, then up to two selected Reel runs at $0.40 each. Metadata contains
no media add-ons; detail stage enables transcripts and downloaded videos.
Nine regression tests pass, including ambiguous POST/no retry and cap verification.
Manual opt-in Actions job on feature/codex-pipeline only; do not rerun paid stages
in a fresh workspace under this budget. Two references verified: speech and MP4 obtained, 20 frames inspected each.
See APIFY_REFERENCE_ANALYSIS.md and research/apify-reference-results.json.
Live simple Sheet A5:G10 now contains two topics, analysis, counters and links;
owner broadened topic 3 (A8/E8) to YouTube + Instagram + Telegram. Reference
remains YouTube-only; cross-platform content adaptation is our proposed angle.
B5/B8 blank and hook fields blank. No decisions or production status changed.
Metadata feed included collaborations owned by other accounts; initial strict check
failed after both paid runs. Read-only recovery preserved results, collector now
excludes mismatched owners. No paid stages repeated.
Public reach remains unavailable; transcript does not constitute montage inspection.

LATEST live review layout simplified at explicit owner request. Sole visible tab
is `Темы и хуки` (323200067), A:G: topic, topic decision, hook, hook decision,
reference analysis, metrics, URL. One topic = 3 rows; B/D accept Утверждено or
Не утверждено. Canonical texts/decisions unchanged; all old tabs preserved hidden.
Rows 2–4 existing rejected pilot, rows 5–7 SEO reference, rows 8–10 cross-platform topic.
No hook generation or production launch. NEW VIEW DECISIONS NOT YET CONNECTED
to Apps Script: do not treat hook approval as full-script approval. See SIMPLE_ROMAN_REVIEW.md.

New editorial requirement from Roman: select topics FIRST, each backed by analysis
and an external successful example; generate shared body + 3 hooks only for selected
topics. Topic selection is separate from exact-script approval and video launch.
Target fields/gates and implementation limits: TOPIC_SELECTION_WORKFLOW.md.
Owner approved creation of the topic tab. Live Sheets now has `Темы и примеры`
as the first tab, sheetId 128557826: 4 preliminary themes in A4:L7, decisions D,
comments E, reference verification K, planning month L. All unselected/unviewed;
source dates/limitations included. Existing scenario decisions were read before/after
as all three `На доработку` (supersedes older pending descriptions).
Runtime topic gates remain unimplemented; no approvals or scenario texts changed.

LATEST montage extension: Codex added opt-in word-anchored local interface images
to Claude's existing Director/RomanFactoryV1, without a schema migration.
Original business illustration (client message / draft reply) is explicitly marked demo,
not a Claude screenshot. Wrapper now preserves/checks visualAssets. All 27 TS tests,
27 Python checks and tsc pass. One full h1 development render passed QC (1080x1920,
25fps, 40.24s); original AAC PCM hash and audio clock preserved. h2/h3 plans unchanged
without assets, but not rerendered. Evidence/control frames in research/business-montage-v1.
Preview is in the test folder; Roman viewer permission not inherited. External Dan Martell
videos remain unviewed (YouTube fetch/network limitations), so no exact montage comparison
is claimed. See BUSINESS_MONTAGE_V1.md. Main, script text and approvals untouched.

LATEST: PR #6 merged into feature/codex-pipeline after independent re-review of Claude f45e50a.
Merge e1a7c31. C1 short-event blocker resolved by timing.ts helper used for accents/zoom.
tsc, 14 Director + 7 timing tests and 24 Python pipeline tests pass locally. No GitHub check-runs
exist for this SHA. Original AAC preservation retained. Main/approvals unchanged.
Details and remaining speech/visual review limits: CODEX_PR6_REVIEW.md.
Director/RomanFactoryV1 are integrated development components, not a production factory.

Initial PR #6 review, superseded above: Claude HEAD 9eff02d delivered Director/RomanFactoryV1 and 3 claimed renders.
Codex independently verified tsc, 14 Director tests, existing 21 Python checks, and full h1 render/QC.
Review found blocker C1: fixed envelope fade times become non-monotonic for short trimmed accents,
e.g. adjacent Claude/Gemini terms. C1 is now fixed; original reproduction: CODEX_PR6_REVIEW.md.
Codex fixed P1 source-audio preservation in the development wrapper: original AAC stream copy,
full decoded PCM hash + audio clock verification, no re-encoding; 10 media tests pass.
Actual h1 Remotion delay measured 42.625ms; corrected full h1 PCM/clock matches source exactly.
Evidence in research/first-montage-v1/codex-pr6-review; no production, Google write or paid call.

Live Google Sheet review layout updated at owner's request: first tab `3 хука + основа`
shows one shared body and three hook/status links. Test rows 2–4 removed from working `Сценарии`,
with a full hidden archive retained. Canonical pilot rows now 2–4, full texts remain literal F values;
technical columns hidden, existing G approval dropdown unchanged. Verified readback preserves texts
and decisions: knowledge-price h1/h2 pending, h3 redo. These are real pilot drafts, not approved scripts.
No component-level approval migration or messages/generation performed. See SHEETS_SHARED_BODY_REVIEW.md.

Latest user requirement: 3 separate hooks + ONE shared body. Implemented development FFmpeg source
assembly (assemble-source-set.py), source-set schema, local rr/incoming (video ignored by Git),
3 real assembled/QC-passed sources, and future Gemini common-body drafts builder. No paid Gemini run.
See SHARED_BODY_ASSEMBLY.md. Four assembly tests + three draft tests pass. Production and Drive
4-part intake are NOT wired; no approval bypass. Director receives assembled full video + verified timings.

Next completed step: real local hook ASR (14/18/10 words) combined with verified 81-word body cache.
`prepare-assembled-jobs.py` verifies original/output SHA, actual media, assembly geometry, intervals,
and produces three pending development contract jobs (95/99/91 words). Evidence and jobs live in
`research/first-montage-v1/assembled-jobs/`; see SHARED_BODY_ASSEMBLY.md for repeatable commands.
`check-assembly-audio.py` verified 18 decoded audio windows at exact part offsets (all >0.9997).
These are cached part timings with offsets, NOT a new ASR/forced alignment of assembled audio.
Four new assembled-job integration tests plus 7 media, 6 contract, 2 Claude packet tests pass.
Claude P1 task names the three complete inputs. Director/composition have since been delivered.
No production approval, paid request, upload or Sheets write was performed by this speech stage.

Owner agreed contract v1 and P1 after PR #5, 2026-10-10. New Codex work on feature/codex-pipeline:
81 real ASR words; zero-duration preposition blocked two raw attempts; one 23-word segment was
acoustically realigned by local Russian Wav2Vec2 CTC, no interpolation. Development job and source
technical QC pass. Precise benchmark/versions/limitations: FIRST_MONTAGE_P1.md.
Director and generalized Remotion are now integrated via PR #6; runner still blocks when missing.
Historical first-stage checks: seven media, six contract and two Claude packet tests passed.
prepare-claude-job now reads CLAUDE_P1_EXECUTION.md. No actual Claude run, upload, Sheets mutations,
HeyGen execution or paid model calls. GitHub variables read is 403; configured OAuth is unverified.
Cloud Claude access subsequently confirmed by the owner; PR #6 delivered and merged. No Windows setup required now.

Latest user specification supersedes conflicting role/approval/branch suggestions below.
Codex owns pipeline integration; Claude Code owns AI Montage Director and Remotion.
Approvals remain in existing Google Sheets; Telegram is the production start control, not a substitute identity receipt.
Windows is temporarily unavailable and is not the whole factory server. No HeyGen API.
Current HeyGen terms were checked: permission for the proposed UI workflow is not established;
real browser automation is gated pending a permissible basis. Manual MP4 intake/cloud work can continue.

Current audit baseline: `f3a4bfd` on `automation/roman-reels-v1`.
Documentation/candidate-contract work is isolated on `feature/codex-pipeline`, PR target automation;
Claude uses `feature/claude-montage` from the latest integration base. Never change main.
No production migration or paid generation was performed by this audit.

- [AUDIT_V3.md](AUDIT_V3.md): evidence, Actions runs, real MP4 and 8 existing TypeScript errors.
- [CLAUDE_TASKS.md](CLAUDE_TASKS.md) / [CODEX_TASKS.md](CODEX_TASKS.md): ownership and acceptance tests.
- [INTEGRATION_CONTRACT.md](INTEGRATION_CONTRACT.md): proposed schema 1.0.0, exact legacy hash preservation;
  offline validator and six synthetic tests, not a deployed production gate.
- [HEYGEN_BROWSER_AUTOMATION.md](HEYGEN_BROWSER_AUTOMATION.md) / [WINDOWS_SETUP.md](WINDOWS_SETUP.md): future worker and preparation.
- [ROADMAP.md](ROADMAP.md): first one-MP4 development montage, no publication or forged approval.

Validation: all 45 existing offline tests pass; Remotion bundle succeeds; tsc has 8 pre-existing errors.
`pv/public/ai/body1.mp4` passes full FFmpeg decode and has actual 1080×1920 video/AAC audio.
Real speech data and source technical QC are now delivered (see FIRST_MONTAGE_P1.md).
Director/generalized render/full output QC are still not delivered. Owner agreed contract v1 and P1;
next dependency is an authorized Claude Code connection, not another architecture approval.

## Codex continuation — 2026-10-10
- New manual/Windows queue CI verified: registered run `38019089716` on `6fecade` SUCCESS, only production-queue-tests job ran, 12 queue + 8 intake tests on Node22 passed. Claude/Google/Apify/Remotion jobs skipped. No live bot, credit-consuming generation or approval mutations performed. User's bot existence/public username question remains pending.
- User says no person can access Windows laptop now. Continue development **without laptop** and swap manual avatar upload to Windows UI provider later. Implemented SQLite production queue + transport-independent Telegram start controller: authenticated-server approvals injection, frozen short tickets, authorized private chat, atomic multi-version start/dedup callbacks, persistent production_key independent of provider, waiting-only provider switch. **No real Telegram transport, bot deployment, worker lease, HeyGen execution, download/render or Google approval writes.** All returned jobs blocked from render/generation. Twelve new tests + eight intake tests pass locally; registered workflow has isolated offline test_production_queue mode for Node22. Runtime DB excluded from Git. See AVATAR_PROVIDERS.md for strict hosting/storage/transport boundaries. Asked whether bot already exists, requesting only public username, never token.
- User confirmed remote laptop OS **Windows**. Remote-access software, connected execution channel, availability and browser session not confirmed. Do not imply Codex has an AnyDesk/RDP client or active access. Plan a local browser worker with authenticated outbound jobs, not credentials posted in chat.
- **Authoritative user correction:** Roman approves scripts AND hooks; full video production starts with a button in a Telegram bot. HeyGen will be automated through its normal UI on a remotely accessible laptop, **not via API**. Record/implement this target in TELEGRAM_LAPTOP_PIPELINE.md; manual iPhone export is fallback, not the final architecture. Telegram bot, authenticated Telegram decisions, laptop worker/access and persistent queue are NOT implemented. User has not yet specified laptop OS/access. Requested OS asynchronously. Place of approval (Telegram vs current Sheets) and allowed launch operator need confirmation before implementation. Do not forge Google-email receipts for Telegram events. Prepare/test UI without paid Generate; agree first bounded credit-consuming run. Avoid treating absent HeyGen API as permanently requiring manual work. Codespaces creation paused; laptop can also supply one-time Claude OAuth setup.
- User wants to stop copying prompts into Claude Code; confirmed **Pro/Max subscription**, not API key. Verified official Anthropic setup docs support CLAUDE_CODE_OAUTH_TOKEN via `claude setup-token`. Added **disabled-by-default** registered `run_claude_task` mode + reusable roman-claude-task.yml. Requires ROMAN_CLAUDE_ENABLED=true and OAuth secret; neither configured/verified. Fixed task packet derived offline from task01, two tests passed; YAML parsed/diff clean. Runtime pins CLI2.1.296, restricted+safe tools Read/Edit/Write/Glob/Grep only, no Bash/MCP/network tools; 20-turn/20-minute bounds are not a money cap. Local proposal scope pv/src + docs, no deletions/renames; outputs artifact patch, no automatic git writes. Needs one-time user-controlled OAuth setup in terminal and explicit first-run consent for subscription usage. Do not ask for auth tokens/codes in chat. No Claude/paid service was executed. See CLAUDE_CODE_AUTOMATION.md. No cron, no background Codex wakeup, not proven end-to-end automation.
- User clarified tool responsibilities: Claude Code writes Remotion/templates/Actions; Codex reviews/refines/tests. Recorded in `PROJECT_ROLES.md`. No direct connection to user's Claude Code session; do not claim a saved task was delivered or started.
- Rechecked `Сценарии!C5:D7,G5:K7`: all three knowledge-price pilots revision1 remain pending with empty H-J and waiting production state. Registered workflow read-only run `38017266712` on `19a11eb` SUCCESS, strict approved queue0. No drafts resent, no external paid services/render/approval writes. Need Roman's real decision; do not approve on his behalf.
- Prepared concrete Claude Code task `CLAUDE_CODE_TASK_01.md`: isolated full-MP4 Remotion component, validated local props/fresh word timing boundaries, caption display, preserving old compositions, offline checks, no paid calls/production gate changes. Scope allows independent development while pilot remains pending. User must pass the one-message task to their Claude Code; then Codex reviews actual resulting commit.

## Codex continuation — 2026-10-09
- User pasted additive RomanApproval.gs, reported renaming old doPost to legacyDoPost. Screenshot of setupRomanApproval log shows Connected: Сценарии, Approval edit trigger ready, Execution completed. User reported updating EXISTING deployment. Added send_pilot_drafts=false mode to registered check workflow; strict queue export now validates complete manifests (empty queue does not prove receipt enforcement). Ran `37988021113` on `a0cec9f`: SUCCESS, only google-queue executed, strict queue0 and 3 pending drafts imported without Gemini/Apify/HeyGen/Remotion. Connector readback verified exact A5:K7 against pilot JSON, all three pending with empty H-J and strict G dropdown preserved. Existing test rows2–4 unchanged. **Next: Roman personally reviews F5 and chooses G5 using allowlisted Google account; verify H-J receipt and authenticated queue, then revocation. Real editor identity and full queue shape remain unverified.** Do not approve on Roman's behalf or render yet.
- User screenshot confirmed approver property added; screenshot also exposed webhook token (never reproduce it). User reported rotation in Apps Script and GitHub. Verified current authenticated queue via new isolated `check_google_queue=true` mode of registered `roman-reels-check.yml`: run `37986175127`, commit `944008e`, SUCCESS, queue0, only google-queue ran; all paid/Remotion jobs skipped. Added additive installation alternative `../apps-script/RomanApproval.gs`, built by `build-approval-addon.mjs`, instructions `../apps-script/MOBILE_INSTALL.md`. Namespace isolates existing globals/helpers; user only renames old global doPost to legacyDoPost and adds one new file, then setup/deploy. Ten mock tests passed including coexistence with old globals/timers and rejection of legacy ready state without receipt. **Not remotely installed or redeployed**. Old manual queue function remains untrusted; new POST/new romanApprovalQueueV1 are the protected entrypoints. Need real editor identity test after deployment.
- User continued automation and confirmed Roman has **no GitHub account**. Keep Google as the approval interface; do not require a GitHub login. Added offline `prepare-script-review.mjs` and four tests: pending-only review snapshot, exact Unicode speech/hash, no approval metadata, literal Markdown rendering, new output directory required. Added one new editorial pilot, `knowledge-price`, three hooks/full speeches (121–124 words), all pending in `../research/roman-pilot-drafts.json` and `../research/roman-pilot-review/REVIEW.md`. Twelve review/intake tests passed. No Google writes, Gemini requests, Actor runs, HeyGen or renders. See `SCRIPT_REVIEW.md`. Need actual Roman Google email and workable Apps Script installation; neither is solved by the review packet. Full replacement remains undeployed. Earlier one-Reel Apify authorization is consumed.
- User explicitly approved one $0.05-capped test («Разрешаю»). It completed successfully: GitHub `37983894672` on `8bcf33aa3881ce0aed784b107bcb34d919256601`; Apify `ucmFFJAjXkoTgoT8s`, SUCCEEDED, owner founder.roman. Metadata: caption comparing ChatGPT/Claude building a site, published 2026-10-01, duration 62.74s, plays144/comments2/views null/likes0. See `ROMAN_FIRST_REEL_RESULT.md` and `../research/roman-first-reel-result.json`. Five tests passed. No full profile, transcripts, downloads, other Actor runs or Remotion started. approval consumed by this single run. usageTotalUsd0 is not proof of zero pay-per-event charges. Initial gh artifact download failed; connector download succeeded and archive materialized via authenticated file reference.
- User additionally supplied Instagram profile `founder.roman`; stored canonical URL and unverified first-Reel association in `../research/roman-instagram-source.json`. Public fetch throttled, no search results. This URL did not answer the pending explicit $0.05 paid test approval. Do not infer profile-scraping authorization or claim metadata/creator verified.
- User supplied first Roman Reel URL `https://www.instagram.com/reel/Dd-BrltxRS1/` instead of profile. Prepared `APIFY_ONE_REEL_TEST.md`, `../research/roman-first-reel-plan.json`, `apify-one-reel.mjs` and five offline tests. Official apify/instagram-reel-scraper accepts direct reel URLs. Estimated base cost $0.0036 (public Free-tier price), API cap $0.05, timeout 120s; no paid add-ons. Registered check workflow has collect_one_apify_reel=false by default. **No Actor run started; awaiting explicit confirmation of one $0.05-capped test.** Owner/content unverified after ordinary Instagram fetch was throttled. Do not guess creator or claim post analyzed. No automatic POST retries.
- User asked to analyze existing Roman videos instead of supplying new reference accounts. Added `PAST_REELS_ANALYSIS.md`: editorial analysis of four source topics/12 hooks, stored timing ranges, visual-template structure and six continuation topics with three draft hooks each. No Roman engagement/retention metrics found, no full MP4 playback performed; do not claim viral winners. Extracted existing IG/TikTok references to `../research/existing-references.json` without live scraping. Existing sources make user-supplied account lists unnecessary for initial research. No draft approvals, AI generation or Actor runs started.
- Apify account access **confirmed** after user updated APIFY_TOKEN: run `37977950725` on `c93dae8cbc45037b3a7dda966e6c13f3a5510eeb` succeeded; four tests passed on Actions Node 22 and log confirms account access with no Actors started. Initial run `37973225979` failed HTTP 401, now resolved. Do not ask for the token in chat. Remotion job skipped. Trigger registered `roman-reels-check.yml` with `check_apify_access=true` on the automation branch; separate new workflow is not registered on default branch. main unchanged. Actor/Dataset permissions, balance and limits are not verified.
- User restored the original Apps Script by removing the comment markers; functions appeared again. Prepared approval replacement is **not installed**. Avoid more whole-file mobile edits without a workable installation method.
- Roman supplied an Apify API token to the user (not present in workspace). Added read-only account access checker, four offline tests and manual `roman-apify-check.yml` (tests by default, access only with GitHub secret APIFY_TOKEN). See `APIFY_SETUP.md`. Actor/Dataset and sources remain unspecified; no paid Actor runs authorized or started by this integration.
- User supplied three Apps Script screenshots. Existing queue lacks topic/hook IDs, approval status, timestamp, approver and hash; production-ready marking only checks dropdown/status. Token-before-action and GET rejection are visible, but no trusted approval identity/snapshot is recorded.
- Prepared full replacement `../apps-script/Code.gs` with trusted approval receipts in Script Properties, allowlisted edit identity, complete queue schema, locking, draft validation and revocation. See `../apps-script/README.md` for install steps and limitations. **Not installed or redeployed remotely.** Requires verified `ROMAN_APPROVER_EMAILS`, setup of an installable edit trigger and real-world `e.user` validation. Do not guess the email or use the trigger owner's identity as fallback.
- Nine additional Apps Script mock tests passed (17 total with intake). The manual dry-run workflow now includes both suites. No Google Sheet production state was changed.
- Existing history cloned into `/workspace/sonvkrovatke` on `automation/roman-reels-v1`; `main` unchanged.
- Added metadata-only manual HeyGen intake planner, strict approval snapshot export, safety tests and manual `roman-manual-intake.yml` workflow (default tests; live needs verified incoming folder).
- Verified previous successful Gemini and render/upload Actions jobs and read Google Sheet/Drive; three visible test scripts remain pending. No new paid service calls or renders started.
- Fixed legacy `prep_topic.py` repo paths and ffmpeg discovery; it is not a safe production transcription gate.
- Read [MANUAL_HEYGEN_INTAKE.md](MANUAL_HEYGEN_INTAKE.md) for verified IDs, contracts, blockers and remaining production work. Apps Script deployment/identity and incoming-folder access remain unverified. Do not equate this dry-run planner with end-to-end automation.

## Mission
Build a reliable pipeline for **90 vertical Reels per month** for Roman. Roman approves the script and hooks; a **Telegram bot button** starts the approved production process. HeyGen generation is to be automated in the normal UI on a remote laptop, **without HeyGen API**. User works mainly from iPhone and prefers concise Russian steps. Laptop setup/access and bot are not implemented; do not claim full automation before actual end-to-end verification. See [TELEGRAM_LAPTOP_PIPELINE.md](TELEGRAM_LAPTOP_PIPELINE.md).

Tool responsibilities follow [PROJECT_ROLES.md](PROJECT_ROLES.md). Claude Code develops montage/Actions; Codex verifies, refines and tests those changes. Both use the automation branch and must check origin before writing.

## Repo and safety
- GitHub: https://github.com/fynotbefeg-rgb/sonvkrovatke
- Working branch: `automation/roman-reels-v1`; avoid changing `main` without explicit permission.
- Remotion project: `roman-reels/pv/`; composition registration: `src/Root.tsx`; Roman template: `src/RomanReel.tsx`; word-level timing data: `src/romanWords.json`.
- Existing working render workflow: `.github/workflows/roman-reels-render-test.yml` (previously rendered `R-manychat-h1` and uploaded MP4 to Drive using rclone).
- Gemini draft generation: `roman-reels/scripts/generate-gemini-drafts.mjs`, smoke workflow `.github/workflows/roman-gemini-smoke.yml`; `gemini-3-flash-preview` previously succeeded.
- Approval validator: `roman-reels/scripts/validate-approvals.mjs`.
- Read-only queue test: `roman-reels/scripts/check-production-queue.mjs`. User reported successful GitHub workflow run, logging `Approved production queue items: 0`.
- Do not leak credentials, dump tokens in logs, or bypass approvals.

## Google Sheets / Apps Script
- Script approval sheet: https://docs.google.com/spreadsheets/d/1DZVjhxTOlFZnVynDgeIUS5nXjVxxmZpsDZYeBiZ0XN0/edit
- Tab `Сценарии`: columns A–K = topic ID, hook number, version ID, script revision, hook text, full script text, Roman decision, approval date, approver, script hash, production status.
- Approval choices: `На проверке`, `Утверждено`, `На доработку`.
- Apps Script project: https://script.google.com/home/projects/1XxdsdAGLMf1IY15812fwW5EQp6MJoCgDm7J96H10h0xk_Hykd_utvnd1/edit
- Deployed web app endpoint (not secret): https://script.google.com/macros/s/AKfycbxyQ0Pqvjgt50P8ZqIzU_PPG0O0SmGG3xielLzjBJBclIvZueGxvTeidm5sDf1D3Y-UNg/exec
- App uses a token stored in Apps Script Properties (`ROMAN_REELS_WEBHOOK_TOKEN`) and matching GitHub Actions secret; never commit secret values.
- Existing Apps Script functions observed: `testConnection`, `doPost`, `checkApprovedScripts`, `checkProductionSafety`, `getApprovedProductionQueue`. There are two time-driven triggers for `checkApprovedScripts` and `checkProductionSafety`. Inspect actual code and permissions before extending.
- Latest manual `getApprovedProductionQueue` check: 0. Latest GitHub read-only queue check: 0. Do not interpret empty queue as end-to-end render validation.
- User manually tested changing approval and production statuses; returned them to safe state.

## Video generation and assets
- HeyGen has Roman's digital avatar and previously generated clips. **Do not use HeyGen API:** target is a browser/UI worker on a remotely accessible laptop. Manual generation/export through iPhone is only fallback while the laptop worker is not ready. Remote access alone is not proof of working UI automation; setup, account login/2FA, credits and one bounded test still need verification.
- One existing HeyGen MP4 was uploaded to the root of user's Google Drive, named `Видео аватара.mp4`. User was in the Google Drive **Move** dialog targeting folder `roman-reels-assets`; moving it was suggested but not yet confirmed.
- Source assets in repo `roman-reels/pv/public/`: `ai`, `ai2`, `face`, `fonts`, `rr/kanaly`. Under `rr/kanaly` are `h1.mp4`, `h2.mp4`.
- `RomanReel.tsx` defines topics like `kanaly`, `manychat`, `otvety` and phrase-anchored inserts; new scripts need corresponding speech video, accurate transcription/timestamps, and compatible insert logic. **Do not reuse old word timing data for new audio.**
- Finished render Drive folder: https://drive.google.com/drive/folders/118fywgyvKvd4Pf6XHW5i3dwN4HPJ8fdN
- GitHub rclone remote `roman-drive` uses `RCLONE_CONFIG` secret. Its Google OAuth app may be in testing mode with short refresh token life; verify before production reliance.

## Next Codex work (recommended)
1. Audit repo/workflows and inspect Apps Script implementation via accessible source or ask user for exported script if necessary. Identify all missing links between approved queue and Remotion input. Do not assume arbitrary Gemini scripts are compatible with static `RomanReel` topics.
2. Build the **Roman script+hook approval → Telegram start button → laptop HeyGen UI worker → Drive pickup → real word-timestamp transcription → compatible Remotion → QC/upload** pipeline with strict script/version mapping, persistent job locking and deduplication. No HeyGen API, no paid generation before agreed limits. Manual intake is fallback and retains current safety gates.
3. Implement first as **dry run/read-only** and then a **single approved test clip**. Never auto-render unapproved or altered scripts. Ensure approval hash validation, source-file checks, idempotence, retries, and safety status updates.
4. Consider a separate Drive `incoming` folder and an explicit file naming convention. Verify actual folder ID and access; do not guess.
5. Update README/status with verified milestones; distinguish tested components from planned ones.
6. Keep user-facing guidance in short Russian steps; Codex can make repo changes directly on the automation branch.

## Known caveats
- Google Sheet dropdown is not itself proof of approver identity; design robust authorization and script revision locking.
- Apps Script web app has an externally reachable URL; shared secret must be validated server-side.
- GitHub branch has diverged from `main`; avoid broad merges.
- Existing draft smoke test generates scripts; it is not evidence of complete 90-video production.

## 2026-10-10: расписание и замечания Романа

С разрешения владельца PR #7 слит в main: только dispatcher, merge
534f9cc39403a292d3bc563dd1a3639df004a251. Первый запуск dispatcher
38059552695 и child intake 38059561816 успешны. Проверка Drive каждые
3 часа; рендер/платные API не подключены, cron ещё не наблюдался.

Обе основы revision 1 отклонены по переданному скриншоту Telegram.
Это Codex editorial drafts, не Gemini-generation. Новые критерии и
история источников: ROMAN_REVISION_BRIEF.md. Реализован точный редакционный
запрет в intake; старые body/fullscript не продвигаются даже при наличии
старых approval records. Исходные версии сохранены; Google topic/hook
choices и owner-relayed ending approval не изменены. Google Doc для
Романа помечен «На доработке». Новых фактических демо/основ пока нет.

Проверка запрета на коде a09a127: локально 50 Python-тестов (intake 15)
и две JS-проверки прошли. Реальный Actions intake 38059814561 — success,
awaiting_script_revision, downloaded=0, stateSequence=16. Новые записи
утверждений и генерация видео не выполнялись. Доказательства сохранены
в research/drive-intake-integration-report.json.

## Gemini revision 2 — подготовка

Добавлен исследовательский запрос для одной SEO-темы: явное учебное демо,
источники, замечания Романа, сравнение способов. Три строки Search Console
обработаны локально, CRM CTR=1%, не кейс клиента и не доказанный эффект ИИ.
Существующий legacy generator сохранён; отдельный researched runner создаёт
pending revision 2, без отправки в Sheets/Drive и без inherited approvals.
В зарегистрированном roman-gemini-smoke.yml default prepare_research только
проверяет доступ GET и сохраняет запрос; генерация требует allow_generation.
Ограничение: max 1 POST, 4096 output tokens, no retry/fallback; стоимость неизвестна.
Исследование и настоящий текст ещё требуют редакционной проверки.
См. GEMINI_RESEARCH_REVISIONS.md. Не запускать legacy smoke для revision 2.

Проверка prepare_research на 83ddad9: Actions 38060761370 success.
Существующий ключ работает, gemini-2.5-flash-lite доступна; generationCalls=0.
Точный запрос сохранён в артефакте, Sheets/утверждения не менялись.
5 сценариев исследовательского теста и 2 существующих JS-файла прошли;
оба workflow YAML проверены. Тариф/бесплатный лимит неизвестны; нужен
согласованный один generation POST перед generate_research.

## Первая реальная Gemini revision-2 попытка

Владелец согласовал ровно один запрос. Actions 38060874104, 0c99aac:
generateContent gemini-2.5-flash-lite — HTTP 404, новая речь отсутствует,
без retry и без Sheets. Каталог не гарантирует генерацию. Ответ с причиной
не сохранён прежним runner; не объявлять модель снятой/ключ неверным.
Добавлена редактированная диагностика errors и always-upload артефактов.
Read-only 38061024656: GET detail для 2.5-flash-lite/3-flash-preview=200,
оба есть в каталоге. Следующий кандидат — ранее работавший в проекте
gemini-3-flash-preview, предел 4096, 1 POST, no fallback. Нужна новая
одноразовая авторизация; не выполнять второй запрос без неё.

## Gemini SEO revision 2 — получена и проверена

Владелец разрешил любое количество запросов Gemini для продолжения задачи:
не спрашивать отдельное разрешение перед каждым повтором. Предел одного
POST/запуск и журнал сохраняются; это не разрешение на HeyGen/публикацию.

Gemini 3 Flash generation 38061905345 success, первая речь сохранена
generated-v2.json и отклонена редакционно: приписала фильтр ИИ и не дала
конкретного нового заголовка. Исправленный brief: 38062146804 success;
generated-v2-iteration2.json сохранён отдельно. Codex исправил хук с
недоказанной причинностью, «нет кликов» и выдуманный личный опыт Романа;
reviewed-v2.json — Gemini-author/Codex-editor. Учебный пример, не кейс.
Фильтр выполнен скриптом, предложение заголовка действительно в ответе ИИ.

Подготовлены 6 полных pending вариантов revision 2 с прежними окончаниями,
132–136 слов; incoming.expectations подтверждает 6 частей/revision 2.
platform-packet-revision2.json — ещё НЕ активный источник intake; обе старые
revision 1 остаются заблокированы. Не наследовать owner-relayed approval
отдельных окончаний как утверждение полной новой речи.

Google Doc 1q-Cr0jeYe6beBq5vTDSOnAnEP-7kX-pZJqdMOq_l094 обновлён: SEO v2
на проверке, соцсети v1 на доработке. Readback подтвердил основу/3 хука
и оба исходных окончания. Предыдущий текст сохранён в Git и
ROMAN_RECORDING_TEXTS_V1_ARCHIVE.md. Sheets/утверждения/рендер не менялись.

Артефакт не скачивался напрямую в Codex (storage 403), поэтому добавлен
read-only inspect_saved: GitHub runner читает известный успешный артефакт
и выводит только проверенный pending snapshot без ключа/транспортных заголовков.
Read runs 38062035176/38062202779 success; новых модельных вызовов там нет.
5 research-test сценариев, 2 existing JS files прошли. Actual cost unknown,
usageMetadata успешных вызовов: 3716 + 3758 токенов.
Следующий этап: Роман проверяет SEO v2; после утверждения зафиксировать
точные 6 полных текстов через authenticated approval flow и активировать v2
в scanner. Соцсети нужно отдельно переработать; не объявлять их готовыми.


## 2026-10-10 — новая узкая тема MCP, revision 3 (pending)

Этот раздел заменяет предыдущий следующий шаг «Роман проверяет SEO v2».
Роман попросил узкую автоматизацию вместо доступной всем общей информации.
SEO revision 2 помечена на доработку с её точным хешем; выбор темы/хуков в
Sheets не изменён. Предложено новое направление: проверка назначения кнопки
заявки через Playwright MCP. Тема и речь требуют нового утверждения.

Официальные Microsoft/Claude MCP документы проверены. Реально установлен
@playwright/mcp@0.0.83 и Chromium Headless Shell в isolated scratch.
run-mcp-site-demo.mjs вызывает настоящие MCP browser tools через SDK: свой
учебный localhost сайт, клик по CTA, 404 → исправление ссылки → 200.
Скриншоты и report в research/mcp-site-check/evidence. Это программный
исполнитель, НЕ живая Claude Code сессия, НЕ кейс клиента/SEO/CRM тест.
В контейнере sandbox браузера недоступен; явный opt-in no-sandbox использован
только для собственного учебного localhost примера. Не переносить это
как настройку Windows по умолчанию. Установка MCP не создаёт расписание.

Gemini generation 38063671108 success, read-only inspector 38063753133 success.
generated-revision3.json сохранён; reviewed-revision3.json прозрачно отмечает
Gemini-author/Codex-editor. Редакция упростила речь и убрала смешение реального
программного теста с предложенным использованием в Claude. 6 новых pending
полных вариантов, 133–135 слов; contract/expectations: revision3, 6 частей.
Старые окончания сохранены, но полный новый текст утверждение не наследует.

Google Doc обновлён и проверен readback. ROMAN_RECORDING_TEXTS.md текущий v3;
ROMAN_RECORDING_TEXTS_V2_ARCHIVE.md сохраняет старую v2. Соцсети v1 на доработке.
6 research-test сценариев и existing shared-body/platform-ending test files
прошли. Реальный MCP paired smoke прошёл. Главные границы: Windows/Claude
сессия не проверены, реального клиента нет, scheduler сайта не реализован.
Новый packet не активирован в intake; main/Sheets/утверждения/рендер не менялись.
Следующий шаг: Роман оценивает новую узкую тему и точную речь; до этого голос
не записывать и новую версию в производство не отправлять.


## 2026-10-10 — фокус исследования и очистка документа

По указанию владельца искать популярные ролики о системах автоматизации
бизнеса и задачах предпринимателей с ИИ в целом, не ограничиваться MCP.
Порядок: внешний ролик → подтверждённые просмотры/лайки/комментарии с датой
(охват только если доступен, не приравнивать к просмотрам) → анализ реального
содержания и конкретного процесса → проверка технических утверждений →
предложение темы Роману → Gemini: одна основа и три хука → утверждение речи.
MCP — один из инструментов, а не единственное направление. Если нет доступа
к содержанию/показателю, явно указывать пробел; не выдавать учебный пример
за исследование популярного ролика. Текущий MCP v3 — pending предложение
с учебной демонстрацией, не результат анализа подтверждённого viral ролика.

Из Google Doc и текущего ROMAN_RECORDING_TEXTS.md удалён целиком неудачный
раздел «Соцсети — версия 1, на доработке» и упоминания старых редакций в
инструкциях. Текущий MCP v3, основа, 3 хука, окончания и статус pending
сохранены. Старые версии остаются только в Git/архивах, не в документе Романа.
Утверждения/Sheets/очередь/main не изменены.

## 2026-10-10 — подборка следующих бизнес-автоматизаций

BUSINESS_AUTOMATION_SHORTLIST.md и research/business-automation-shortlist-v1.json:
5 предложений (заявка → карточка/черновик; PDF-счёт → поля/таблица;
Telegram → баннер/правка; анкета → предложение; письма поддержки → очередь).
4 внешних видео, НЕ 5 независимо проверенных viral Reels. Первые две темы
используют один 8-часовой курс Nate Herk: SocialCounts показывает 1 937 830
просмотров / 60 327 лайков / 1 785 комментариев у курса целиком. Эти показатели
не суммировать по темам. У маркетинговой демонстрации сторонний разбор
показывает 853 575 просмотров, лайки/комментарии неизвестны. Предложение
и почтовый помощник — резерв: поисковые снимки 37 323/885 и 80 348/1 100,
не подтверждённые популярные короткие ролики. Дата актуальности всех снимков
неизвестна; observation 2026-10-10 не является датой счётчиков; охват неизвестен.

Новые видео целиком не просмотрены: текстовые разборы/главы и технические
страницы. Шаблоны сообщества n8n проверены по описанию, но не запущены;
предлагаемые адаптации отделены от источников. Новых платных Apify/Gemini/
image API запусков не было. В Google Doc добавлена отдельная вкладка
«Следующие темы — выбор»; текущий MCP v3 сохраняется в первой вкладке.
Следующий этап: Роман выбирает номера → усилить/проверить референс и свой
узкий процесс → Gemini основа + 3 хука → отдельное утверждение точной речи.
Не отправлять эту подборку или pending MCP в производство. Sheets, approvals,
scanner, очередь и main не менялись.

## 2026-10-10 — редакторские правила Gemini без новых генераций

GEMINI_EDITORIAL_RULES.md (1.0.0) подключён к researchPrompt через
editorial-rules.mjs: узкая задача бизнеса, вход/выход, инструменты и доступы,
собственное доказательство результата, честная статистика/доступ к видео,
стоимость/пределы, одна основа и три доказуемых хука. MCP не единственный
инструмент. При нехватке фактов Gemini должен вернуть insufficient_evidence.

researchedDrafts добавляет отдельный editorialReview: pending_review,
восемь критериев pending, без проверяющего/решения. Ответ модели и metadata
не могут сами утвердить этот чек-лист. Проверка смысла/фактов остаётся
редакторской работой Codex; документ/чек-лист не заменяет production gate.
prepare сохраняет версию и SHA-256 правил. Правила загружаются из одного
файла; изменения этого файла включены в PR path-filter офлайн тестов.

GEMINI_EDITORIAL_WORKFLOW.md описывает шаги после выбора темы и ограничения:
выбор пока не проверяется автоматически, брифы с synthetic demo/revision>=2,
legacy_smoke не подключён к новым правилам и способен писать в Sheets;
GitHub selector пока только seo/mcp_site. Новую подборку нельзя передать
генератору как готовый бриф. Исторические тексты/хеши не пересчитывались.

Локально прошли 8 research-тестов, включая офлайн prepare обоих исторических
брифов без ключа и запрет network; 3 shared-body и 6 platform-ending тестов.
В запросы реального Gemini ничего не отправлялось. Новых платных запусков,
правок Google Doc/Sheets/утверждений/очереди/main нет. Следующий шаг —
выбор темы Романом; затем исследование/свой тест и только после этого речь.

## 2026-10-10 — учебные данные до выбора темы

research/business-automation-demo-v1: заявка JSON/EML, два PDF-счёта и
побайтовый повтор первого, анкета/учебный прайс/Markdown-шаблон предложения,
эталон expected-results.json, SHA-256 manifest и validation-report.json.
Все данные вымышлены, email домены .example; реальные банковские реквизиты
отсутствуют. Неизвестные бюджет/телефон остаются null. Суммы счетов
23 990,50 RUB и 1 500,00 EUR; эталон предложения 17 500,00 RUB, не реальный
прайс/оферта. Эталон не передавать модели как вход извлечения.

build-business-demo-fixtures.py локально строит EML/PDF, проверяет Decimal
арифметику, не перезаписывает отличающиеся файлы. ReportLab/DejaVuSans
доступны в текущей среде; для повторения нужны эти зависимости. Проверены
хеши, EML readback, суммы/валюты, идентичность повтора, поля шаблона,
две одностраничные PDF через pypdf и визуально; повторная сборка идентична.
Файлы имеют текстовый слой: OCR и плохие сканы не проверены.

Это входы и ожидаемые значения, НЕ успешный бизнес-кейс: n8n/Gemini/CRM/
Google Slides не запускались, готовое предложение не генерировалось.
Выбор темы/текста Романом не получен, workflowTested/productionReady=false.
Sheets/Drive/утверждения/текущая речь/очередь/main не менялись. Платных вызовов
нет. Следующий шаг после выбора — тест выбранной связки на этих входах,
сохранение настоящего результата и отдельная подготовка речи/трёх хуков.

## 2026-10-10 — обратная связь Романа: расширить проверку сайта

Роман считает MCP-направление полезным, но проверку одной кнопки слишком
узкой. Просит исследовать актуальные способы проверки сайта и вариант
одного запроса. Это обратная связь/интерес к теме, НЕ утверждение речи v3.
MCP_SITE_AUDIT_RESEARCH.md фиксирует проверенные официальные документы:
автозапуск MCP из включённого плагина ≠ установка Playwright по умолчанию;
автоскачивание браузера ≠ подключение сервера; Claude in Chrome отдельно;
CLI+skills и Test Agents planner/generator/healer — современные варианты.
Healer может skip сломанную функцию: зелёный результат не доказывает её починку.

research/mcp-site-audit-current/site-audit-prompt.md — будущий многосценарный
эксперимент: карта покрытия, переходы, ресурсы, мобильный путь, форма/учебный
приёмник, сохранённые тесты, доказательства и явные пробелы. Один промпт может
задавать много действий после подготовки, но «100% сайта одним запросом»
не подтверждено. Установка/новая сессия Claude/новый аудит не выполнялись;
нового популярного видео именно этого формата нет. Старые речь/хеши/Sheets/
approval/main сохранены. Дальше — свой многосценарный тест, затем новая речь
Gemini и отдельное утверждение; не представлять старый один CTA как полный аудит.

## 2026-10-10 — многосценарный учебный сайт: реальный browser smoke

fixture-site.mjs и run-site-audit-demo.mjs: сохранённые девять сценариев,
4 ожидаемые страницы, картинки, desktop/mobile меню, переполнение при 390px,
пустая/неверная форма, получение заявки в локальном in-memory приёмнике,
защита от повтора. В broken состоянии 1 PASS / 8 FAIL; fixed 9 PASS;
BLOCKED нет. Тесты одинаковые; дефекты и исправления заложены Codex.
DEMO_RESULT.md и evidence/audit-report.json +18 PNG сохраняют доказательства.
Скриншоты показывают конечное состояние сценария; HTTP/получение — в JSON.

Реальный Playwright core запуск с уже установленным alpha исполнителем,
НЕ MCP-протокол, НЕ Claude/AI-поиск ошибок, НЕ доказательство «одним промптом».
Default shell блокировал локальные сокеты; successful run потребовал
network grant и explicit SITE_AUDIT_DEMO_NO_SANDBOX=true для собственного
loopback сайта. Browser requests ограничены одним origin, live account нет.
Не переносить no-sandbox в настоящую браузерную автоматизацию.

Проверено различение broken/fixed, все evidence файлы присутствуют, визуально
проверены mobile overflow/fixed form. PDF/сценарный/монтажный код не менялся.
Платных вызовов/Claude/Gemini/Google правок/approval/main изменений нет.
Ограничения: 4 страницы и 9 заданных сценариев, нет реального iPhone/CRM,
постоянного receiver, полного SEO/security/accessibility/performance аудита.
Следующий шаг — редакция темы на основании этих результатов или отдельный
AI-driven эксперимент; никакой новый текст пока не утверждён.

## 2026-10-11 — расширенная речь v4 заменяет узкую v3 в документе

По инструкции владельца завершена редакция для утверждения Романом.
brief-revision4.json опирается на известный четырёхстраничный учебный тест,
9 сценариев, 8 заложенных дефектов и local receiver. Новый selector mcp_site
в roman-gemini-smoke.yml читает этот бриф вместо исторической v3; main не менялся.
prepare покрывает теперь 3 брифа, всё ещё без сети/ключа. Генерация
38124045149 success: один Gemini-3-flash-preview POST (ранее разрешённый
сценарный сервис); фактическая стоимость неизвестна. Нет Apify/Claude/HeyGen
новых вызовов. Artifact direct download storage403; read-only inspection
38124126884 success, повторной генерации нет. read-gemini-review сохраняет
editorialReview; generated-revision4.json — bounded artifact snapshot,
не raw provider transport. Автор Gemini, редактор Codex прозрачно сохранены.

Codex убрал чрезмерное обобщение ошибок «в мобильной версии и формах»,
отделил повторяемые тесты от обещания автоматического аудита; подключённый
браузер указан условно. Учебный результат не приписан Claude/MCP-протоколу,
одно-промптовый опыт прямо не подтверждён. reviewed/platform-packet/
recording-layout revision4: одна основа, 3 хука, прежние 2 окончания,
6 full pending вариантов по 135–137 слов. Все хеши изменились; никакого
наследования утверждения. Редакторский чек-лист completed ≠ Roman approval.

Google Doc t.0 обновлён и проверен readback; вкладка следующих тем сохранена
без изменений. Текущий ROMAN_RECORDING_TEXTS.md — v4; v3 в отдельном архиве.
completion-revision4.json фиксирует текущий pending-статус. 8 research tests,
3 shared-body и 6 platform-ending tests прошли; контракты/хеши/слова v4
проверены. Активный intake/expectations/Sheets approvals не переключались:
до утверждения не записывать речь и не запускать производство.
Следующее одно действие владельца — предложить Роману проверить основу,
выбрать/утвердить хуки версии 4 и окончания либо дать точные замечания.

## 2026-10-11 — технический и SEO-аудит, речь v5 pending

Владелец расширил направление до технического/SEO-аудита сайта бизнеса.
Созданы SITE_TECHNICAL_SEO_RESEARCH.md, отдельный owned loopback SEO-fixture и
run-technical-seo-demo.mjs. Никакие старые fixture/evidence не изменены.
Реальный браузерный/HTTP запуск: 4 заданных URL, 10 фиксированных проверок,
до 1PASS/9FAIL, после 10PASS/0FAIL. Девять дефектов заложены намеренно; есть
положительный контроль. 8 PNG и JSON с наблюдениями/хешами сохранены.
Учебный robots/XML подход нельзя использовать как общий production crawler.
Search Console, полевые CWV, скорость, контентная стратегия, JS и локализации
не проверены. Официальные Google/Chrome источники открыты 2026-10-11.

Бриф v5 опубликован коммитом 11029b0; mcp_site workflow selector читает его.
Generation 38125488979 SUCCESS: один разрешённый Gemini POST, model
gemini-3-flash-preview, totalTokenCount 5403, фактическая стоимость неизвестна.
Inspect 38125537411 SUCCESS без повторного вызова модели: bounded artifact
snapshot сохранён, не raw provider transport. Никаких Sheet/production writes.

Codex исправил черновик: noindex не объявляется доказанным отсутствием в Google,
ИИ не приписываются неисполненные анализ/задачи, нет обещания отсутствия всех
препятствий. Функциональный опыт и новый SEO-тест явно разделены. reviewed,
platform-packet и recording-layout v5 pending: 6 вариантов по 132–136 слов,
6 частей, recordingAllowed/productionReady=false, все full hashes изменились.
Редакторский checklist готовности к проверке не является Roman approval.

Google Doc t.0 заменён на v5 с revision guard и проверен readback; вкладка
следующих тем не изменена. ROMAN_RECORDING_TEXTS.md теперь v5, v4 архивирована.
SCREEN_PLAN_V5.md — только план будущих собственных карточек/показа, не монтаж.
17 offline tests прошли; reader, pending состояния и смена всех 6 хешей проверены.
main, активный intake, ожидания исходников и утверждения Sheets не менялись.
Следующее действие — Роман проверяет точную основу v5, три хука и окончания.

## 2026-10-11 — новые замечания Романа: Search Console и публикация сайта

Последние голосовое и текстовое сообщения прочитаны из Drive-записи
1RzBJQfsoyobV1ZOqr4Yybw5ZsaISQWvH; локально распознана речь без платного API.
Создан SEO_SEARCH_CONSOLE_RESEARCH.md: требования Романа, первичные источники,
кандидат YouTube Rank Math, процедура CSV-анализа и промпт с проверкой чисел.
Кандидат имеет 15 139 просмотров/551 лайк по поисковой выдаче; сам видеоряд
недоступен, комментарии/охват неизвестны, вирусность не подтверждена.
Короткий проверенный референс пока не найден. Прямые технические источники
Google подтверждают экспорт, размерности и ограничения; нельзя соединять
отдельные сводки Queries/Pages в пары без дополнительных данных.
Тема публикации созданного с ИИ сайта на домене/хостинге выделена отдельно.
Это подготовка исследования: реальные CSV/Claude-опыт/Gemini-редакция
не выполнены, v5/Docs/Sheets/утверждения/production не изменены.

Уточнение Романа в следующем скриншоте: основной продукт — SEO-чек-лист;
Search Console показать коротко (экспорт либо подключение). Подготовлен
SEO_CHECKLIST_FOR_ROMAN.md: 13 проверок с доказательствами, план экспорта,
промпт для Claude и три предварительных направления хуков авторства Codex.
Адрес/доступ клиентского сайта не являются блокером этого материала.
Новая речь не сгенерирована и не утверждена; Claude-промпт ещё не испытан.

## 2026-10-11 — Gemini: SEO-чек-лист, редакция 6 pending

Добавлен отдельный workflow selector seo_checklist; старые seo/mcp_site пути
сохранены. Бриф v6 опубликован 69f75d6. Generation 38140203814 success:
один Gemini POST, gemini-3-flash-preview, totalTokenCount 5439, стоимость
неизвестна. Direct artifact download вернул 403; inspect_saved 38140250461
success прочитал результат без повторного вызова модели.
generated-revision6.json сохраняет bounded snapshot, не raw transport.
Codex исправил преувеличение о canonical, усилил чек-лист и отделил
подготовленный промпт от выполненного аудита. Сохранены edited/reviewed v6;
три варианта по 127–129 слов без окончания, pending_approval и
productionReady=false. Reader проверил контракт/хеши; 8 тестов прошли,
включая offline preview нового брифа. EditorialReview остаётся pending.
SEO_CHECKLIST_SCRIPT_V6.md — отдельная редакция для обсуждения; активный
ROMAN_RECORDING_TEXTS.md/v5, intake, Sheets и производственные ожидания
не переключены. Прежнее кодовое слово САЙТ не заменять молча на SEO:
нужны новые окончания и проверка бота перед записью. Claude-аудит и
сильный доступный внешний референс ещё не проверены.

## 2026-10-11 — согласованный Cooper Apify probe завершён без референса

Новый лимит $0.50 явно разрешён владельцем. Добавлен узкий cooper_metadata
режим: один профиль, последние 15 Reels, cap $0.10; прежние режимы сохранены.
10 тестов ограничения бюджета/идентичности/отсутствия повторного POST прошли.
Workflow 38151027160 success; Actor mdGdaeLTYGJFDweNU, dataset poOgPPbQEcTYrvLAJ.
Среди 15 записей нет SEO-кандидата. 541184 plays относится к ролику о
тревожности, не использовать как бизнес/SEO-референс. Details не запускался,
сбор не расширялся. usageTotalUsd=0.001, окончательный счёт неизвестен.
seo-reference-cooper-probe-results.json сохраняет результат и ограничения.
Требуемый свежий успешный SEO-референс остаётся нерешённым; агрегаторные
916–919k не подтверждены. Активные сценарии, Sheets, approvals, main и
производство не изменены.

## 2026-10-11 — видео Cooper стало доступно без платного запуска

Публичная страница Pictame содержит code DVUmmr8gZhU; оригинальная Instagram
страница и embed открылись без авторизации. Дата 28 февраля 2026 — старше
60 дней, кандидат исключён из свежих. Primary embed: 430253 video_view_count,
13643 likes, 32524 comments; aggregator playCount=919554 хранится отдельно.
Публичный MP4 скачан без Actor/API, CPU faster-whisper-small локально дал
английскую речь, 18 кадров просмотрены. Полный playback и word accuracy
не проверены. Новых платных запросов нет; дополнительные поисковые страницы
вернули 403/CAPTCHA, не обходились. Материалы только для анализа, не B-roll.
SEO_REFERENCE_COOPER_ANALYSIS.md содержит таймлайн, рекомендации и задание
для Claude Code (ещё не исполнено). seo-reference-cooper-public-evidence.json
содержит первичные счётчики, SHA256 и raw ASR с оговоркой точности.
Google Doc 17wCWwvu_i5ruKoopLA8ZW1Q7Bw6rVbGIuzfTQiI6oa4 создан и прочитан
обратно: ссылка/дата/цифры/ограничения сохранены. Старый сценарий v6, live
таблица, approvals, main и production не менялись. Новый успешный свежий
SEO-референс остаётся нерешённым. Старый пример можно оценить только по формату.

## 2026-10-11 — shared review bridge подготовлен без live deployment

SharedReview.gs + обновлённые Code.gs/RomanApproval.gs связывают authenticated
Google edit receipts темы/основы/трёх хуков с legacy queue/scriptHash. Опция
ROMAN_SHARED_REVIEW_ENABLED выключена по умолчанию. Предлагаемый блок A:G
содержит четыре строки (основа + три хука), append-only/history preserved.
Основу/тему требуется утвердить отдельно; body reject блокирует все варианты,
hook reject только его. Изменение точного текста/revision/identity блокирует
старые кнопки. Managed темы не обходят bridge старым canonical receipt даже
после выключения опции. Отдельные CTA отображаются в блоке основы.
prepare-shared-review.mjs проверяет реальные pending v6/платформенные full scripts;
JSON Schema shared-review-v1 проверена с v6 локально. v6 не зарегистрирована,
editorialReview остаётся pending. Новый offline CI workflow не использует секреты.
48 локальных проверок (25 shared+legacy, 3 prepare, 12 queue, 8 intake) прошли.
SHARED_REVIEW_BRIDGE.md — контракт, предлагаемый вид и безопасный deployment.
Live Apps Script API/clasp credentials в этом окружении не подключены; Drive
access/webhook token не дают source/deployment доступа. GitHub secret-list 403,
значения не читались. Не просить владельца менять код вручную на iPhone:
нужна авторизованная сессия установки с backup и реальным e.user тестом.
Live таблица, approvals, источник v6, intake, Telegram/HeyGen и main не изменены.

Облачное подтверждение shared review: implementation a71efce. GitHub Actions
38160865900 (push) и 38160868441 (PR) завершились success на этом SHA:
48 offline checks + addon/source parity. Изменения входят в открытый PR #5,
feature/codex-pipeline → automation/roman-reels-v1. PR не слит, main не тронут.

## 2026-10-11 — качество до отправки Роману: editorial release gate

Найден разрыв: send-drafts-to-sheet проверял только pending/count, не завершённую
редактуру. Добавлены editorial-release/check-editorial-release/send-shared-review.
Перед отправкой обязательны exact hashes трёх сценариев, current rules 1.1.0,
практическая задача, свежий inspected reference с primary views/plays>=100k,
реальный совпадающий workflow demo + artifact hashes, восемь pass с evidence,
отдельная семантическая проверка. Structural checks не доказывают истинность.
Sender блокирует старый вызов с одним аргументом ДО Google/network. Shared sender
mock проверен, live не вызывался. Поддерживает базовые 3 версии без окончаний;
release binding шести платформенных версий ещё требуется отдельно.
Legacy smoke и old pilot отправки остановлены early rejection; paid generation
в legacy_smoke не запускается. Research preview/inspect/authorized generation
сохранены, полноценный входной gate перед каждым research POST пока не подключён.
Текущая SEO v6 preflight заблокирована: старый Cooper, Claude инструкция prepared,
pending editorial/semantic. Два release-v6 JSON сохранены, оригинальные речь/Doc,
таблица, approvals и производство не менялись. EDITORIAL_RELEASE_GATE.md содержит
причину, правила, пределы проверки и задание для реального Claude опыта.
11 новых тестов + 8 существующих research tests прошли локально; cloud CI теперь
выполняет их вместе с предыдущими 48 (67 total). Новых paid calls не было.

Облачные проверки editorial release: implementation 33c59e3. Runs 38161942760
(push) и 38161945758 (PR) success на этом SHA: 67 offline tests и addon parity.
Изменения в существующем PR #5; не слит. Live API вызовов публикации не было.

## 2026-10-11 — Roman requires free audience workflows

CONTENT_REQUIREMENTS.md records evolving content acceptance rules and sources. GEMINI_EDITORIAL_RULES 1.2.0 adds free end-to-end viewer implementation; factory spend is separate. Editorial senders now require hash-bound cost evidence covering tool/model/integration/execution/data, applicable tested usage, official sources and limits; paid/unknown/trial-only/stale evidence blocks release. Structural validation is not an automated factual tariff check. No specific unnamed MCP pricing has been established. SEO v6 remains blocked; no speech, live approvals, Sheets or Docs were edited. No paid calls.

## 2026-10-11 — free SEO route dependency research

SEO_FREE_WORKFLOW_RESEARCH.md separates MCP/tool licenses from model costs. Official Gemini pricing lists a free tier; project eligibility/quotas and model workflow remain untested. Claude cost docs returned 403; no tariff claim inferred. Ollama MIT does not certify model license or hardware readiness. Existing deterministic local SEO fixture rerun: broken 1 pass/9 fail, fixed 10 pass, zero model calls. Evidence in site-technical-seo/free-route-fixture-2026-10-11; not Claude/AI execution or autonomous repair. Full free workflow and fresh popular reference remain blockers. No live Sheets, approvals, Docs, Windows changes or paid calls.

## 2026-10-11 — actual local-model SEO interpretation probe

SEO_LOCAL_MODEL_PROBE.md and research/site-technical-seo/local-model-probe-2026-10-11 contain 6 real CPU inference calls, exact prompts, stdout/stderr, versions/hashes, fixture binding and reviewer assessment. Qwen2.5 0.5B and 1.5B official GGUF candidates (Apache 2.0) via llama.cpp b11558 (MIT) both rejected for factual errors with this prompt. Verdict-only matches 1/3 and 2/3 do not confer semantic readiness. No browser-control or complete SEO/model workflow claim, no Windows test, no paid API calls, no live Google edits or approval. No migration of factory Gemini. Next bounded candidate: evidence-bound interpretation with explicit known/unknown rules and independent validation, not a claim that all local models fail.

## 2026-10-11 — grounded SEO probe v2 and deterministic evidence presentation

SEO_GROUNDED_PROBE_V2.md records 3 new actual local Qwen 1.5B inference calls: 3/3 supplied statuses followed, but only 1/3 explanations passes narrow factual review. This is adherence to explicit checker statuses, not independent detection. Unsupported indexing guarantee and all-pages index advice keep candidate blocked. No paid API, Windows, factory Gemini or live Google changes. New build-seo-evidence-report.mjs renders ONLY the known synthetic two-state scanner report with escaped observations, bounded fixed advice and explicit scope/unknowns. 3 meaningful renderer tests added to existing offline CI. This renderer is not a deployed autonomous site auditor; SEO v6 and Roman approvals remain untouched.

## 2026-10-11 — owner reports Windows laptop available

Windows is available per owner, not yet verified by this cloud session. No direct Windows/desktop connector is present. WINDOWS_FIRST_CHECK.md provides the minimal Claude handoff: fetch existing clone without working-tree changes, read current docs with git show, inspect sanitized hardware/tool versions, confirm actual session MCP tools and navigate example.com through MCP only. No installs/login/HeyGen generation. WINDOWS_SETUP.md status updated without claiming setup completed. Await real local report before selecting compute/browser profile or running real HeyGen.

## Windows local report received, 2026-10-11

Owner relayed successful actual MCP Example Domain navigation/evaluation on Windows; see WINDOWS_READINESS_REPORT.md for sanitized specs and limits. Local branch still 2d2bc38, 23 behind dbbc5bb at that fetch, untracked snapshots retained. Node was not found in PATH despite earlier separate Node runtime/MCP launcher report: verify executable before installing. Prepared WINDOWS_NODE_AND_SEO_CHECK.md authorizes guarded ff-only update, existing runtime discovery/conditional official portable Node, then own loopback SEO observations through actual MCP. New serve-seo-fixture.mjs reuses unchanged owned fixture, no npm/model/API dependency. Python/FFmpeg deferred until needed. Not executed on Windows by cloud Codex; no HeyGen, live Google, approvals or paid model calls.

Cloud smoke for the new fixture launcher passed: both states bound to 127.0.0.1, main HTTP 200, broken meta noindex/soft-404 200 versus fixed without noindex/404. Invalid mode rejected before startup; both owned child servers shut down. This is Linux/Node verification, not Windows MCP execution.

## Windows MCP SEO result relayed by owner (2026-10-11)

WINDOWS_SEO_MCP_RESULT.md records actual local report, not cloud direct observation. Node v24.21.0/npm 11.19.0 already installed; ff-only to db1adac; actual MCP DOM/network/screenshot calls against owned two-state fixture. Both servers stopped, no installs/accounts/HeyGen/paid APIs. /gone from broken sitemap was NOT requested. Raw observations.json and four PNG remain outside Git on Windows; cloud has not inspected/hash-verified them. WINDOWS_SEO_EVIDENCE_HANDOFF.md prepares separate /gone measurement and sanitized owned-evidence export via isolated worktree/PR to feature/codex-pipeline. Do not claim missing values or complete demo/release approval from the narrative report. No scenario or live Google changes.

## 2026-10-12 — offline narrow-topic metadata triage

New topic-reference-plan.mjs binds exact topic scope/revision and saved metadata hashes; screens Instagram Reel identity, <=60-day publication, <=7-day metrics, >=100000 views/plays and each narrow caption term group. Metadata eligibility is NOT primary-counter verification, semantic approval or paid execution. Always no network/drafting/Roman approval/production. Deterministic job key is not deployed idempotent queue. Real saved Cooper 15-item batch has no qualified SEO candidate. NARROW_TOPIC_RESEARCH.md specifies actual blockers: topic-only trusted registration/snapshot before hooks (current shared packet requires speech), actual keyword discovery adapters, journal/budget, video/factual/cost review then existing Gemini/editorial gates. Live Sheets/Apps Script unchanged, no new paid calls or script drafts. PR8 not merged.

## 2026-10-12 — separate registered-topic selection reader, not deployed

SharedReview.topicSnapshot + authenticated get_topic_research_snapshot added to Code.gs/generated RomanApproval.gs. Read-only under existing lock; requires trusted exact topic receipt and current registered rows, not body/hooks approval. Never returns speech or grants production. Existing opt-in disabled by default. topic-selection-reader.mjs validates current snapshot/receipt shape and hashes, manual response redirect without forwarding body/token, and in-process transport provenance; saved/modified JSON cannot authorize planForSelectedTopic. CLI opt-in reads existing webhook secrets only and produces offline metadata proposal with paid/model/video execution still false. Topic snapshot schema v1 added. TOPIC_SELECTION_READER.md explains no live deployment, no topic-first registration yet (shared packet still requires body/hooks), no automatic paid worker. Actual table/Apps Script state, Roman decisions and old hash contracts untouched.

## 2026-10-12 — immediate Windows handoff for live Apps Script preflight

Owner requests actionable Claude tasks as soon as needed, not waiting for repeated continue messages. WINDOWS_APPS_SCRIPT_PREFLIGHT.md prepares actual local MCP read-only access/compatibility check of existing project, conditional private backup without token/source dumps, and sanitized audit report via isolated branch/PR. No deployment, Script Properties page, profile/cookie transfer, approval migration or installs. Google login/access may be a real blocker; report rather than invent source inspection. Cloud cannot directly start Windows Claude or monitor between turns; future user result notifications trigger GitHub review.

## 2026-10-12 — PR9 read; Google login is the actual local blocker

Read PR9 head 761c6ce, single REPORT.md addition. Actual MCP navigate reached accounts.google.com; no live editor/files/functions/deployments inspected, no source/property/code modifications. Prepared WINDOWS_GOOGLE_PROFILE_SETUP.md for separate visible persistent Edge profile and additional MCP preserving existing headless server. Normal owned-profile window is for owner's manual Google login, not evidence MCP works. No cookie transfer, credential collection, login automation or public debugging port. New MCP may require fresh Claude session and manual browser must release profile before MCP launch. Audit resumes read-only only after owner login. Report format: max4 lines; details in pushed branch/PR. PR9 not merged.

## 2026-10-12 — PR15 live audit read; prepare compatible candidate, not deployment

Read PR15 head 4d47661. Actual local MCP has Google editor access; live Code.gs and RomanApproval.gs backed up privately, SharedReview absent. New action/snapshot absent; deployments not inspected because local permission review blocked the menu. Regex counts of two doPost/edit/setup declarations DO NOT establish duplicate globals: repository addon deliberately has inner IIFE implementation and outer delegate. Live scopes remain to be checked from the private backup before any removal/replacement. WINDOWS_APPS_SCRIPT_PATCH_PREP.md tasks local Claude with a concrete minimal candidate, live-specific mocked regression tests and apply/rollback plan; no Google writes, publication, flags, setup or approval changes. Do not bypass the permission rejection. Shared packet reader still does not register topic-only review; that is separate Codex work, not a live capability. PR15 remains open, main untouched.

## 2026-10-12 — Version 4 deployed locally; cloud authenticated health verified

PR16 confirms nested/global handler scopes and compatible private candidate. Owner explicitly authorized local apply; PR17 cfdc9e8 reports same URL/settings, Code.gs unchanged, updated addon + SharedReview, Version 4, no feature/approval/trigger changes. Cloud ran existing read-only queue check 38229911233: success, 0 items. Added strictly disabled snapshot probe using existing safe reader transport, tests and feature-branch-only read-only workflow path in 12d77a3. Live run 38230256036 success: queue 0, snapshot enabled=false/topics=0/productionAllowed=false. No secret/source/receipt dumps, paid calls or production. APPS_SCRIPT_V4_LIVE_CHECK.md records actual evidence and limits. Topic-only registration and topic selection are still absent; do not turn flag on or infer approval. PR17 remains open; Windows Edge closing is not required to serve Apps Script or run cloud checks.

## 2026-10-12 — topic-first registration developed offline, not live

New authenticated add_topic_review + separate namespaced topic-only registration/receipt in existing SharedReview. One seven-column row with real topic/research fields and no fake body/hooks; same opt-in. Trust e.user, exact hash/row, rejection/revision/formula/bulk safeguards. Existing snapshot v1 now includes topic-only choices; production still false. Compatible add_shared_review transition rechecks exact selected topic/revision, appends normal four-row packet and preserves only the original identical topic receipt; body/hooks stay pending. Rejection in original topic row blocks linked speech queue and legacy bypass. Old full-shared topics not automatically migrated; independent topic/speech revisions not implemented. TOPIC_FIRST_REVIEW.md and schema record limits. Generated addon updated, live Version 4 unchanged; no Sheets/feature/deployment/payment changes. Tests include 14 new regressions plus existing legacy/shared/reader gates. Next: candidate against current private Version 4 and bounded live test after reviewed application; no automatic paid research worker claimed.

## 2026-10-12 — PR18 candidate reviewed; concrete install handoff ready

Read PR18 32009f7. Private backup V4 checks and 18/18 upgrade suite are reported by Windows Claude, not independently rerun with its private files. Cloud verified candidate addon/shared SHA exactly, ran topic-only 24/24, shared 25/25, reader 24/24 and disabled probe 4/4 (imported baseline tests repeat); upgrade suite cloud result 10 pass/8 skipped due absent private copies. No blocking issue found for installing with feature off. WINDOWS_TOPIC_FIRST_APPLY.md pins files, preserves live legacy Code.gs and all settings, requires actual post-save hashes and bounded read-only checks, and includes full rollback: restore editor files as well as web-app Version 4 because triggers can use editor HEAD. No live change performed by this cloud review. Feature activation/real e.user/topic choice and automatic research generation remain subsequent tasks. PR18 not merged, main untouched.

## 2026-10-12 — Version 5 installed locally, live health recovered after one failed probe

Read PR19 303daa0: applied pinned topic-first candidate, same deployment/settings, legacy Code.gs and flag/receipts/rows/triggers unchanged. Cloud read-only run 38236462629 failed on non-JSON HTTP404 queue; snapshot not executed. One separately dispatched diagnostic repeat 38236678240 passed: queue 0, snapshot enabled=false/topics=0/productionAllowed=false. Cause of 404 unknown; do not claim proven reliability or hide first failure. No intervening cloud changes to code/deployment/secrets, no automatic retries/production. APPS_SCRIPT_V5_LIVE_CHECK.md records evidence. Actual topic-only choice by Roman, feature activation and nonempty approval/production remain untested. PR19 remains open, main untouched.

## 2026-10-12 — independent automation while Roman cannot review

Added stdlib analyze-gsc-export.py: bounded private ZIP → verified chart totals, approximate position, screening candidates, sparse-query diagnosis and explicit no query/page mapping or approval/execution permissions. English unfiltered Web text-based format only; invalid/mixed-site inputs stop, no extraction/network/model calls. Eight synthetic tests added to existing source CI. Real supplied private export processed locally and matches earlier analysis; private numbers and client content remain outside Git. GSC_EXPORT_ANALYSIS.md documents runnable CLI and missing schedule/Drive/Gemini integration. WINDOWS_SERVER_AVAILABILITY.md gives separate read-only unattended power/session/service check for local Claude, no reboot/power changes/secrets/installs. Live Version 5 and flags/rows untouched; waiting for Roman does not require pausing these independent stages.

## 2026-10-12 — PR20 AC lid setting verified by local report; HeyGen gate reconfirmed

Read updated PR20 6bee03b: local Claude applied LIDACTION AC 0, DC stays 1, same Balanced scheme/other timers, no reboot or physical lid test. Settings observed locally, not direct cloud hardware test. Unattended availability still depends on interactive login/Claude restart after reboot; don't claim Google/HeyGen authorization or recovery tested. Reopened official HeyGen terms (updated July23): the previously documented automated-access restrictions remain, no account-specific permission obtained. HEYGEN_BROWSER_AUTOMATION.md updated to actual Windows availability; HEYGEN_PERMISSION_REQUEST.md contains a specific support question, NOT sent. No HeyGen calls, hidden endpoints, API substitution or paid service setup. Authorized manual MP4 intake/cloud montage remains available while browser permission and Roman topic choice are pending.

## 2026-10-12 — Windows uploader live test relayed; four-part cloud adapter

Owner relays PR22 real h1 upload into windows-uploader-test-20261012/v1 and fresh-process already_uploaded with same ID, one MP4, size/MD5/SHA matching, local bytes unchanged. Autostart/HeyGen/render not run. No deletion requested; keep isolated test evidence. Added explicit draftVersion3 four-part expectations/receipt validation and source-set v1 assembler plan to existing cloud intake. Six-part packets never fall back on missing endings; journal verification counts use explicit partCount, legacy default6. Same authenticated full-script checks/revocation and renderAllowed=false. FOUR_PART_DRIVE_INTAKE.md lists absent receipt generation, dynamic packet delivery and live integration. No scheduler/live Google/approval changes, production or paid calls.

## 2026-10-12 — PR24 voice decision read; offline four-part receipt builder

Read PR24 head02d4661: manual owner navigation/window screenshots only, Roman avatar, hook look11, body look13 OR14 still needs one explicit choice, speech from inserted text with voice «Для рилс», vertical1080p. No actual generation/credits/automation permission verified. INTEGRATION_CONTRACT updated without FactoryJob schema change. New offline Node receipt builder validates explicit four-part packet, exact legacy hashes and four uploaded PR22 journal entries with preassigned part textHash; no retroactive text binding for old test upload, no OAuth/upload/approval/journal edits. Five tests include Python expectations parity and exclusive file output. Receipt uploader/dynamic live packets/full Drive integration still pending.

## 2026-10-12 — PR23 continued: explicit bounded registry and cross-language media integration

No review comments; prior CI green. run-drive-intake accepts optional --packets without changing legacy/scheduled defaults; strict packet/count/byte/duplicate validation before credentials/network, legacy self-test switch cannot combine. Added actual offline Node receipt → Python fake-Drive full decode integration plus explicit registry regressions. WINDOWS_FOUR_PART_RECEIPT_TASK.md is a concrete next local-Claude task: JSON receipt transport and repeat-safe finalization after four uploads, code/tests first, no retrospective textHash/old rejected speech, no live generation/autostart/production. No live Google or main changes.

## 2026-10-12 — PR25 exact synthetic packet available; bounded read-only cloud probe

Owner reports live four MP4+receipt verified and repeated with one receipt ID at4c3b3d9. Exact fictional packet exported1f67da8 SHA e9524729a2103ef2211d1eb79cf886d74a83f02d78dacf250fbad805845263c3; cloud git blob matches. Added pinned check-four-part-drive-fixture with drive.readonly scope, no mutation-capable wrapper/shared Drive journal/approval credentials. Dedicated opt-in existing workflow job limited to feature/codex-four-part-intake; defaults unchanged. Three offline tests pass (packet tamper, scope, real synthetic decode through fake Drive). Live result pending at this commit; do not infer full production. Test folder retained, main/approvals/HeyGen untouched.

Live read-only fixture run38288834427 on ea5e2ca succeeded (47s), only dedicated probe ran, all other service jobs skipped; offline test check succeeded too. Probe exit0 enforces real download/MD5/SHA/receipt/decode, four source/text hashes, awaiting_approval and renderAllowed=false. Artifact/log retrieval from cloud blocked HTTP403; raw report not independently read here, do not invent hash values. No Drive writes or approval reads in probe. Windows→Drive→cloud validation synthetic chain now demonstrated, not production/montage or scheduled integration.

## 2026-10-12 — bridge pinned Drive fixture directly into existing assembler

Optional assemble_four_part_fixture in dedicated read-only synthetic probe: same-runner downloaded receipt/bytes reinspection, current remote metadata before/after, existing source-set v1 assembler, all3 QC/complete gates; outputs only temporary Actions artifact3days. No Director/ASR/subtitles/professional montage, Drive writes, scheduler, approval or HeyGen. Offline probe test now actually assembles3 synthetic MP4s and checks complete/QC/nonproduction;3tests pass, YAML/diff clean. Live assembly result pending at this commit.

Live synthetic assembly run38289563703 atbcdfec6 succeeded1m9s: only read-only fixture service job ran; all3 assembler QC/complete gates passed, both report/output artifact steps success, offline CI test success. Output artifact retention3days, no Drive/Git video writes. Raw artifact not read here; source is job status plus reviewed success gates. Next real integration boundary is assembled bytes → speech validation → existing Director/Remotion; tones do not supply spoken words or valid montage captions.

## 2026-10-12 — one development entrypoint for speech-cache → Director/Remotion

run-shared-body-development.py composes existing four-part assembler, verified cached real speech binder, Claude Director/Remotion wrapper and source-audio preservation. Explicit development only, exact cache/source path/SHA/metadata binding before outputs, new directories/no overwrite; failed run remains complete=false, requested-hooks and allThreeRendered recorded separately. No fresh ASR or approval claim. Four offline orchestration tests pass with real synthetic MP4s/mock renderer; existing Director14/timing7 pass directly. Actual h1 controlled render from old repository speech fixtures is in progress at this commit; no Google/HeyGen/paid API/publication. Live Drive-to-professional-montage wiring still absent; do not give tone fixture speech/captions.

Actual one-command development run succeeded on previous real repo speech fixtures: all3 source assemblies/jobs prepared, h1 Director/RomanFactoryV1 full render technical QC passed1080x1920/25fps/40.24s. Source AAC decoded PCM/clock identical; cached95words, no fresh ASR. Four orchestration tests +Director14/timing7 passed. One9s frame reviewed face/mic clear; not full speech/visual review. h2/h3 not rendered this run. Evidence research/shared-body-development-run-20261012/result.json; MP4 outsideGit. Upload to private Drive ChatGPT folder rejected by automatic risk review (specific real-voice payload/destination not explicitly approved), no upload/alternate workaround. Ask owner explicit file/destination approval only after concrete MP4 prepared. No live approvals/HeyGen/output production changes.

Owner explicitly approved the concrete h1 MP4/private ChatGPT destination. Connected Drive upload succeeded; metadata readback name/MIME/parent/33726109bytes matches. No public share/approval/production changes. Remote checksum not returned by connector metadata, not independently verified. Prior automatic rejection resolved by explicit user authorization, not workaround.
## 2026-10-12 — Windows: recording-set.json finalizer after four uploads (code/tests only)

Branch feature/windows-four-part-receipt-20261012 = PR22 head + merge of PR23 1af21b8 (both unmerged; merge them first). New four-part-receipt-upload.mjs + `run-source-uploader.mjs receipt --packet`: explicit packet only (missing → blocked, no Drive), PR23 builder (no retroactive textHash), independent re-read of folder chain and all four Drive parts (ID/name/MIME/parent/size/MD5/SHA-256/appProperties, single file per slot) before upload and again before rename, reserved ID persisted in journal receipts before create, JSON temp name then rename, own checksum verification, foreign/modified receipt never overwritten. 10 offline fake-Drive tests added to CI. No live run, no intake-state/scheduler/HeyGen/production changes. WINDOWS_FOUR_PART_RECEIPT.md.

## 2026-10-12 — consolidated integration candidate, not target-branch merge

Separate cloud worktree/feature/codex-four-part-integration from8efa49f combines PR22 head387dcd1, PR23 head62e9c0c, PR25 head1f67da8. Only handoff append conflict; both records preserved. Code/workflow auto-merged. Local packet.json -text attribute keeps pinned fixture bytes on Windows; exact SHA unchanged. FOUR_PART_INTEGRATION_REVIEW.md records scope and prior real probes. Combined CI pending at this commit. No target-branch/main changes, no Windows/Google deployment/autostart/HeyGen/production; owner must explicitly approve GitHub PR merge under standing no-merge instruction.

## 2026-10-13 — Windows ff update relayed; approved four-part planning adapter

Owner relays main Windows clone ff-only toc4101e4 with no divergence, old untracked pv/.playwright-mcp retained, no installs/autostart/HeyGen/production. New branch feature/codex-approved-four-part-jobs from actual merged pipeline c4101e4 adds bounded authenticated production reader (manual protected response redirect, no token forwarding, fresh WeakMap provenance) and exact shared-review/body/hook receipts→four uploader jobs/neutral intake packet. No saved JSON authority, old legacy approval bypass or automatic execution. Explicit role/path binding needed; title never infers role. Eight offline tests pass incl Python/uploader/receipt parity. CLI private output only/no text logs, secrets never copied Windows. Dedicated existing read-only workflow branch path prepared for reader health; live result pending. Shared feature/current real approval still untested for new nonempty plan; no Google edits or paid calls.

Live read-only run38337924933 onb3316ed succeeded: old queue export and new strict reader both0 approved items, actual decoded job log confirms authenticatedRead true and generation/render/googleWrites false. No planning/jobs/feature/approval edits; all other service jobs skipped. Reason for empty queue unknown, nonempty real shared receipt path still untested. Full source CI38337924866 succeeded. Diagnostic metadata only in research/approved-four-part-jobs-20261013/check.json, never planner authority. PR27 remains unmerged pending owner permission; Windows alreadyonc4101e4.

## 2026-10-13 — staging-only cloud-to-Windows delivery candidate

PR27 merged with owner permission at55ed7d7. New feature/codex-windows-plan-delivery prepares a private user-owned Drive single-slot mailbox proposal: bounded checksummed expiring envelope, pinned update-only cloud publisher, DPAPI OAuth Windows receiver staging into received-plans (never active jobs). Different outstanding plan blocked, identical retries/readback checked, partial/crash state preserved and blocked. No mailbox/grants/config/workflow/autostart created; no Google edits/HeyGen/upload/render. Receiver10 and publisher5 offline tests added to source CI; uploader13/planner8/builder5/finalizer10 retained and passed locally. This is not a full persistent production queue or execution controller. WINDOWS_PLAN_DELIVERY.md records explicit owner approval needed for new folder/file ACLs and remaining fresh-approval/acknowledgement boundaries.

## 2026-10-13 — Telegram panel candidate around existing queue

Owner wants one-button launch, Roman approval visibility and current production status. feature/codex-telegram-panel adds authenticated bounded Bot API long polling, private authorized operator panel, paginated approved variants/actual waiting jobs, frozen existing start tickets and durable SQLite cursor. Button only enqueues waiting manual jobs; no four-part delivery/HeyGen/upload/render or live worker transition invented. Nine new offline tests plus twelve existing queue tests pass; source CI includes both. Current Google endpoint cannot report pending/rejected or separate topic/body/hook statuses; panel explicitly says unknown rather than inferring rejection. Full read-only review contract and deployment remain separate. No token/host/allowlist configured, no live Telegram calls, no startup; persistent trusted coordinator/access architecture must be agreed before deployment, no cloud secrets copied Windows. TELEGRAM_PANEL.md records boundaries.

Owner relayed Windows empty mailbox read success at54abdb6: statuswaiting, all generation/upload/render flags false, receiver10/10; local config created outsideGit with existingOAuth, no Drive/video changes. Root has not independently executed that Windows read. No real nonempty mailbox delivery proven yet. Private mailbox identifiers/permission details intentionally omitted from Git report.
