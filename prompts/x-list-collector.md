# X List Collector

Open the X list defined in `config/sources.yaml` using the logged-in OpenClaw browser profile.

## Overlap protection (required)

Before doing any browser work:

- Check for `state/x-collect.lock.json`.
  - If it exists and its `createdAt` is less than 20 minutes ago, **exit immediately** (another run is still active or got stuck recently).
- Otherwise, create/overwrite `state/x-collect.lock.json` with:
  - `kind: "x-collect"`
  - `job: "x-list"`
  - `createdAt`: ISO timestamp

At the end (success or failure), delete `state/x-collect.lock.json`.

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
