# Goal or No-Goal — Implementation Blueprint

> A minimal, addictive web game: watch a football clip, it freezes at the moment of the shot, guess **Goal** or **No Goal** in 10s, see the rest of the clip, keep the streak alive. One miss ends the run.
>
> Scope is deliberately tiny. No accounts, no leaderboards, no multiplayer, no analytics beyond basics. Ship the loop, measure whether people replay.

---

## 1. Product spec (locked)

### Pages
- **Landing** — short description + one `Start` button.
- **Game** — clip player, 10s timer, two buttons (Goal / No Goal), live streak counter.

### Core loop
1. Clip plays the buildup → auto-pauses at the foot-contact frame.
2. 10s timer starts; player taps **Goal** or **No Goal**.
3. Reveal: rest of the clip plays with a visual indication of whether they were right.
4. Correct → streak +1 → next clip.
5. Wrong or timeout → streak dies → "Play again?" prompt → reset.

### Storage
- Streak + seen-clip list live in `sessionStorage` only.
- Session ends → clean reset, nothing persists (no best streak, no history).

### UX constraints (locked)
- Full screen on Start (user gesture).
- All videos muted (enables reliable autoplay).
- Auto-play; no play/pause/seek controls exposed; timeline locked.
- Dead clips skipped silently (never counted as a miss).

---

## 2. Tech stack (free tier everywhere)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vanilla HTML / CSS / JS (no framework, no build step) | Smallest possible, zero tooling, easy to host anywhere |
| Video | YouTube IFrame Player API | Free hosting, no bandwidth cost, real footage |
| Clip data | Static `clips.json` in repo (optional: Google Sheets → JSON later) | Free, version-controlled, trivial to edit |
| State | `sessionStorage` | Built-in, scoped to tab/session, auto-clears |
| Hosting | GitHub Pages (free) | Static site, free, custom domain optional |
| Alt hosts | Netlify / Vercel / Cloudflare Pages (all free tiers) | Drop-in fallbacks |

No backend. No database server. No auth. No paid service.

---

## 3. Repository layout

```
goalornogoal/
├── index.html          # landing + game views (single page, toggled)
├── style.css
├── app.js              # state machine + YouTube control + timer
├── clips.json          # clip database (the only "DB")
├── assets/
│   └── (icons, favicon)
├── tools/
│   └── (optional: sheet->json helper later)
└── README.md
```

Single HTML file with two views toggled by class is enough; no router needed.

---

## 4. Data model

### 4.1 Clip schema (`clips.json`)

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
- `id` — unique string (used for seen-tracking).
- `videoId` — YouTube video ID.
- `startAt` — seconds; where playback begins (default `0.0`). Use to skip long intros or reuse a sub-segment of a longer highlight reel. `pauseAt`/`endAt` remain absolute seconds in the original video.
- `pauseAt` — seconds; moment to freeze (foot about to touch ball). Tune per clip. Must be `>= startAt`.
- `endAt` — optional; stop reveal here (or play to video end). If set, must be `> pauseAt`.
- `answer` — `"goal"` or `"nogoal"`.
- `difficulty` — `"easy" | "medium" | "hard"` (metadata only; not shown in v1).
- `note` — optional curation note (ignored by app).

### 4.2 sessionStorage shape

Key `gng_state` → JSON object:
```json
{
  "streak": 0,
  "seen": ["ucl-2023-final-01", "pl-2022-07"]
}
```

- `streak`: current run length.
- `seen`: clip IDs already shown this session (avoid repeats).
- Nothing else. No best streak, no timestamps, no user id. Cleared automatically when the tab/session closes.

---

## 5. State machine

States: `LANDING` → `LOADING` → `PLAYING` → `DECISION` → `REVEAL` → (correct) `LOADING` or (wrong) `RUN_OVER` → `LANDING`/restart.

| State | What happens |
|---|---|
| `LANDING` | Show description + Start. On Start: request fullscreen, reset sessionStorage, go `LOADING`. |
| `LOADING` | Pick a random unseen clip (reset `seen` if exhausted). Create/update iframe. Go `PLAYING`. |
| `PLAYING` | Video plays from `startAt` (default 0). Poll `getCurrentTime()`; when `>= pauseAt`, `pauseVideo()` + `seekTo(pauseAt)`, go `DECISION`. |
| `DECISION` | Start 10s countdown. Enable Goal/No-Goal buttons. On tap or timeout → go `REVEAL`. |
| `REVEAL` | Compare answer. Apply border color (green = right, red = wrong) + overlay text. `playVideo()` from `pauseAt` to `endAt`/end. Then branch. |
| `RUN_OVER` | Show "Play again?" On confirm → clear sessionStorage, back to `LANDING` (or directly `LOADING`). |

Timeout in `DECISION` counts as a miss (wrong). (Configurable later; ship as miss.)

### Dead-clip handling
If the player fires `onError` (removed/private/embed-disabled), skip: remove from `seen`? No — mark seen and load next without changing streak. Never punish for bad data.

---

## 6. YouTube IFrame integration

### Embed params
```
https://www.youtube.com/embed/{videoId}
  ?mute=1&autoplay=1&controls=0&disablekb=1
  &modestbranding=1&rel=0&playsinline=1&fs=1
  &enablejsapi=1&origin={yourOrigin}
```

- `mute=1` + `autoplay=1` → reliable autoplay (browsers allow muted autoplay).
- `controls=0` → no play/pause/seek UI.
- `disablekb=1` → no keyboard control.
- `modestbranding=1` / `rel=0` → reduce YouTube chrome.
- `playsinline=1` → inline on mobile (we manage fullscreen ourselves).

