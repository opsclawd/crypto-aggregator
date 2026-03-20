# Crypto Aggregator

A repo-managed crypto news and market-intelligence pipeline designed for OpenClaw cron.

This setup does four things:

1. Collects **broad crypto**, **BTC**, **ETH**, and **SOL** news from RSS feeds.
2. Collects **YouTube channel upload updates** without paying for the YouTube Data API by using channel feeds.
3. Collects **X list** and **specific X analyst account** updates through OpenClaw browser-driven agent runs.
4. Produces a clean daily brief input bundle for a GPT model to turn into the final digest.

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

## Daily flow

### 1. Feed jobs

These jobs run deterministic scripts through agent-executed `exec` calls:

- `pnpm tsx scripts/fetch-rss.ts`
- `pnpm tsx scripts/fetch-youtube-feeds.ts`
- `pnpm tsx scripts/normalize.ts`
- `pnpm tsx scripts/render-brief-input.ts`

### 2. X collection jobs

These jobs instruct the OpenClaw agent to:

- open the X list URL in the browser
- capture fresh posts since the last checkpoint
- write JSON files under `data/raw/YYYY-MM-DD/x/`
- repeat for explicit analyst accounts like `@Morecryptoonl`

### 3. Daily brief job

This job instructs the model to read `out/brief-input.md`, apply the workspace skill, and produce the final digest.

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
