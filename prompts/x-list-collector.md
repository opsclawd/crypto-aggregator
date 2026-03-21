# X List Collector

Open the X list defined in `config/sources.yaml` using the logged-in OpenClaw browser profile.

## Overlap protection (required)

This repo uses an executable lock helper.

Before doing any browser work:

- Run:
  - `pnpm tsx scripts/x-collect-lock.ts acquire x-list 25`
- If it exits non-zero, STOP (another run is active/recent).

At the end (success or failure):

- Run:
  - `pnpm tsx scripts/x-collect-lock.ts release`

## Collection behavior

Collect only fresh posts that are new relative to the latest checkpoint in `state/x-list-checkpoint.json`.

Write a JSON array to:

`data/raw/YYYY-MM-DD/x/x-list-<timestamp>.json`

Each item must follow `schemas/x-snapshot.schema.json`.

Rules:
- capture post URL, author handle, display name, postedAt text as visible, raw text, quoted post URL if present, media URLs if visible, and whether it is a repost
- skip ads and irrelevant spam
- do not summarize inside the raw file
- after writing the raw file, update `state/x-list-checkpoint.json` with the newest captured post URL and collection timestamp
