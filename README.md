# نبضة DJ (Nabda DJ)

A two-deck, Arabic-language browser DJ mixer with a phrase-aware, multi-strategy
**Auto DJ V7** engine: novelty-curve structural/phrase detection, a 9-strategy
transition planner, vocal-collision avoidance, human-like transition timing,
content-aware dynamic bass handoff, approximate loudness matching, a
warmup→build→peak→release session energy arc, session memory, and a
NEXT MIX preview panel (EXECUTE / SKIP / CHANGE TRACK) with a manual
TAKE CONTROL override.

The entire app is a single self-contained static page (`index.html`). All
audio decoding, analysis, and mixing runs client-side via the Web Audio API —
**there is no backend, no server, and no API keys**, so no environment
variables are required to run or deploy it.

## Project layout

```
index.html            The app — this is what gets deployed/served, as-is.
package.json           Build/test scripts (zero runtime dependencies).
vercel.json            Static deployment config (build check + output dir).
scripts/
  build.js             Validation-only "build": checks index.html exists
                        and that its inline <script> blocks parse cleanly.
                        There is nothing to bundle — this just fails fast on
                        a broken file before it reaches production.
  run_unit_tests.js     Runs every engine/test_*.js file and aggregates results.
  run_smoke_tests.js    Runs every engine/smoke_test*.js file (Playwright, optional).
engine/
  *.js (no test_/smoke_ prefix)   Pure DSP/decision modules (no DOM, no Web
                                   Audio) used by index.html: beat detection,
                                   key/chroma detection, phrase/structure
                                   analysis, vocal-collision proxy, transition
                                   strategy selection, dynamic bass EQ curve,
                                   loudness matching, human-timing easing
                                   curves, energy-journey arc, track scoring,
                                   and the beat/bar-phase math.
  test_*.js              One unit-test file per module above (plain Node
                          scripts, no test framework — each exits 0/1).
  simulate_session.js     Analytically-clocked long-session simulator: runs
                          the real decision engine against synthesized audio
                          to validate a 30+ minute Auto DJ session end-to-end
                          (clipping, dead air, phrase alignment, strategy
                          variety, etc.) far faster than real time.
  wrap.js, gen_wav.js, smoke_test*.js
                          Playwright end-to-end suite: wraps index.html for
                          browser loading, synthesizes tiny test WAV fixtures,
                          and drives the real UI (deck load/play, mixer,
                          performance pads, sampler, Auto DJ, TAKE CONTROL,
                          NEXT MIX preview/EXECUTE/SKIP/CHANGE TRACK).
```

## Running locally

Any static file server works, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `index.html` in the browser and load some audio files.

## Testing

```bash
npm install     # no-op: this project has zero dependencies
npm run build   # validates index.html
npm test        # runs all pure-module unit tests (engine/test_*.js)
```

### End-to-end (Playwright) tests

The Playwright browser suite is **not** wired into `npm install`/`npm test`
on purpose: it needs Playwright itself plus a Chromium binary, and neither
belongs in a zero-dependency static site's install/build path (a serverless
build environment shouldn't need to download a browser to serve one HTML
file). To run it locally or in CI with Playwright available:

```bash
npm install playwright          # one-time, local only (not saved to package.json)
npm run pretest:e2e             # regenerates engine/track_*.wav + engine/test_wrapped.html
npm run test:e2e                # runs engine/smoke_test*.js against a local server
```

If Playwright's own browser auto-discovery doesn't find a Chromium binary in
your environment, point it at one explicitly:

```bash
PW_CHROMIUM_PATH=/path/to/chromium npm run test:e2e
```

### Long-session simulation

```bash
node engine/simulate_session.js
```

Synthesizes a small library of tracks, runs the real Auto DJ decision engine
against them, simulates 30+ minutes of session time, and checks for clipping,
track-length overruns, unhandled vocal collisions, excessive phrase-fallback
use, bar-phase drift, gain-trim limits, and energy-arc progression.

## Deployment (Vercel)

This is a zero-config static site: `index.html` at the repo root, no build
tooling required. `vercel.json` sets:

- `buildCommand`: `npm run build` (validation only, see above)
- `outputDirectory`: `.` (the repo root — `index.html` is served as-is)
- Node version: pinned via `engines.node` in `package.json`

No environment variables are required for the app itself.

## Honesty note on the Auto DJ engine

Not every "intelligent" feature is full DSP — some are deliberate, documented
approximations (e.g. vocal-collision detection is a frequency-band energy
proxy, not source separation; loudness matching is a capped RMS-based
correction, not full LUFS/BS.1770 metering). See the in-app behavior and the
`engine/` module names for what each piece actually does.
