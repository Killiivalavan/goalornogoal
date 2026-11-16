# Goal or No-Goal

A minimal web game: watch a football clip, it freezes at the moment of the shot, guess **Goal** or **No Goal** in 10 seconds, see the rest of the clip, keep the streak alive. One miss ends the run.

## Outcome definition (curation rule)

"Did the ball cross the line as a direct result of this shot?" — includes deflections/rebounds off this shot; excludes goals later in the same passage. Tag consistently.

## Running locally

Static site — no build step. Serve the folder with any static server, e.g.:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Data

Clip database lives in `clips.json` (see `docs/blueprint.md` §4.1 for schema). `clips.example.json` shows the shape. Drop your curated clips into `clips.json`.

## Docs

- `docs/blueprint.md` — product spec, tech stack, state machine, risks.
- `docs/plan.md` — phase-by-phase implementation checklist.
