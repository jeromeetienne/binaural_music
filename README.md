# 🎧 Brainwave Player

A tiny, static web app that **synthesizes binaural and isochronic tones live in the browser** — for focus, relaxation, meditation, or sleep. No audio files, no server, no tracking. Everything is generated in real time with the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API), so a one-hour session is just a couple of oscillators running — not a download.

**▶️ Live: https://jeromeetienne.github.io/binaural_music/**

---

## Features

- **Two entrainment modes**
  - **Binaural** — a slightly different tone in each ear; the "beat" is perceived in the brain. *Requires headphones.*
  - **Isochronic** — a single tone pulsed on/off at the target rate. *Works on speakers.*
- **Presets** for the most common goals — one click sets the mode, frequencies, and background noise:

  | Preset | Band | Beat | Mode |
  | --- | --- | --- | --- |
  | Deep Focus | beta | 15 Hz | binaural |
  | Gamma 40 | gamma | 40 Hz | isochronic |
  | Flow | alpha | 10 Hz | binaural |
  | Meditate | theta | 6 Hz | binaural |
  | Sleep | delta | 2.5 Hz | binaural |

- **Fully tunable** — live sliders for beat frequency (with a brainwave-band label), carrier frequency, master volume, and background noise (pink / brown) with its own level.
- **Session timer** — 10 / 25 / 60 / 90 minutes or no limit, with a click-free fade-out.
- **Click-free** start/stop and parameter changes via smooth gain ramps.
- **Installable & offline (PWA)** — add it to your home screen or desktop and it runs full-screen, launches from an icon, and works with no network. A service worker caches the whole app shell; there are no audio files to download because everything is synthesized live.

## How it works

Brainwave entrainment plays a rhythmic stimulus at a target frequency in the hope the brain's dominant rhythm "follows" it. The bands this app targets:

| Band | Range | Associated state |
| --- | --- | --- |
| Delta | 0.5–4 Hz | deep sleep |
| Theta | 4–8 Hz | meditation, drowsiness |
| Alpha | 8–13 Hz | relaxed, calm focus |
| Beta | 13–30 Hz | alert, active focus |
| Gamma | 30–100 Hz (often 40 Hz) | high-level cognition |

A few technical notes worth knowing:

- **Carrier vs. beat.** The *carrier* is the audible base tone (80–500 Hz here); the *beat* is the low target frequency. For binaural mode the app plays `carrier − beat/2` in the left ear and `carrier + beat/2` in the right.
- **The 40 Hz preset uses isochronic on purpose.** The well-known 40 Hz gamma research (MIT's GENUS work) uses **amplitude-modulated tones / click trains** heard by both ears — much closer to an isochronic stimulus than to a binaural beat. 40 Hz is also near the upper edge where binaural-beat perception gets weak.
- **Background noise** (pink / brown) is generated procedurally too — pink via a Paul Kellet filter, brown by integrating white noise — and layered under the tones.

## Run locally

It's a static site — the simplest option is to just open the file:

```bash
open web/index.html        # macOS; or open it in any browser
```

Or serve it over HTTP (auto-installs `http-server` on first run, opens the browser):

```bash
npm start                  # → http://localhost:5173
```

## Project structure

```
binaural_music/
├── package.json           # ESM; "start" (dev server) + "deploy" (gh-pages) scripts
├── web/                   # the entire static app (this folder is what gets published)
│   ├── index.html
│   ├── css/styles.css
│   ├── js/app.js          # audio engine + UI
│   ├── manifest.webmanifest  # PWA metadata (name, colors, icons)
│   ├── sw.js              # service worker — caches the app shell for offline use
│   └── icons/             # app icons (SVG source + 192/512 PNG + apple-touch)
└── README.md
```

## Install as an app (PWA)

The app is a Progressive Web App, so it can be installed from the browser and run like a native app — full-screen, launched from an icon, and working entirely offline.

- **Desktop (Chrome/Edge):** click the install icon in the address bar, or use the browser menu → *Install Brainwave Player*.
- **iOS (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** menu → *Install app* / *Add to Home Screen*.

Once installed, the [service worker](web/sw.js) serves the cached app shell, so it opens instantly and keeps working with no connection. After you deploy a change, bump the `CACHE` version string in `web/sw.js` so installed clients pick up the new assets.

## Deploy

The site is published to GitHub Pages from the **`gh-pages` branch** (root), which holds the contents of `web/`. To redeploy after any change:

```bash
npm run deploy             # pushes web/ to the gh-pages branch via the gh-pages package
```

GitHub Pages rebuilds automatically within a minute or so.

## Tech stack

- **Web Audio API** — all tone/noise synthesis, no audio assets
- **Vanilla HTML / CSS / JS** — zero runtime dependencies
- **[`gh-pages`](https://www.npmjs.com/package/gh-pages)** + **[`http-server`](https://www.npmjs.com/package/http-server)** — dev-only tooling

## Disclaimer

This is a **wellness / focus aid, not a medical device**. The scientific evidence that binaural beats improve focus or sleep is mixed and often modest; effects vary a lot between people. Don't listen while driving or operating machinery, keep the volume comfortable, and consult a professional if you have a seizure disorder or other medical concerns.
