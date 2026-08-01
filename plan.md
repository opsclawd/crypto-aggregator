<!-- plan-review-required -->
# Emit SR Levels to v2 Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit support/resistance theses to the regime-engine's Postgres-backed `/v2/sr-levels` endpoint alongside the existing `/v1/sr-levels` SQLite-backed endpoint.

**Architecture:** A dual-write approach in `emit-sr-levels.ts` where we group raw `Thesis` objects by source, format them for the v2 schema, and emit them sequentially after the v1 emissions using the existing retry logic.

**Tech Stack:** TypeScript, Node.js, Vitest

## Global Constraints

- Preserve all existing v1 endpoint logic and functionality.
- Use deterministic cron run IDs for `briefId` to ensure idempotency.
- Maintain error handling, retry backoffs, and idempotency states for v2 exactly as v1.
- All shell commands must be relative to the workspace root.

---

## Task 1: Add v2 types and projection function

**Files:**
- Modify: `scripts/emit-sr-levels.ts`
- Modify: `scripts/__tests__/emit-sr-levels.test.ts`

**Interfaces:**
- Produces: `export interface SrLevelBriefRequestV2`
- Produces: `export function projectThesesToRequestsV2(theses: Thesis[], date: string): SrLevelBriefRequestV2[]`
- Produces: `export interface Thesis`

- [ ] **Step 1: Write the failing tests**

Add a test suite for `projectThesesToRequestsV2` in `scripts/__tests__/emit-sr-levels.test.ts` and remove the local `type Thesis` in favor of importing the interface from `emit-sr-levels.js`.

```typescript
import { projectThesesToRequestsV2, SrLevelBriefRequestV2, Thesis } from '../emit-sr-levels.js';

describe('projectThesesToRequestsV2', () => {
  const date = '2026-04-17';

  it('projects multiple theses from the same source into a single v2 request', () => {
    const theses: Thesis[] = [
      makeThesis({ supportLevels: ['$128'] }),
      makeThesis({ resistanceLevels: ['$178\u2013$182'] })
    ];
    const requests = projectThesesToRequestsV2(theses, date);
    
    expect(requests).toHaveLength(1);
    const req = requests[0]!;
    expect(req.schemaVersion).toBe('2.0');
    expect(req.source).toBe('mco');
    expect(req.symbol).toBe('SOL/USDC');
    expect(req.brief.briefId).toBe('mco-sol-2026-04-17');
    expect(req.theses).toHaveLength(2);
    expect(req.theses[0].supportLevels).toContain('$128');
    expect(req.theses[1].resistanceLevels).toContain('$178\u2013$182');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/__tests__/emit-sr-levels.test.ts -t "projectThesesToRequestsV2"`
Expected: FAIL because `projectThesesToRequestsV2` does not exist.

- [ ] **Step 3: Write minimal implementation**

In `scripts/emit-sr-levels.ts`, export `Thesis` (change `interface Thesis` to `export interface Thesis`) and define `SrLevelBriefRequestV2` and `projectThesesToRequestsV2`:

```typescript
export interface SrLevelBriefRequestV2 {
  schemaVersion: '2.0';
  source: string;
  symbol: string;
  brief: {
    briefId: string;
    sourceRecordedAtIso?: string;
    summary?: string;
  };
  theses: Thesis[];
}

export function projectThesesToRequestsV2(
  theses: Thesis[],
  date: string
): SrLevelBriefRequestV2[] {
  const solTheses = theses.filter(
    (t) => t.asset.toLowerCase() === 'sol'
  );

  if (solTheses.length === 0) return [];

  const bySource = new Map<string, Thesis[]>();
  for (const t of solTheses) {
    const canonical = canonicalizeSource(t.sourceHandle);
    if (canonical === null) {
      console.warn(
        `sourceHandle '${t.sourceHandle}' normalized to empty, skipping for v2`
      );
      continue;
    }
    const group = bySource.get(canonical) ?? [];
    group.push(t);
    bySource.set(canonical, group);
  }

  const requests: SrLevelBriefRequestV2[] = [];

  for (const [source, group] of bySource) {
    let latestIso: string | undefined;

    for (const thesis of group) {
      const thesisIso = thesis.publishedAt ?? thesis.collectedAt;
      if (thesisIso) {
        const thesisMs = Date.parse(thesisIso);
        const latestMs = latestIso ? Date.parse(latestIso) : -Infinity;
        if (!Number.isNaN(thesisMs) && thesisMs > latestMs) {
          latestIso = new Date(thesisMs).toISOString();
        }
      }
    }

    const briefId = `${source}-sol-${date}`;
    const rawTexts = group.map((t) => t.rawThesisText).filter(Boolean);
    const summary = rawTexts.join(' ').slice(0, 500);

    requests.push({
      schemaVersion: '2.0',
      source,
      symbol: 'SOL/USDC',
      brief: {
        briefId,
        ...(latestIso ? { sourceRecordedAtIso: latestIso } : {}),
        summary
      },
      theses: group
    });
  }

  return requests;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run scripts/__tests__/emit-sr-levels.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/emit-sr-levels.ts scripts/__tests__/emit-sr-levels.test.ts
git commit -m "feat: add v2 payload types and projection function"
```

