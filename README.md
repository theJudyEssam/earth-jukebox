# Earth Jukebox

A 3D Earth you fly around by voice, keyboard or mouse, built for the NASA Space Apps 2026 "Earth Information Jukebox" challenge. As you fly, data stories for that part of the planet pop up. Choose one and a window opens with the NASA visualization, which the app reads frame by frame and turns into sound (and haptic pulses) live.

- **Phase 1 (done):** globe, voice navigation, spoken and captioned narration, sound and haptics pipeline.
- **Phase 2 (done):** six NASA SVS / EIC data stories, region-aware options, an accessible data pop-up, live frame-to-sound analysis.
- **Phase 3 (next):** a vibrating hardware add-on (see `hardware/README.md`).

## Run it

It's a static site with no build step and no install. Three.js and the Earth textures are bundled, so it works offline (except voice recognition in Chrome, which uses Google's speech service).

```bash
cd earth-jukebox
python3 -m http.server 8000
# open http://localhost:8000 in Chrome or Edge
```

It needs to be served over `http://localhost` or `https://`. Opening `index.html` directly as a file won't work, because ES modules and the microphone are blocked on `file://`. Any static server works (`npx serve`, VS Code Live Server). To host it, drop the folder on GitHub Pages or Netlify.

**Browsers:** voice recognition works in Chrome, Edge and Safari. Firefox has no speech recognition, so the app falls back to the typed command box, which understands the same phrases.

## Get the NASA media (recommended, once)

```bash
python3 tools/fetch_svs.py          # about 120 MB into data/svs/
python3 tools/fetch_svs.py --big    # optional: lightning and air-quality movies (+306 MB)
```

Without this step the pop-ups stream the visualizations from svs.gsfc.nasa.gov. Browsers usually won't let a page read the pixels of another site's video, though. In that case the pop-up still shows the visualization, but plays *approximate* sound for the region and says so on screen. With the files mirrored, every pop-up is analysed live and works offline.

## The data stories

