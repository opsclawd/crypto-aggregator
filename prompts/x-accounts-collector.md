# X Account Collector

For each enabled X account in `config/sources.yaml`, open the account page in the logged-in OpenClaw browser profile and collect fresh posts since the last checkpoint in `state/x-accounts-checkpoint.json`.

## Overlap protection (required)

Before doing any browser work:

- Check for `state/x-collect.lock.json`.
  - If it exists and its `createdAt` is less than 20 minutes ago, **exit immediately**.
- Otherwise, create/overwrite `state/x-collect.lock.json` with:
  - `kind: "x-collect"`
  - `job: "x-accounts"`
  - `createdAt`: ISO timestamp

At the end (success or failure), delete `state/x-collect.lock.json`.

Write one JSON file per account to:

`data/raw/YYYY-MM-DD/x/account-<handle>-<timestamp>.json`

Each item must follow `schemas/x-snapshot.schema.json`.

Rules:
- do not mix accounts into one raw file
- keep retweets / reposts flagged instead of rewriting them as original content
- preserve any visible price levels, targets, invalidation levels, timeframe labels, or chart references in the raw text
- update the checkpoint file after successful writes
