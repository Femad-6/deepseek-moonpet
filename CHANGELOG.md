# Changelog

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
