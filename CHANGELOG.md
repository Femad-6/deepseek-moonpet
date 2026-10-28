# Changelog

## 0.1.6 (2026-10-28)

- Added gentle click feedback, contextual companion lines without a voice pack, and silent focus encouragement with configurable 1–60 minute intervals, progress milestones, or an off switch. Preferences save immediately without resetting the timer; responses vary with progress and task status.
- Compressed the plugin portrait's embedded bitmap to fix DSH's `icon exceeds 256 KiB` metadata error without changing the SVG layout or original character sprite.
- Added icon-size checks to the release tests and package validation to prevent oversized icons from shipping again.

## 0.1.5 (2026-10-24, GitHub release)

- Added Sakura, Stella and Yuzu character packs, each with eight distinct transparent state sprites.
- Expanded the motivational catalogue from 12 to 25 lines with complete Chinese, English and Japanese subtitles.
- Added six optional 25-line voice packs; regenerated the four Chinese voices with Qwen3-TTS 1.7B and softer conversational instructions, while preserving the two Kokoro English voices.
- Included reproducible generation scripts, model revisions, per-clip provenance and checksums. Audio is distributed separately as a Release attachment; models and authoring environments are not included.
- Verified 43 offline tests, package contents and browser voice selection/playback.

## 0.1.4 (2026-10-24)

- Replaced the plugin emblem with the bundled Whale portrait and redesigned settings in graphite and ice blue.
- Unified close, expand, settings and stepper controls with SVG icons; improved narrow viewport layout and panel stacking.
- Included eleven reminder sounds with previews and recorded provenance.
- Fixed sound selection during running and paused focus timers without resetting remaining time or recorded work.
- Verified all reminder files are included in the npm package.

## 0.1.2 (2026-10-07, npm release)

- Added the built-in 鲸蓝 · Whale character with eight independent transparent full-body sprites: idle, thinking, working, waiting, done, error, stopped and offline.
- Kept the original Moon character and default selection; choose Whale in 字幕与资源 → 立绘包.
- Added pack discovery, state asset, transparency and consistent canvas validation.
- Published `dsh-moonpet@0.1.2` to npm; updated README with market, package-name and tarball installation instructions.

## 0.1.1 (2026-10-07, local build)

- Fixed WAV tail padding to update the data chunk and RIFF lengths, so players actually play the added silence.
- Added `scripts/make-voice-pack.py`: regenerate the Chinese / English voice packs with open-source neural speech engines (CosyVoice 2, GPT-SoVITS) and clone a character voice from a short reference clip. Standard library only, so the plugin keeps zero runtime dependencies.
- Documented engine choices, licensing caveats and cloning workflow in [docs/voices.md](docs/voices.md); added a `--selftest` mode for the audio path plus a CI step that runs it.

## 0.1.0

- Initial MoonPet（月伴）release, derived from MIT-licensed dsh-gal code.
- Independent package, bundle, HTTP routes, CSS, browser singleton and user storage.
- Event-driven idle / thinking / working / waiting / done / error / stopped states.
- Three AI-assisted character poses and newly generated UI assets; no upstream game voices or demo artwork.
- Quiet CSS motion, reduced-motion support and optional local usage display.
- Offline Node tests, packaging checks and CI configuration.
- English transcript parsing and Chinese / English / Japanese subtitle selection.
- Compact graphite settings panel with sage accents, switches and folded subtitle/resources controls. Removed redundant customization controls and implementation details from the menu.
- Persistent manual 25/5 focus timer, daily and lifetime work duration, selectable CC0 reminder sounds and Windows background audio playback with preview/dismiss controls.