## Task 2: Implement dual-write emission in main

**Files:**
- Modify: `scripts/emit-sr-levels.ts`
- Modify: `scripts/__tests__/emit-sr-levels.test.ts`

**Interfaces:**
- Consumes: `projectThesesToRequestsV2`
- Modifies: `postWithRetry` body parameter type to accept `SrLevelBriefRequest | SrLevelBriefRequestV2`

- [ ] **Step 1: Write the failing tests**

Update `describe('main (integration)', ...)` in `scripts/__tests__/emit-sr-levels.test.ts` to expect both v1 and v2 API calls. Find the `retries on 500 then succeeds` test and rename / update it to expect calls to `/v2/sr-levels` as well.

```typescript
  it('retries on 500 then succeeds for both v1 and v2', async () => {
    vi.useFakeTimers();
    process.env.REGIME_ENGINE_URL = 'https://example.com';
    process.env.REGIME_ENGINE_INGEST_TOKEN = 'test-token';
    process.env.THESES_PATH = new URL(
      './fixtures/theses-2026-04-17.json',
      import.meta.url
    ).pathname;

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve({
          status: 500,
          json: () => Promise.resolve({ error: 'internal' })
        });
      }
      return Promise.resolve({
        status: 201,
        json: () =>
          Promise.resolve({ briefId: 'mco-sol-2026-04-17', insertedCount: 2 })
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { main } = await import('../emit-sr-levels.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mainPromise = main();
    // Move timers forward enough for both v1 and v2 retries
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.runAllTimersAsync();
    await mainPromise;

    // Both v1 (3 calls) and v2 (1 call) since v2 succeeds on first try (callCount = 4). Total 4 calls.
    expect(mockFetch).toHaveBeenCalledTimes(4);
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/v1/sr-levels',
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/v2/sr-levels',
      expect.any(Object)
    );

    logSpy.mockRestore();
    warnSpy.mockRestore();
    vi.useRealTimers();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/__tests__/emit-sr-levels.test.ts -t "retries on 500 then succeeds for both v1 and v2"`
Expected: FAIL due to missing v2 fetch calls.

- [ ] **Step 3: Write minimal implementation**

In `scripts/emit-sr-levels.ts`, update `postWithRetry` to accept both `v1` and `v2` request bodies:

```typescript
async function postWithRetry(
  url: string,
  token: string,
  body: SrLevelBriefRequest | SrLevelBriefRequestV2
): Promise<{ status: number; body: unknown }>
```

In `main()`:

```typescript
  const theses = raw as Thesis[];
  const requests = projectThesesToRequests(theses, date);
  const v2Requests = projectThesesToRequestsV2(theses, date);

  if (requests.length === 0 && v2Requests.length === 0) {
    console.log('No SOL theses to emit');
    return;
  }

  if (dryRun) {
    for (const req of requests) {
      console.log(`[DRY RUN] Would POST to ${url}/v1/sr-levels:`);
      console.log(JSON.stringify(req, null, 2));
    }
    for (const req of v2Requests) {
      console.log(`[DRY RUN] Would POST to ${url}/v2/sr-levels:`);
      console.log(JSON.stringify(req, null, 2));
    }
    return;
  }

  const endpoint = `${url}/v1/sr-levels`;
  for (const req of requests) {
    // existing v1 processing...
  }

  const endpointV2 = `${url}/v2/sr-levels`;
  for (const req of v2Requests) {
    const result = await postWithRetry(endpointV2, token!, req);

    switch (result.status) {
      case 201: {
        const b = result.body as { insertedCount?: number };
        console.log(
          `[v2] Inserted ${b.insertedCount ?? '?'} theses for brief ${req.brief.briefId}`
        );
        break;
      }
      case 200: {
        console.log(
          `[v2] Idempotent skip for brief ${req.brief.briefId} (already ingested)`
        );
        break;
      }
      case 400:
      case 401:
        exitWithError(
          `[v2] Error ${result.status} for brief ${req.brief.briefId}: ${JSON.stringify(result.body)}`
        );
        break;
      case 409:
        exitWithError(
          `[v2] Conflict for brief ${req.brief.briefId} — same briefId with differing payload. Investigate manually. ${JSON.stringify(result.body)}`
        );
        break;
      default:
        exitWithError(
          `[v2] Unexpected status ${result.status} for brief ${req.brief.briefId}: ${JSON.stringify(result.body)}`
        );
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run scripts/__tests__/emit-sr-levels.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/emit-sr-levels.ts scripts/__tests__/emit-sr-levels.test.ts
git commit -m "feat: emit to regime-engine v2 endpoint"
```
