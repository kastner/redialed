# Redialed

A small cents-first pitch memory experiment inspired by [Dialed Sound](https://dialed.gg/sound).

All design and game-flow credit goes to [dialed.gg/sound](https://dialed.gg/sound). This repository is just a personal experiment for trying a cents-based version of the idea. It is not intended as a public product, clone, or thing I plan to distribute.

Open `index.html` in a browser and press Start. Each round plays one tone, then asks for a pitch-class match in cents. The answer sweep is one octave wide, so octave displacement does not matter.

## Pitch Model

- One octave is `1200` cents.
- The answer dial sweeps a randomized one-octave window.
- Scoring uses circular cents error, so octave displacement does not count against the player.
- The curve currently awards up to `10` points per tone with a `55` cent falloff.
- A result is visually marked as a note hit when it lands within `100` cents of the target pitch class.
- Result feedback uses tuning rings: bull's-eye around `5` cents, inner ring around `10`, and outer ring around `25`, with a slightly wider allowance for flat misses.
- Playback currently uses `PLAYBACK_OCTAVE_OFFSET = 0` in `app.js` so phone speakers play the pitch class around C4 instead of the lower C3 octave. To roll this back, change that constant to `-1`.

## To Do

- Explore an interval mode where the heard tone becomes the reference and the player must land a requested interval away from it.
