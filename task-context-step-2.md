# Task Context: Task 2

Title: Implement dual-write emission in main
## Workspace & Scope Constraints

## WORKSPACE CONSTRAINTS

Your working directory is a dedicated git worktree with the repository's complete history. Run all commands from it. Do NOT cd to or read paths outside this directory — external-directory access is automatically rejected. git log, git diff, etc. work here directly.

.ai-orchestrator.local.json, if one exists, lives only in the main checkout and is intentionally not copied into your worktree — it is operator-machine-specific and not part of your task. Do not search for it or read it outside this directory. Reason about configuration using only .ai-orchestrator.json in your own working directory; treat it as the effective config for your task.

Working Directory: /home/gary/.openclaw/workspace/crypto-aggregator/.ai-worktrees/issue-3
Repository: opsclawd/crypto-aggregator
Branch: ai/issue-3
Start Commit: f8cf32892162fdfe19c3e6fffc4cac3e32c32d3c

## Task Requirements

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

## Repository Targets

### Expected Files
- scripts/emit-sr-levels.ts
- scripts/__tests__/emit-sr-levels.test.ts

## Validation Commands

```bash
["pnpm","exec","vitest","run","scripts/__tests__/emit-sr-levels.test.ts"]
```

## Behavioral Invariants

You MUST implement the following behavioral invariants as named tests first (TDD):

- **v2 endpoint emission**: main() sequentially executes POST requests to the v2 endpoint after v1 (Test: `retries on 500 then succeeds for both v1 and v2`)

