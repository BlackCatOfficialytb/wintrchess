# Changelog

All notable changes to WintrChess since commit [`fcd3a54`](https://github.com/BlackCatOfficialytb/wintrchess/commit/fcd3a54eaec27c6b8b78b1dcef3d024a2aa2513e)
(*feat: Stockfish 19 with multi-threaded toggle and engine download manager*, 2026-09-18)
up to the latest commit on `master`.

---

## 2026-10-27 — UI polish: cloud-eval indicators, tablebase refinements

### Added
- **Lichess cloud-eval indicators** in the realtime engine panel
  ([affe34a], [df24107], [ad2b097]):
  - Green **`CLOUD`** badge next to `Depth: X` for cloud-analysed positions,
    olive-green `#477018` background, white regular-weight text
  - **`CLOUD`** badge at the end of each move row analysed by Lichess cloud eval
  - Hover tooltip *"Analysed by Lichess Cloud Eval"* (shown on the badge only),
    localized in EN / ZH / VI / RU / FR
- **DTM (distance to mate)** display for decisive tablebase results:
  exact `DTM N` chip in the tablebase widget header and `DTM n` badges on
  move rows when the tablebase provides exact mate distances
  ([08c32d0])

### Changed
- Tablebase variations are now **sorted by fastest distance to mate** —
  fastest mate first on the winning side; longest resistance first when
  defending (the tablebase's best move always stays on top) ([6070808])
- Decisive tablebase results report **the winning side only** — the losing
  side is no longer named ("BLACK WINS" instead of "WHITE IS MATED") ([7f03a7e])
- Depth indicator text enlarged (`0.7rem` → `0.85rem`) ([df24107])

### Fixed
- **Progress bar** restored to the brand blue (`--ui-blue: #467de8`) on a
  themed dark track — it previously rendered with the unstyled native
  (black) appearance; also made thinner (8px) ([08c32d0], [7f03a7e])

### Removed
- Untracked `cyberstrike.json` agent-harness artifact from the repository
  and remote; added to `.gitignore` ([0093cfb])

### Other
- Project renamed to **"WintrChess (BlackCat's fork)"** ([706cd0e])

---

## 2026-10-26 → 2026-10-27 — Tablebase evaluation integration

### Added
- **Syzygy tablebase evaluation** end to end:
  - `shared/src/lib/tablebaseLookup.ts` — pure TypeScript client for the
    [lila-tablebase HTTP API](https://github.com/lichess-org/lila-tablebase)
    (`GET /standard?fen=`), with ≤7-piece FEN eligibility checks, 2s
    abortable requests and white-POV evaluation/result-text helpers
    ([f83fd20], [2f4e7fd])
  - **Tablebase Evaluation Widget** displaying the top tablebase variations
    with DTZ badges, proper dark-theme tokens and collision-free flex layout
    ([d9f7f85], [99f5516])
  - Widget lives in the **Analysis tab** (not the report tab) and updates
    live on every position change with client-side requests — it works
    while analysis is still running ([99f5516])
  - Evaluation strategy extended to **Tablebase → Cloud Eval → Local
    Engine**: ≤7-piece positions get `EGTB_SYZYGY` engine lines with real
    `san`/`uci` move lists before any cloud or local evaluation ([f83fd20])

### Fixed
- Tablebase integration hardened against the real API schema: correct
  `category`/`dtz`/`dtm`/`moves[]` field mapping, exact piece counting from
  the FEN board field (castling rights and black pieces now handled),
  signed mate-distance handling in evaluations, no fabricated PV moves —
  all verified with live API probes ([2f4e7fd])
- Evaluation pipeline restored after a broken restructure:
  `ReferenceError: controller is not defined` resolved by reinstating the
  original `createGameEvaluator` process with abort support ([f83fd20])
- Missing `EGTB_SYZYGY` entry added to the `EngineVersion` enum ([f83fd20])
- Series of JSX/TypeScript errors in the GameReport component and tablebase
  lookup module ([2bc7a4e], [f914199], [d59f2ae], [3deae66])

---

## 2026-10-26 — Accuracy & variant fixes

### Added
- **Advanced game accuracy calculation** with consistency, volatility
  weighting and harmonic aggregation ([b5641a0])

### Fixed
- **Chess 960 fixtures**: the analyzer no longer chokes on Chess 960
  castling moves ([2578199], [faf5300])

---

## 2026-10-25 → 2026-10-21 — Rebrand & configuration

### Changed
- Site and repository links rebranded for BlackCatOfficial hosting ([2e18abf])

### Removed
- Production hostname whitelist ([1c71488])

### Moved
- Language selector relocated from the navigation bar into settings ([a77d879])

---

## 2026-10-18 → 2026-10-17 — Analysis UX & engine defaults

### Added
- **One-click reanalyze button** in the analysis toolbar ([bbbb2ff])
- Engine downloader cache/document flow documented ([00478dd])
- **Stockfish 11** engine support alongside Stockfish 19 ([fd5eb1c])

### Changed
- Default engine settings: depth 22, 3 lines, 5s time limit ([6302fbc])
- Engine payloads renamed to spell out their variants
  (`stockfish-19-full-single.js`, `-lite-multi.js`, …) ([8f9b6a4])
- Reanalyze icon rescaled to a 24×24 canvas and renamed `reanalysis.svg` ([f30d1f9])

---

## 2026-10-15 → 2026-10-14 — Security, storage & engine selection

### Security
- Fixed **all 20 npm audit vulnerabilities** without `--force` ([7b36a6a])

### Fixed
- All Stockfish engine entries; the engine download manager UI was dropped
  in favour of build-time engine provisioning ([4e9581e])

### Removed
- Opt-in SQLite storage (added behind a Mongo-compatible layer, then
  reverted back to MongoDB) ([39f5a00], [03961da])

---

## 2026-09-19 — Stockfish 19 engine infrastructure

### Added
- **Engine Downloads** dialog and Stockfish 19 engines ([fadf016])
- **Build-time engine downloads** from npm (`download-engines` script) so
  clients ship with all Stockfish payloads preloaded ([0f9d04f])

### Fixed
- Engine download cache and worker WASM loading ([759afec])

---

[ad2b097]: https://github.com/BlackCatOfficialytb/wintrchess/commit/ad2b097
[df24107]: https://github.com/BlackCatOfficialytb/wintrchess/commit/df24107
[affe34a]: https://github.com/BlackCatOfficialytb/wintrchess/commit/affe34a
[0093cfb]: https://github.com/BlackCatOfficialytb/wintrchess/commit/0093cfb
[7f03a7e]: https://github.com/BlackCatOfficialytb/wintrchess/commit/7f03a7e
[6070808]: https://github.com/BlackCatOfficialytb/wintrchess/commit/6070808
[08c32d0]: https://github.com/BlackCatOfficialytb/wintrchess/commit/08c32d0
[706cd0e]: https://github.com/BlackCatOfficialytb/wintrchess/commit/706cd0e
[99f5516]: https://github.com/BlackCatOfficialytb/wintrchess/commit/99f5516
[2f4e7fd]: https://github.com/BlackCatOfficialytb/wintrchess/commit/2f4e7fd
[f83fd20]: https://github.com/BlackCatOfficialytb/wintrchess/commit/f83fd20
[d59f2ae]: https://github.com/BlackCatOfficialytb/wintrchess/commit/d59f2ae
[f914199]: https://github.com/BlackCatOfficialytb/wintrchess/commit/f914199
[2bc7a4e]: https://github.com/BlackCatOfficialytb/wintrchess/commit/2bc7a4e
[3deae66]: https://github.com/BlackCatOfficialytb/wintrchess/commit/3deae66
[d9f7f85]: https://github.com/BlackCatOfficialytb/wintrchess/commit/d9f7f85
[b5641a0]: https://github.com/BlackCatOfficialytb/wintrchess/commit/b5641a0
[faf5300]: https://github.com/BlackCatOfficialytb/wintrchess/commit/faf5300
[2578199]: https://github.com/BlackCatOfficialytb/wintrchess/commit/2578199
[2e18abf]: https://github.com/BlackCatOfficialytb/wintrchess/commit/2e18abf
[a77d879]: https://github.com/BlackCatOfficialytb/wintrchess/commit/a77d879
[1c71488]: https://github.com/BlackCatOfficialytb/wintrchess/commit/1c71488
[6302fbc]: https://github.com/BlackCatOfficialytb/wintrchess/commit/6302fbc
[8f9b6a4]: https://github.com/BlackCatOfficialytb/wintrchess/commit/8f9b6a4
[f30d1f9]: https://github.com/BlackCatOfficialytb/wintrchess/commit/f30d1f9
[bbbb2ff]: https://github.com/BlackCatOfficialytb/wintrchess/commit/bbbb2ff
[00478dd]: https://github.com/BlackCatOfficialytb/wintrchess/commit/00478dd
[fd5eb1c]: https://github.com/BlackCatOfficialytb/wintrchess/commit/fd5eb1c
[7b36a6a]: https://github.com/BlackCatOfficialytb/wintrchess/commit/7b36a6a
[03961da]: https://github.com/BlackCatOfficialytb/wintrchess/commit/03961da
[39f5a00]: https://github.com/BlackCatOfficialytb/wintrchess/commit/39f5a00
[4e9581e]: https://github.com/BlackCatOfficialytb/wintrchess/commit/4e9581e
[759afec]: https://github.com/BlackCatOfficialytb/wintrchess/commit/759afec
[0f9d04f]: https://github.com/BlackCatOfficialytb/wintrchess/commit/0f9d04f
[fadf016]: https://github.com/BlackCatOfficialytb/wintrchess/commit/fadf016