| Option | NASA source | Shows up over | How it sounds |
|---|---|---|---|
| Carbon dioxide | [SVS 5196](https://svs.gsfc.nasa.gov/5196/), GEOS/DYAMOND CO₂, 2020 | Everywhere | Plume brightness gives the drone's pitch and brightness; frame-to-frame change makes a breathing swell; plume position sets left/right |
| Lightning | [SVS 5011](https://svs.gsfc.nasa.gov/5011/), ISS LIS 2017–2023 | Tropics and storm hotspots (Congo, Lake Maracaibo, Great Plains…) | Each flash is a drum hit panned to where it appears; more flashes make a busier rhythm |
| Aerosols | [SVS 5669](https://svs.gsfc.nasa.gov/5669/), GEOS-FP, 19 Aug 2025 | Sahara, Atlantic, Africa, Mediterranean, Hawaii… | Still image swept left to right like a score. Blue sea salt is surf, pink dust is sandy hiss, orange smoke is a crackling rumble, green sulfate is a glass chord |
| Forest height | [SVS 4950](https://svs.gsfc.nasa.gov/4950/), GEDI lidar | Forests; picks the California, Senegal or Maryland flyover when you're there | Taller canopy plays higher notes; tall patches shimmer |
| Air quality | [SVS 5533](https://svs.gsfc.nasa.gov/5533/), GEOS-CF, 2024 fire season (EIC hyperwall) | North America | The chord tightens from calm to tense and rough as pollution rises; the pulse speeds up |
| Atmospheric river | [SVS 4960](https://svs.gsfc.nasa.gov/4960/), MERRA-2 | California, Pacific, Hawaii, Alaska | Water vapour swells a wave drone; clouds and rain add raindrops. Has NASA's narration and captions |

Each pop-up shows meters for what you're hearing, a live text summary, notes for the region you opened it from, how the data maps to sound, and the NASA credit. Zoom all the way out and all six are offered.

## Try saying

| Say | What happens |
|---|---|
| "Take me to the Amazon" / "Show me Greenland" / "Where is Tokyo" | Flies there, drops a marker and reads a short description |
| "Go to 40 north 74 west" | Flies to coordinates |
| "Zoom in", "Zoom out a lot", "Go north", "Move left a little" | Moves the camera |
| "Where am I?" | Describes the spot under the crosshair: place, land cover, coordinates, altitude |
| "Play" / "Stop", "Louder" / "Quieter" | Starts or stops the sonification under the crosshair |
| "Switch to latitude", "What am I hearing?" | Changes the data layer, or explains how its data becomes sound |
| "Take me on a tour", then "Next" / "Back" | An 8-stop tour that previews the phase 2 data stories |
| "What data is here?", "Open lightning", "Open number 2" | Reads the options for this region, or opens one in the pop-up |
| "Pause", "Play", "Describe", "Close" (with the pop-up open) | Controls the pop-up |
| "Help", "What places can I visit?" | Lists the commands or the destinations |
| "Stop talking" / "Talk to me", "Stop listening" | Turns spoken replies or the microphone off |

**Keyboard:** `1`–`6` open a data option, arrow keys move (Shift for bigger steps), `+`/`-` zoom, `V` voice, `/` command box, `D` describe, `P` play/stop, `T`/`N`/`B` tour, `R` reset, `S` speech on/off, `H` help, `Esc` stops everything.

## Accessibility built in

- **Every response goes three ways:** an ARIA live region for screen readers, a large on-screen caption for deaf and hard-of-hearing users, and optional speech synthesis. Turn speech off if you use a screen reader, so it isn't read twice.
- The microphone pauses while the app is speaking, so it doesn't hear itself.
- **Earcons** confirm each action without looking: listening on/off, command understood, not understood, and arrived.
- Fully keyboard-operable. The globe is a focusable `role="application"`, and its accessible description updates with the current location.
- Respects `prefers-reduced-motion` (flights become instant jumps and auto-spin is disabled), uses 44px touch targets and visible focus rings, and the layout works on phones.

## How the sound works now (placeholder data)

Three voices sample the active data layer at the crosshair and to its west and east, panned left, centre and right, so you can hear what's coming as you move. Each value is mapped onto an A minor pentatonic scale (so the music stays pleasant whatever the data does), and also drives filter brightness and pulse tempo. Ocean becomes surf noise. Each pulse is mirrored to the haptics output.

The two layers today are demos, labelled as such in the UI: **Land and ocean**, which uses Blue Marble brightness, and **Latitude**, a smooth synthetic field.

## Architecture and the hooks for phases 2 and 3

```
src/
  main.js              controller: commands → globe / narrator / audio
  globe/globe.js       Three.js globe: flyTo, zoom, nudge, picking, marker, setOverlay()
  globe/geo.js         lat/lon ↔ 3D, distances, coordinate formatting
  voice/recognizer.js  Web Speech API wrapper (continuous, auto-restart, pause while speaking)
  voice/commands.js    natural-language parser (+ fuzzy place matching), help text
  ui/narrator.js       live region + captions + speech synthesis
  audio/engine.js      Web Audio earcons + sonifier
  data/places.js       ~50-place gazetteer and the tour
  data/describe.js     lat/lon → "over the Sahara, desert below, 23° N 12° E"
  data/datasets.js     ★ the six data stories: media, regions, notes, sound mapping
  audio/analyzer.js    computer vision: frame pixels → coverage, intensity, hue mix, flashes, motion
  audio/sonifiers.js   one sonifier per dataset (features → sound + haptics)
  ui/data-dialog.js    the accessible pop-up (<dialog>), media loading, live analysis loop
  data/layers.js       ★ DATA LAYER HOOK: the DataLayer interface, demo layers, ImageDataLayer
  data/image-sampler.js equirectangular pixel sampling + colorbar inversion
  haptics/haptics.js   ★ HAPTICS HOOK: pulse(intensity, ms) → vibrate, meter, Web Serial
tools/fetch_svs.py     mirrors the NASA media into data/svs/
hardware/README.md     serial protocol + Arduino starter sketch for phase 3
```

**Adding a data story:** add an entry to `src/data/datasets.js` (media URLs, regions, notes) and, if it needs its own sound, a class in `src/audio/sonifiers.js`. `tools/fetch_svs.py` picks the new files up automatically.

**Globe-wide layers:** add a layer to `LAYERS` in `src/data/layers.js`. The `ImageDataLayer` class already takes an equirectangular EIC frame (for example from SVS 5196 CO₂) plus its colorbar, inverts colour back to a value, and drapes the frame on the globe via `globe.setOverlay()`. For animated sequences, add `frames`/`fps`/`setTime()` and swap the sampler's image each frame. The sonifier, haptics and "what am I hearing" narration pick the layer up automatically.

**Phase 3 (hardware):** `Haptics.pulse()` already fires in time with the music. Connect a microcontroller over USB with the "Connect haptic device" button (Chrome/Edge desktop) and it receives `P <0-255> <ms>` lines. See `hardware/README.md`.

## Credits

Earth textures (Blue Marble based) come from the three.js examples (MIT). Three.js r160 (MIT) is vendored in `vendor/three/`. NASA imagery is public domain; credit NASA SVS when phase 2 adds EIC frames.
