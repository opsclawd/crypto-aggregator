# Also push SOL/USDC theses to regime-engine's /v2/sr-levels (Postgres-backed)

## Problem

`scripts/emit-sr-levels.ts` currently pushes SOL support/resistance theses to `regime-engine`'s v1 endpoint only (`POST /v1/sr-levels`), which is backed by `regime-engine`'s local SQLite ledger. This works for `regime-engine`'s own `/v1/sr-levels/current` read endpoint (confirmed live — real `mco`-sourced data with real levels), but that SQLite store is only reachable from `regime-engine`'s main API process.

`regime-engine` recently added a separate `regime-engine-synthesis-worker` service (Railway) that actually runs `PolicyInsight` synthesis continuously. Each Railway service gets its own separate volume — the worker's local SQLite ledger is empty, not the main API's. So even after `regime-engine` #82 wires `synthesizePolicyInsightUseCase` to read support/resistance data, it can't reach the v1/SQLite data from the process that actually needs it.

`regime-engine`'s v2 endpoint (`POST /v2/sr-levels`, `GET /v2/sr-levels/current`) is Postgres-backed (`regime_engine.sr_theses_v2`) — reachable from any service with `DATABASE_URL`, including the synthesis worker. It currently has zero rows; nothing writes to it.

## Why this repo, not `sol-usdc-clmm-intelligence`

Considered routing this through `sol-usdc-clmm-intelligence`'s existing `support-resistance` collector contract instead (cleaner evidence lineage/provenance). Ruled out for now: neither `crypto-aggregator` nor `sol-usdc-clmm-intelligence` runs a persistent HTTP server (both are cron/batch-script repos) — that collector is pull-based (`SUPPORT_RESISTANCE_API_URL` → GET), and `crypto-aggregator`'s `emit-sr-levels.ts` is push-based (POST on a cron schedule). Bridging that mismatch would mean standing up new server infrastructure in one of these two repos. `regime-engine`'s v2 endpoint already exists and is already reachable via the exact POST pattern this script already uses — reuse that instead of building new infrastructure. (Revisit the lineage-clean routing later if it turns out to matter.)

## Scope

1. Add a v2 emit path alongside (or replacing) the existing v1 POST in `emit-sr-levels.ts`. v2's request shape (`schemaVersion`, `source`, `symbol`, `brief`, `theses[]`) is actually a closer match to this script's own internal `Thesis` interface than v1's flattened `levels[]` array is — `theses[]` entries want `asset`, `timeframe`, `bias`, `setupType`, `supportLevels`, `resistanceLevels`, `entryZone`, `targets`, `invalidation`, `trigger`, `chartReference`, `sourceHandle`, `sourceChannel`, `sourceKind`, `sourceReliability`, `rawThesisText`, `collectedAt`, `publishedAt`, `sourceUrl`, `notes` — nearly identical field-for-field to the `Thesis` type this script already builds, so this should need less lossy conversion than the current v1 mapping (which collapses everything into flat price levels via `parsePriceString`).
2. Auth: v2's ingest handler (`createSrLevelsV2IngestHandler`) checks `X-Ingest-Token` against `OPENCLAW_INGEST_TOKEN` — same env var name as v1 uses today; confirm the same token value already configured for this script's v1 push works, or whether a new token/var is needed.
3. Duplicate/conflict handling: v2 computes thesis identity from `source + symbol + briefId + asset + sourceHandle` (see `parseSrLevelsV2IngestRequest`) and rejects duplicates within a single request — make sure repeated cron runs with the same underlying thesis don't collide (v2's `insertBrief` already handles `created` vs `already_ingested`, but confirm end-to-end).
4. Decide: v2-only, or dual-write to both v1 and v2 during a transition period? (v1 read is still used directly by `regime-engine`'s own UI-facing endpoint per earlier session findings — check whether that's still relied on before dropping v1 writes.)

## Acceptance criteria

1. `crypto-aggregator`'s next real SR emission run results in `regime_engine.sr_theses_v2` having rows: `SELECT count(*) FROM regime_engine.sr_theses_v2` > 0 in production.
2. `GET /v2/sr-levels/current?symbol=SOL%2FUSDC&source=mco` (or whatever `source` value this script uses) returns real data instead of `SR_THESIS_V2_NOT_FOUND`.
3. Confirmed no duplicate/conflicting rows accumulate across repeated cron runs of the same underlying thesis.
