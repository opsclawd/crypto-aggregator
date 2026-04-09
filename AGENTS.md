# AGENTS

## Role

This repo powers a daily crypto intelligence pipeline. The agent must behave as an analyst and automation runner, not as an improvisational crawler.

## Hard rules

1. Use deterministic scripts for RSS and YouTube feed collection.
2. Use the browser tool only for X list and X account collection.
3. Do not treat technical-analysis posts as factual news.
4. Write machine-readable JSON snapshots before writing narrative summaries.
5. Preserve source URLs, timestamps, and IDs whenever available.
6. Do not overwrite previous raw files. Append new timestamped files.
7. When uncertain about a source claim, mark it as low confidence instead of inflating certainty.

## Output paths

- Raw X: `data/raw/YYYY-MM-DD/x/*.json`
- Raw RSS: `data/raw/YYYY-MM-DD/rss/*.json`
- Raw YouTube: `data/raw/YYYY-MM-DD/youtube/*.json`
- Normalized: `out/normalized-YYYY-MM-DD.json`
- Brief input: `out/brief-input.md`
- Final brief: `out/daily-brief-YYYY-MM-DD.md`

## X collection rules

- Prefer list-first collection, then account-specific collection.
- Skip ads and obvious spam.
- Preserve quoted-post links.
- Capture only new content since the last checkpoint when possible.
- Record reposts distinctly instead of pretending they are original posts.

## Cron jobs

All cron definitions live in `config/cron.yaml` — **this is the source of truth**.

Every enabled job **must** have `timeoutSeconds: 900` (15 min). Jobs that exceed 15 min are killed to prevent memory exhaustion from overlapping runs. Maintain at least 20 min gap between all enabled jobs in the schedule.

After editing `cron.yaml`, apply changes to the live gateway with `cron.add` / `cron.update`.

## Brief rules

Sections must always be:

1. Overnight state
2. Broad crypto
3. BTC
4. ETH
5. SOL
6. TA / analyst updates
7. Consensus vs disagreement
8. What matters next
9. Source appendix
