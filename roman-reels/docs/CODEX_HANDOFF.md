# Codex handoff — Roman Reels automation
Updated: 2026-10-09

## Codex continuation — 2026-10-09
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
Build a reliable pipeline for **90 vertical Reels per month** for Roman. Desired only human action: Roman approves scripts. User works mainly from iPhone and prefers concise Russian, one action at a time. No Windows laptop required for current development. Do not claim full automation while HeyGen API is unavailable.

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
- HeyGen has Roman's digital avatar and previously generated clips, but **API access is paid/unavailable**. User can generate and export through iPhone HeyGen UI. Until API becomes available, HeyGen generation is manual; do not promise full automation.
- One existing HeyGen MP4 was uploaded to the root of user's Google Drive, named `Видео аватара.mp4`. User was in the Google Drive **Move** dialog targeting folder `roman-reels-assets`; moving it was suggested but not yet confirmed.
- Source assets in repo `roman-reels/pv/public/`: `ai`, `ai2`, `face`, `fonts`, `rr/kanaly`. Under `rr/kanaly` are `h1.mp4`, `h2.mp4`.
- `RomanReel.tsx` defines topics like `kanaly`, `manychat`, `otvety` and phrase-anchored inserts; new scripts need corresponding speech video, accurate transcription/timestamps, and compatible insert logic. **Do not reuse old word timing data for new audio.**
- Finished render Drive folder: https://drive.google.com/drive/folders/118fywgyvKvd4Pf6XHW5i3dwN4HPJ8fdN
- GitHub rclone remote `roman-drive` uses `RCLONE_CONFIG` secret. Its Google OAuth app may be in testing mode with short refresh token life; verify before production reliance.

## Next Codex work (recommended)
1. Audit repo/workflows and inspect Apps Script implementation via accessible source or ask user for exported script if necessary. Identify all missing links between approved queue and Remotion input. Do not assume arbitrary Gemini scripts are compatible with static `RomanReel` topics.
2. Design a **manual HeyGen intake → automated Drive pickup → transcription with word timestamps → template-compatible Remotion render → upload final MP4** workflow, with strict script/version mapping and deduplication. No HeyGen API and no paid integrations unless approved.
3. Implement first as **dry run/read-only** and then a **single approved test clip**. Never auto-render unapproved or altered scripts. Ensure approval hash validation, source-file checks, idempotence, retries, and safety status updates.
4. Consider a separate Drive `incoming` folder and an explicit file naming convention. Verify actual folder ID and access; do not guess.
5. Update README/status with verified milestones; distinguish tested components from planned ones.
6. Keep user-facing guidance in short Russian steps; Codex can make repo changes directly on the automation branch.

## Known caveats
- Google Sheet dropdown is not itself proof of approver identity; design robust authorization and script revision locking.
- Apps Script web app has an externally reachable URL; shared secret must be validated server-side.
- GitHub branch has diverged from `main`; avoid broad merges.
- Existing draft smoke test generates scripts; it is not evidence of complete 90-video production.
