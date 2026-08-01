# Design: Emit SR Levels to v2 Endpoint

## Problem Being Solved & Why It Matters
Currently, `crypto-aggregator` pushes support/resistance (S/R) theses to `regime-engine`'s `v1` endpoint, which writes the data to a local SQLite ledger accessible only to the main API process. A new Railway service, `regime-engine-synthesis-worker`, needs to synthesize this S/R data continuously. Because the worker runs in its own environment with a separate SQLite volume, it cannot access the `v1` data. 

The `regime-engine` `v2` endpoint is backed by a shared Postgres database (`regime_engine.sr_theses_v2`) that is reachable by any service with the `DATABASE_URL`, including the synthesis worker. Changing the emission script to push to the `v2` endpoint will allow the synthesis worker to properly access the S/R intelligence data.

## Key Design Decisions & Trade-offs
1. **Push Model vs Pull Model**: We are maintaining the cron-based push model in `crypto-aggregator` rather than creating a pull-based collector in `sol-usdc-clmm-intelligence`. 
   - *Trade-off*: A push model lacks cleaner evidence lineage, but setting up a pull-based collector would require standing up new server infrastructure in one of these batch-script repos. Reusing the existing push pattern requires minimal new infrastructure and solves the problem immediately.
2. **Dual-write (v1 & v2) Migration Strategy**: The `v1` data is known to be directly used by the `regime-engine` UI-facing endpoint. 
   - *Trade-off*: We will dual-write to both `v1` and `v2` during a transition period. This ensures we don't break the existing UI while successfully populating the `v2` Postgres database for the worker. We will leave the removal of the `v1` emission to a later, independent effort once it's confirmed the UI no longer needs it.
3. **Data Transformation**: The `v1` endpoint forced a lossy conversion of `Thesis` data into flattened price levels. The `v2` endpoint natively accepts an array of `Thesis`-like objects, which aligns near-perfectly with our internal `Thesis` interface. 
   - *Trade-off*: We will map the raw `Thesis` list directly into the `v2` request payload (with minor wrapper fields like `schemaVersion`, `source`, `symbol`, and `brief`), avoiding the lossy parser entirely for the `v2` write path.

## Proposed Approach
1. **Extend Request Types**: Define `SrLevelBriefRequestV2` alongside the existing `v1` interface, replacing `levels: LevelRow[]` with `theses: Thesis[]`.
2. **Add a v2 Projection Function**: Implement `projectThesesToRequestsV2(theses, date)` to group the raw `Thesis` entries by canonical source and construct `v2` requests, similar to `projectThesesToRequests` but avoiding `parsePriceString` flattening.
3. **Dual-Write Execution**: Update the `main()` function to sequentially emit the `v1` request (to `/v1/sr-levels`) and then the `v2` request (to `/v2/sr-levels`) using the existing `postWithRetry` logic.
4. **Idempotency & Conflict Handling**: `postWithRetry` already anticipates `201` (inserted), `200` (idempotent skip), `400`/`401` (errors), and `409` (conflicts). Because `v2` computes uniqueness from `source + symbol + briefId + asset + sourceHandle`, our deterministic cron run IDs (`briefId` derived from date and source) will ensure repeated runs result in `200 OK` rather than duplicates.

## Assumptions Made
1. **UI Dependency**: We assume the `regime-engine` UI still relies on `v1` data, making a dual-write approach strictly safer than a hard switch to `v2`.
2. **Schema Versioning**: We assume the `schemaVersion` for the `v2` request should be set to `"2.0"`.
3. **Authentication Consistency**: We assume the environment variable `REGIME_ENGINE_INGEST_TOKEN` passed into `emit-sr-levels.ts` corresponds to the `OPENCLAW_INGEST_TOKEN` expected by the `v2` handler, meaning no new tokens are required.
4. **Brief Structure**: We assume the `brief` object in `v2` shares the exact same shape (`briefId`, `sourceRecordedAtIso`, `summary`) as in `v1`.

## In Scope
- Creating the `v2` payload data structures matching the script's internal `Thesis` format.
- Adding the `v2` endpoint emission logic into `emit-sr-levels.ts` as a dual-write.
- Ensuring error handling, retry backoffs, and idempotency states (like 200 vs 201) are applied to the `v2` emission.

## Out of Scope
- Building a pull-based collector in `sol-usdc-clmm-intelligence`.
- Removing the `v1` POST logic (this requires upstream confirmation that it is unused).
- Backfilling historical S/R data from SQLite to Postgres.

## Risks & Concerns
- **Summary Generation**: The script currently summarizes `rawThesisText` by joining them into a max 500 character string. For `v2`, if there are many theses grouped together, the summary will heavily truncate context. However, since the raw theses are preserved in the `theses[]` array, this is acceptable.
- **Partial Failure**: A dual-write introduces a risk where `v1` succeeds but `v2` fails (or vice versa), which would cause the script to `exitWithError` and potentially retry both on the next cron execution. Since both endpoints are idempotent (returning `200` if already ingested), this is safe, though it will produce log spam if one endpoint consistently fails.
