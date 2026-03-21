# Crypto Aggregator → TA Desk

This repo is a repo-managed **BTC/ETH/SOL technical-analysis desk** with **catalyst awareness**, designed for OpenClaw cron.

The old product (broad crypto digest + TA as a side bundle) has been refactored into a **TA-first market intelligence system**.

## What it does

Three lanes:

1) **Thesis lane (primary)**
- Collect TA content (X analyst accounts/list + TA YouTube channels)
- Extract structured theses (levels, bias, triggers, invalidations)
- Maintain a persistent thesis ledger so we can report **changes** instead of re-summarizing

2) **Catalyst lane (secondary)**
- Track only market-moving catalysts (macro/regulatory/incidents/listings/unlocks/etc.)

3) **Delta lane**
- Diff since prior run: new theses, changed bias/levels/invalidation, newly stale setups

## Outputs

- **Morning Market Map** (primary): `out/morning-market-map-YYYY-MM-DD.md`
- **Midday Delta** (optional, disabled by default): `out/midday-delta-YYYY-MM-DD.md`

## Why this repo exists

OpenClaw cron schedules **agent turns**, not raw shell commands. The repo therefore contains both:

- deterministic TypeScript scripts for feed ingestion and normalization
- prompt files that instruct the OpenClaw agent to use browser and exec tools for X collection and synthesis

Cron state is **not** stored declaratively in `openclaw.json`; the repo treats `config/cron.yaml` as source of truth and syncs it into the Gateway via CLI.

## Layout

```text
config/
  cron.yaml
  sources.yaml
prompts/
  x-list-collector.md
  x-accounts-collector.md
  daily-brief.md
schemas/
  x-snapshot.schema.json
skills/
  crypto-brief/SKILL.md
scripts/
  init.ts
  fetch-rss.ts
  fetch-youtube-feeds.ts
  normalize.ts
  render-brief-input.ts
  sync-cron.ts
  validate-config.ts
```

## Setup

```bash
pnpm install
cp .env.example .env
pnpm run bootstrap
pnpm validate
```

### OpenClaw browser prerequisites

Use a dedicated OpenClaw-managed browser profile for X, log in manually once, then let cron reuse that profile.

Suggested first-time commands:

```bash
openclaw browser profiles
openclaw browser --browser-profile openclaw start
```

Then manually sign into X inside that profile.

## Daily flow (cron)

### 1) Collect

- RSS fetch (secondary/tertiary; curated)
- YouTube feed fetch (upload discovery)
- YouTube transcript queue + browser transcript capture (TA-first depth)
- X list + key X accounts via browser collector (primary)

### 2) Normalize + structure

- `scripts/normalize.ts` writes `out/normalized-YYYY-MM-DD.json`
- `scripts/render-extraction-inputs.ts` writes:
  - `out/thesis-extraction-input-YYYY-MM-DD.json`
  - `out/catalyst-extraction-input-YYYY-MM-DD.json`

### 3) Extract (LLM, structured JSON)

- Thesis extraction → `out/theses-YYYY-MM-DD.json` (schema: `schemas/thesis.schema.json`)
- Catalyst extraction → `out/catalysts-YYYY-MM-DD.json` (schema: `schemas/catalyst.schema.json`)

### 4) Ledger + delta

- `scripts/update-thesis-ledger.ts` updates `state/thesis-ledger.json` and writes `out/delta-YYYY-MM-DD.json`

### 5) Synthesis (Morning Market Map)

- `scripts/render-market-map.ts` writes `out/market-map-input.json`
- Final synthesis prompt writes `out/morning-market-map-YYYY-MM-DD.md`

## Cost discipline

- Plumbing jobs run on cheaper models (`41-mini` / `5-mini`).
- Only the final Morning Market Map uses the strongest synthesis model (`gpt`).

## Managing jobs from git

Edit `config/cron.yaml`, then run:

```bash
pnpm cron:sync
```

That script recreates the managed OpenClaw cron jobs from repo config and then disables any jobs marked off.

## YouTube without paid API

This repo uses YouTube channel feed URLs for upload discovery. Those feeds can be polled directly if you do not want webhooks yet.

The handle resolver in `fetch-youtube-feeds.ts` attempts to resolve a channel page to `channelId` so you can start with a handle URL and later pin the resolved ID back into config.

## Important constraints

- X browser collection is cheaper than X API access, but less durable.
- This repo keeps the model as **analyst**, not the primary crawler.
- Technical-analysis accounts are kept separate from straight news sources.
- The final digest should distinguish fact, rumor, interpretation, and TA opinion.

## First edits to make

1. Replace placeholder RSS feeds in `config/sources.yaml`.
2. Confirm your X list URL and TA accounts.
3. Add the real YouTube channel IDs after the first feed fetch resolves them.
4. Set route details in `config/cron.yaml` if you want the final brief announced into a specific channel.
