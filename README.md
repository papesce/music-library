# Music Library

Local MP3 library + wishlist — Node + React (Vite). Glassmorphism UI, virtualized track list, unified player with artwork + synced lyrics, and waveform-based track splitting.

![stack](https://img.shields.io/badge/stack-React%20%7C%20Vite%20%7C%20Node%20%7C%20SQLite-blue) ![license](https://img.shields.io/badge/license-MIT-green)

## Features

- **Library scan** — recursive MP3 walk, `music-metadata` + `node-id3` for title/artist/album/genre/year/duration/cover, duplicate detection
- **Virtualized grid** — `@tanstack/react-virtual`, sort by title/artist/album/genre/year/duration, dupe-only + hide-reviewed filters
- **Unified player** — single `UnifiedPlayer` (replaces dock + sheet + native `<audio>`): artwork + synced/plain lyrics side-by-side, default-expanded on play (0 clicks to lyrics), custom seek/transport, lightbox
- **Lyrics** — USLT tag or adjacent `.lrc`, synced line highlighting + auto-scroll; auto-detect via LRClib (synced) → fallback local Whisper `base` with timestamps, preview+confirm + batch mode
- **Edit** — change tags + cover, renames file on disk, updates DB
- **Split** — `wavesurfer.js` waveform, regions/markers, export segments
- **Wishlist** — add/edit/delete with priority + date sort, persisted in SQLite
- **Persistence** — `node:sqlite` (WAL), `data/music.db`, folders/tracks/wishlist tables, JSON migration

## Stack

- Client: React 18, Vite 5, `@tanstack/react-virtual`, `wavesurfer.js`
- Server: Node 22+, `tsx`, `node:sqlite` (`DatabaseSync`), `music-metadata`, `node-id3`
- Styling: custom glassmorphism (`src/index.css`), no UI framework

## Getting started

```bash
# recommended — auto-installs deps + whisper (.whisper-venv) if missing
./start.sh dev        # or ./start.sh --setup  (setup only) / ./start.sh --check
# server http://localhost:3055, client http://localhost:5173 (proxied /api)

# manual
npm install
npm run dev           # concurrently dev:server (tsx --watch) + dev:client (vite)
# production
npm run build
npm start             # NODE_ENV=production node --loader tsx server/index.ts
# or
./start.sh start      # build + start with whisper PATH
```

Environment: `PORT` (default `3055`). No other env required. Lyrics: LRClib lookup works without setup; Whisper `base` (~140MB, downloaded on first transcribe) is auto-installed by `./start.sh` into `.whisper-venv` (gitignored) — Node server auto-prepends it to `PATH`.

## Scripts

| script | what |
|---|---|
| `dev` | concurrently `dev:server` + `dev:client` |
| `dev:server` | `tsx --watch server/index.ts` |
| `dev:client` | `vite` |
| `build` | `vite build` |
| `start` | production server |
| `typecheck` / `lint` / `format` / `check` | `tsc --noEmit`, `eslint`, `prettier` |

## Project layout

```
server/        HTTP API + SQLite (db.ts, index.ts)
data/          gitignored — music.db, config.json, library.json, wishlist.json (legacy)
src/
  api.ts
  App.tsx
  components/  FolderDrawer, split/*, ui/*
  features/    library/*, player/* (UnifiedPlayer, usePlayer, useLyrics), wishlist/*, settings/*
  hooks/       useToast, useWaveSurfer, ...
  lib/         format, path
```

## API (subset)

`GET /api/config`, `POST /api/config`, `POST /api/scan`, `GET /api/library`, `DELETE /api/track`, `PATCH /api/track`, `GET /api/lyrics?path=`, `GET /api/cover?path=`, `GET /api/stream?path=` — all paths validated against configured folders (403 if outside).

## Privacy / .gitignore

`data/` is ignored (`*.json`, `*.db`, `*.db-*`, `*.sqlite*`, `.wal/.shm`). Your absolute folder paths and library stay local. No secrets are checked in — `.env` is ignored (commit `.env.example` if needed). This repo ships empty `data/` placeholders.

## License

MIT — see [LICENSE](LICENSE).
