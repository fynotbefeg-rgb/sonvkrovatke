# Codex handoff — Roman Reels automation
Updated: 2026-10-09

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
