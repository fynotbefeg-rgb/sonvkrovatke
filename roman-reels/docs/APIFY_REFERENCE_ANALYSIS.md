# Apify reference analysis — 2026-10-10

Owner approved a total cap of $1, including speech and video. Two profile runs
were capped at $0.10 each; two selected Reel runs at $0.40 each. Applied API caps
were verified. No paid run was repeated. Final invoiced spend was not independently
verified; `usageTotalUsd` alone must not be described as the complete add-on bill.

## Verified results

| Reference | Plays | Likes | Comments | Duration |
| --- | ---: | ---: | ---: | ---: |
| [AI SEO audit](https://www.instagram.com/reel/DZm25XXMZ4I/) | 482,883 | 8,538 | 28,235 | 33.74 s |
| [AI YouTube workflow](https://www.instagram.com/reel/DeHPwcrhmy4/) | 288,812 | 5,993 | 13,346 | 61.25 s |

Both by `theautomationguy.ai`. These are public plays, not unique reach.
Counters were collected on the date above and can change. Reach is unknown.
Comments are encouraged by requests for a keyword to receive a resource; they
do not establish qualified demand, conversions, or the cause of popularity.

Apify returned transcripts and downloaded files for both exact shortcodes.
FFprobe confirmed video and AAC audio: SEO 540x960 VP9, 2,118,288 bytes;
YouTube 720x1280 H.264, 7,524,819 bytes. These are reference files, not factory
outputs, so the factory's 1080x1920 output gate does not apply to them.
Twenty evenly sampled frames per file were visually inspected. Continuous
playback, exact transition durations, and word-level subtitle accuracy were
not verified. Transcripts are Hindi/English and may contain recognition errors.

## Content and montage findings

SEO: speaker alternates with large illustrated cards describing audits and
business benefits. The opening promise of a first-place Google ranking is
unsupported. Diagram scores and growth graphics are illustrations, not verified
business statistics. Free/open-source claims and repository functionality require
separate verification before a script cites them.

YouTube: speaker remains in the lower region while demonstrations occupy the
upper region. Short subtitles appear over the speaker; selected words are yellow.
Cards illustrate hook formulas, thumbnails, editing, comments, weekly planning,
and setup. Complete autopilot and CTR improvement are unverified claims.

## Recommended factory follow-up

Use one concrete business process per Reel: owner problem, actual demonstration,
useful result, next action. Retain Roman's talking head, short word-synchronized
subtitles, and a complementary explanation region. Avoid covering his face with
large cards. Generate original explanatory diagrams or use authorized captures;
do not reuse these creators' downloaded footage as B-roll.

Claude follow-up: propose a split-screen component for the existing RomanFactoryV1,
anchored to speech and montage events. First demonstrate it with one original
business illustration and check safe zones/control frames. Codex should validate
asset provenance, event timing, render QC, and unchanged source audio. This is
a proposed next development step, not an implemented montage change.

## Live review and provenance

Simple Sheet `Темы и хуки`: topic group rows 5–7 = SEO audit; rows 8–10 = YouTube
workflow. E contains qualified analysis, F counters/date/unknown reach, G exact URL.
Topic decisions B5/B8 and new hook texts/decisions remain blank. No full scripts
were generated and no approval or production launch was performed. Simple-view
decisions are still not connected to Apps Script production gates.

Metadata run 38041724125 finished both Actors but failed the strict owner check:
Zapier's profile feed includes collaborations owned by other accounts. Read-only
recovery run 38041873986 retrieved existing datasets; paid collection was not repeated.
Collector now filters those mismatches rather than discarding verified results.
Detail run 38041968344 succeeded. Read-only media inspection 38042298586 succeeded
after installing FFmpeg; an earlier inspection lacked FFprobe and made no paid calls.
Private Actions artifacts expire after three days; original videos/transcripts and
third-party frames are not committed to Git. Durable sanitized evidence is in
`research/apify-reference-results.json`. No tokens or signed media URLs are published.
