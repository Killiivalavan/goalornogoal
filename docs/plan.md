# Goal or No-Goal — Implementation Plan

> Phase-by-phase execution checklist derived from `docs/blueprint.md`. Tick items as completed. Do not start coding until the plan is reviewed.

---

## Phase 0 — Decisions & setup (prep)

- [x] Confirm scope lock: no accounts, leaderboards, multiplayer, analytics beyond page views, no backend.
- [x] Confirm outcome definition: "Did the ball cross the line as a direct result of this shot?" (includes deflections/rebounds off this shot; excludes later goals in the same passage). Document in README.
- [x] Create repo `goalornogoal` and initial commit.
- [x] Add `.gitignore` (OS/editor defaults).
- [x] Decide hosting target: GitHub Pages (primary), Netlify/Vercel/Cloudflare as fallback.

## Phase 1 — Prep: data + docs

- [ ] Create `clips.json` with 10 hand-curated clips.
- [ ] For each clip: verify embeddability (load in a test page).
- [ ] Record `startAt`, `pauseAt`, `endAt` (absolute seconds) per clip.
- [ ] Record `answer` (`"goal"` / `"nogoal"`), `difficulty`, `note`.
- [ ] Validate schema: `id` unique; `pauseAt >= startAt`; `endAt` (if set) `> pauseAt`.
- [x] Write `README.md` with outcome definition and curation notes.
- [ ] (data) Create `clips.json` with 10+ hand-curated clips — in progress by user.
- [ ] (data) Validate schema: unique ids; `pauseAt >= startAt`; `endAt` (if set) `> pauseAt`.

## Phase 2 — Skeleton (views + styling)

- [x] Create `index.html` with two views: `#landing` and `#game`, toggled by class on `<body>`.
- [x] Landing view: short description + one `Start` button.
- [x] Game view: player container, 10s timer, two buttons (Goal / No Goal), live streak counter, "Play again?" prompt area, empty-state.
- [x] Create `style.css`: base layout, fullscreen-friendly, player wrap with `.correct`/`.wrong` classes.
- [x] View toggling logic in `app.js` (no router).
- [ ] Add `assets/` (favicon, icons) — optional, deferred.

## Phase 3 — YouTube integration

- [x] Load IFrame API script once.
- [x] Create player on container div; on `onReady`: `mute()`, seek to `startAt`, `playVideo()`.
- [x] Embed params: `mute=1&autoplay=1&controls=0&disablekb=1&modestbranding=1&rel=0&playsinline=1&fs=1&enablejsapi=1&origin={origin}` (start via playerVars.start + loadVideoById startSeconds).
- [x] `onStateChange`: on `PLAYING`, start rAF poll.
- [x] Poll: when `currentTime >= pauseAt` → `pauseVideo()` + `seekTo(pauseAt)` → go `DECISION`.
- [x] `onError`: trigger dead-clip skip.
- [x] Reveal playback: seek to `pauseAt`, `playVideo()`; poll to `endAt` (or end) then advance.
- [x] Locking timeline: snap back if `> pauseAt + 0.15` pre-answer; snap if `< startAt`; allow forward to `endAt`.
- [x] Click-through prevention: transparent overlay `<div>` over iframe.

## Phase 4 — Game loop

- [x] Implement state machine: `LANDING → LOADING → PLAYING → DECISION → REVEAL → (correct) LOADING | (wrong) RUN_OVER`.
- [x] `LANDING`: on Start → request fullscreen, reset sessionStorage, go `LOADING`.
- [x] `LOADING`: pick random unseen clip (reset `seen` if exhausted); create/update player; go `PLAYING`.
- [x] `DECISION`: start 10s countdown; enable Goal/No-Goal buttons; on tap or timeout → `REVEAL`.
- [x] `REVEAL`: compare answer; apply `.correct`/`.wrong` border glow + overlay text; play rest; branch on result.
- [x] `RUN_OVER`: show "Play again?"; on confirm → clear sessionStorage → restart.
- [x] Timeout in `DECISION` counts as a miss.
- [x] Streak increment on correct, reset on wrong, persisted in `sessionStorage`.
- [x] Seen-tracking: avoid repeats until pool exhausted.

## Phase 5 — Lockdown UX

- [x] Fullscreen: `document.documentElement.requestFullscreen()` inside Start click handler; Esc exits; small exit button.
- [x] Mute: `player.mute()` on ready (also `mute=1` param); no unmute toggle.
- [x] No native controls visible; keyboard disabled (`disablekb=1`).
- [x] Dead-clip skip: on `onError`, mark seen, load next, streak unchanged, no crash.
- [ ] Test mobile fullscreen early (pending real-device test).

## Phase 6 — Visual reveal

- [x] Wrap player in `.player-wrap`; toggle `.correct`/`.wrong` during `REVEAL`.
- [x] CSS: green/red border glow + box-shadow + centered overlay text ("✓ Goal" / "✗ No Goal").
- [x] Remove classes on next load.

## Phase 7 — Expand content

- [ ] Curate to 50–100 clips following process in blueprint §8.
- [ ] Mix obvious goals, obvious misses, genuinely close ones.
- [ ] Tag `difficulty` and `note` consistently.

## Phase 8 — Deploy

- [ ] Deploy to GitHub Pages.
- [ ] Test on mobile (iOS Safari, Android Chrome).
- [ ] Verify autoplay muted, fullscreen, timer, streak, sessionStorage clearing.

## Phase 9 — Beta

- [ ] Share with testers.
- [ ] Observe replays; iterate on pause points / timer.
- [ ] Note pre-roll ads feedback; consider unmute-on-interaction if requested (one-line change).

---

## Data schema (clips.json)

```json
[
  {
    "id": "ucl-2023-final-01",
    "videoId": "dQw4w9WgXcQ",
    "startAt": 0.0,
    "pauseAt": 12.4,
    "endAt": 19.0,
    "answer": "goal",
    "difficulty": "medium",
    "note": "deflection off defender"
  }
]
```

Fields:
- `id` — unique string (seen-tracking).
- `videoId` — YouTube video ID.
- `startAt` — seconds; playback start (default `0.0`).
- `pauseAt` — seconds; freeze moment (absolute). Must be `>= startAt`.
- `endAt` — optional; stop reveal here (must be `> pauseAt`); else play to end.
- `answer` — `"goal"` | `"nogoal"`.
- `difficulty` — `"easy"` | `"medium"` | `"hard"` (metadata only).
- `note` — optional curation note.

## sessionStorage shape

Key `gng_state` → `{ "streak": 0, "seen": ["id1", "id2"] }`.

## Testing checklist

- [ ] Autoplay works muted on Chrome/Safari/Firefox (desktop + mobile).
- [ ] Pause lands within ~0.2s of intended frame on ≥8/10 test clips.
- [ ] Fullscreen enters on Start; Esc exits; mobile doesn't break.
- [ ] Timer counts down accurately; timeout = miss.
- [ ] Streak increments on correct, resets on wrong, persists across clips in same tab.
- [ ] Closing tab clears sessionStorage (fresh streak on reopen).
- [ ] Same clip not shown twice in one session until pool exhausted.
- [ ] Dead clip (removed video) skips without breaking streak or crashing.
- [ ] No native YouTube controls visible; keyboard doesn't seek.
- [ ] Visual reveal shows correct color/text.
- [ ] "Play again?" resets and restarts cleanly.

## Out of scope (do not add in v1)

Accounts, leaderboards, daily mode, difficulty selection, stats screen, sharing/emoji grids, slow-mo replay, "how close" notes, sound toggle, multiplayer, analytics beyond page views, backend of any kind.
