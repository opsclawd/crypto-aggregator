# Task Context: Task 1

Title: Add v2 types and projection function
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

- **v2 request grouping**: Groups theses by canonical source and bundles them in a single request per source (Test: `projects multiple theses from the same source into a single v2 request`)

