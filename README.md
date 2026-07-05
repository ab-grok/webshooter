# WebShooter

Short description

- **WebShooter** takes scheduled screenshots of configured webpages, stores shot metadata in Postgres and an external bucket, and provides a Next.js UI for browsing, selecting, downloading and managing captured shots.

Quick links

- Deps: [package.json](package.json)
- Server logic / DB interaction: [src/lib/server.js](src/lib/server.js)
- Frontend gallery / swiper: [src/components/Gallery.tsx](src/components/Gallery.tsx)
- Scroll-preserve helper: [src/lib/usePreserveScroll.ts](src/lib/usePreserveScroll.ts)
- Main page wiring (state passed to Shots/Gallery): [src/app/(main)/page.tsx](<src/app/(main)/page.tsx>)
- Shots component: [src/components/Shots.tsx](src/components/Shots.tsx)
- Actions (session, site scheduling): [src/lib/actions.ts](src/lib/actions.ts)

---

## Table of contents

- About
- Features
- Requirements
- Environment variables
- Important operational parameters
- Database & schema notes
- Architecture & data flow
- Swiper Notes
- Troubleshooting & known issues
- Contributing
- License

---

## About

- **Name**: WebShooter
- **Purpose**: Periodic screenshot capture of configured sites, store metadata and binary/html assets, enable viewing and bulk download in the UI.

## Features

- User session management and site scheduling (cron-like worker model).
- Screenshot ingestion via an external shooter service; metadata stored in Postgres.
- Paginated gallery with selection, download, and deletion features.
- Slide position preservation across site switches using `usePreserveScroll`.

---

## Requirements

- Node 18+ (use the latest LTS recommended)
- Postgres database accessible from the app
- Optional: external shooter service (R2/bucket) endpoint
- See runtime dependencies in [package.json](package.json)

---

## Environment variables

Required / commonly used environment variables:

- `DB_CONN` — Postgres connection string used by `src/lib/server.js`.
- `SHOOTER_URL` — external shooter API endpoint (used for R2 interactions and deletes).
- `SHOOTER_KEY` — secret key for shooter service (if configured).
- `VSITE`, `VTB` — visitor/default test site and visitor table names used in server logic.
- `NODE_ENV` — set to `production` in production to toggle secure cookie behavior.

Example `.env` for local development:

```bash
DB_CONN=postgres://user:pass@localhost:5432/webshooter
SHOOTER_URL=https://my-shooter.example.com/api
SHOOTER_KEY=your-shooter-key
VSITE=example.com
VTB=visitor_table_name
NODE_ENV=development
```

---

## Important operational parameters

- **MaxCrons**: application limit for cron schedules (configured in `private.settings`).
- **SafeAddCron / SafeAddSite**: server-side checks when scheduling crons/sites (see `updateCronTable` and `updateUserSites` in `src/lib/server.js`).
- **storeDuration**: per-user retention in days; older shots are purged and corresponding remote assets are deleted via the shooter service (see `delPrevEntry` and `deleteR2Shot`).
- **SafeCron Regex**: Steps `(*/d)` in lists `(- , -)` must be placed at list end or will throw.

---

## Database & schema notes

- **User tables**: Per-user tables are created/altered dynamically by `updateShotSchema` and have columns `id` serial (auto-increment), `date`, `viewed`, `key_expires`, `shot_url`, `html_url`, `{site}_shot_key`, `{site}_html_key`.
- **User Data**: App user data stored in `private.users` with columns `id`, `uuid`, `password`, `username`, `sites`, `notifications`, `notepad`, `maxCrons`, `deletionAttempt`, `created`, `storeDuration`, `isAdmin`.
- **User Metadata**: User metadata stored in `private.usermeta` with columns `id`, `username`, `total_sites`, `total_shots`, `deleted_on`, `joined_on`.
- **App Metadata**: App-level metadata stored in `private.settings`, `private.crons`,

## Architecture & data flow

1. External shooter service captures screenshots and stores binary/html assets in a storage bucket.
2. Shooter service notifies the server (or server pulls) with keys; server writes metadata to Postgres.
3. Frontend uses React Query hooks to paginate shots and display them in `Gallery` using `Swiper`.
4. Delete flows call the shooter service endpoint to remove remote assets and update DB rows.

---

## Swiper Notes

- _Prefer_ `onReachBeginning` / `onReachEnd` or `onSlideChangeTransitionEnd`: for fetch triggers instead of `onSlideChange` while dragging. In previous _OnSlideChange_, current swiper position was captured then triggered slideTo if user was 5 slides away from start/end. This interfered with smooth scrolling.

---

## Known Issues (Unused App features)

1. **Obsolete SiteData.Range**: `range` enabled partial matching of _HTML_ text to determine if the concerned html section had changed and required a fresh shot be stored instead of reusing the former. Goal was to save space, but since CloudFlare's R2 storage provides no mechanism for such matching unlike Postgres and also provides much more storage space `(10gb)`. The compute costs on each worker + next app call seemed to outweigh benefits.

---

## Contributing

- Fork the repo, create a topic branch and open a PR.
- Run lint/tests (if present) and include a short changelog entry.

---

## License

- Copyright 2026 [AB-Grok](ab-grok.uk)
- Licensed under the MIT License

---
