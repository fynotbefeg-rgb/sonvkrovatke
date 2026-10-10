# Codex handoff — Roman Reels automation
Updated: 2026-10-10

## Authoritative specification 3.0 — start here

Apify requested for reference analysis. Read-only account access verified by successful
GitHub Actions run 38040963236, automation/roman-reels-v1; no Actor started.
APIFY_TOKEN absent locally, GitHub secrets cannot be read/listed by current integration,
but Actions can use the existing secret. No Apify connector found in plugin search.
Official Instagram Reel Scraper offers transcript/video add-ons; existing one-Reel
collector disables them and cannot provide content analysis. Concrete pending budget
plan: research/apify-reference-probe-plan.json, 30 metadata candidates + 2 transcripts,
sum of four run caps <= $1. Budget not approved; staged collector not yet implemented.
Public reach remains unavailable; transcript does not constitute montage inspection.

LATEST live review layout simplified at explicit owner request. Sole visible tab
is `Темы и хуки` (323200067), A:G: topic, topic decision, hook, hook decision,
reference analysis, metrics, URL. One topic = 3 rows; B/D accept Утверждено or
Не утверждено. Canonical texts/decisions unchanged; all old tabs preserved hidden.
Rows 2–4 existing rejected pilot, rows 5–7 unviewed business-growth candidate.
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