### API usage
- Load IFrame API script once.
- Create player on a container div; on `onReady`, `playVideo()`.
- `onStateChange`: when `PLAYING`, start a `requestAnimationFrame`/`setInterval` poll; on reaching `pauseAt`, `pauseVideo()` then `seekTo(pauseAt, true)` to lock the exact frame.
- `onError`: trigger dead-clip skip.
- Reveal: `seekTo(pauseAt, true)` then `playVideo()`; optionally `pauseVideo()` at `endAt` via the same poll.

### Locking the timeline
On load, seek to `startAt` before playing (use `loadVideoById(videoId, startAt)` when reusing the player, or the embed `start` param on first load). Even with `controls=0`, guard with the poll: if `getCurrentTime() > pauseAt + 0.15` while in `DECISION`/`REVEAL`-pre-answer, snap back to `pauseAt`; if `getCurrentTime() < startAt`, snap forward to `startAt`. In `REVEAL`, allow forward up to `endAt` (or video end if unset).

### Click-through prevention
Overlay a transparent `<div>` over the iframe to capture clicks (prevents opening YouTube). ⚠️ Technically against YouTube ToS (obscuring the player) — acceptable for beta; revisit for a shipped product.

---

## 7. Fullscreen, mute, locked UX

- **Fullscreen:** `document.documentElement.requestFullscreen()` (or the game container) inside the Start click handler. Provide exit via Esc (native) + a small button. Test on mobile early.
- **Mute:** `player.mute()` on ready (also covered by `mute=1` param). No unmute toggle in v1 — keeps it simple and guarantees autoplay.
- **Visual reveal:** wrap player in `.player-wrap`; toggle class `.correct` / `.wrong` during `REVEAL`. CSS: green/red border glow + box-shadow + a centered overlay text ("✓ Goal" / "✗ No Goal"). Remove classes on next load.
- **Timer:** 10s countdown shown; on 0 → treat as miss.

---

## 8. Clip curation (beta: 50–100 clips)

Process per clip:
1. Find an embeddable highlight (official club channels / long-standing highlight channels preferred — fewer takedowns).
2. Verify embeddability (load in a test page; some videos block embedding).
3. Scrub to the moment just before foot contacts ball; record `pauseAt` (use a player showing seconds, or step frame-by-frame).
4. Record the actual outcome as `answer`.
5. Pick camera angle consistently (prefer 1–2 angles) so difficulty is comparable.
6. Tag `difficulty` (easy/medium/hard) and a `note`.
7. Add to `clips.json`.

Mix: obvious goals, obvious misses, genuinely close ones. The close ones are the game.

### Outcome definition (decide once, tag consistently)
"Did the ball cross the line as a direct result of this shot?" — includes deflections/rebounds off this shot; excludes goals later in the same passage. Document this in the README so future curation stays consistent.

---

## 9. Build order (phases)

1. **Prep** — create repo, `clips.json` with 10 hand-curated clips, README with outcome definition.
2. **Skeleton** — `index.html` landing + game views, basic CSS, view toggling.
3. **YouTube integration** — embed, autoplay muted, pause-at-target, reveal playback.
4. **Game loop** — timer, buttons, answer compare, streak, sessionStorage, seen-tracking.
5. **Lockdown UX** — fullscreen, controls hidden, keyboard disabled, click overlay, dead-clip skip.
6. **Visual reveal** — border glow + overlay text.
7. **Expand** — curate to 50–100 clips.
8. **Deploy** — GitHub Pages, test on mobile.
9. **Beta** — share, observe replays, iterate on pause points / timer.

---

## 10. Testing checklist

- [ ] Autoplay works muted on Chrome/Safari/Firefox (desktop + mobile).
- [ ] Pause lands within ~0.2s of intended frame on at least 8/10 test clips.
- [ ] Fullscreen enters on Start; Esc exits; mobile doesn't break.
- [ ] Timer counts down accurately; timeout = miss.
- [ ] Streak increments on correct, resets on wrong, persists across clips in same tab.
- [ ] Closing tab clears sessionStorage (fresh streak on reopen).
- [ ] Same clip not shown twice in one session until pool exhausted.
- [ ] Dead clip (removed video) skips without breaking streak or crashing.
- [ ] No native YouTube controls visible; keyboard doesn't seek.
- [ ] Visual reveal shows correct color/text.
- [ ] "Play again?" resets and restarts cleanly.

---

## 11. Risks & caveats

- **Clip longevity:** takedowns and embed-disabled videos will rot the database. For beta (small, short-lived) this is manageable. For a real product later, need licensed footage or a dead-clip replacement pipeline. Don't solve now.
- **Frame precision:** keyframe intervals vary; some clips won't land exactly. Tune `pauseAt` per clip; accept ~0.3s tolerance.
- **Mobile iframe fullscreen:** can be quirky; test early and be ready to fall back to inline large player.
- **Click-overlay vs ToS:** overlaying the player to block click-through is against YouTube ToS. Fine for beta; revisit before scaling.
- **Ads:** embedded videos may show pre-roll ads, interrupting the quick-round feel. Nothing you can disable. Note for beta feedback.
- **Mute trade-off:** no goal-horn payoff. If beta feedback wants sound, unmute on first interaction is a one-line change.

---

## 12. Out of scope (do not add in v1)

Accounts, leaderboards, daily mode, difficulty selection, stats screen, sharing/emoji grids, slow-mo replay, "how close" notes, sound toggle, multiplayer, analytics beyond page views, backend of any kind.

These can be reconsidered only after the core loop proves addictive.
