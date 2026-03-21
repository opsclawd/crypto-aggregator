import { z } from 'zod';
import { hashId } from './lib/common.js';
import { isoDay, readJson, resolveFromRoot, writeJson } from './lib/fs.js';

const ThesisSchema = z.object({
  asset: z.enum(['btc', 'eth', 'sol']),
  timeframe: z.enum(['intraday', 'swing', 'macro', 'unknown']),
  bias: z.enum(['bullish', 'bearish', 'neutral', 'mixed']),
  setupType: z.enum([
    'breakout',
    'breakdown',
    'range',
    'trend continuation',
    'mean reversion',
    'reclaim',
    'rejection',
    'unknown'
  ]),
  supportLevels: z.array(z.string()),
  resistanceLevels: z.array(z.string()),
  entryZone: z.string().nullable(),
  targets: z.array(z.string()),
  invalidation: z.string().nullable(),
  trigger: z.string().nullable(),
  chartReference: z.string().nullable(),
  sourceHandle: z.string(),
  sourceChannel: z.string().nullable().optional(),
  sourceKind: z.enum(['x', 'youtube', 'rss', 'official']),
  sourceReliability: z.enum(['low', 'medium', 'high']),
  rawThesisText: z.string(),
  collectedAt: z.string(),
  publishedAt: z.string().nullable(),
  sourceUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional()
});

type Thesis = z.infer<typeof ThesisSchema>;

type LedgerThesis = {
  id: string; // signature id
  signature: string;
  status: 'active' | 'hit' | 'invalidated' | 'stale';
  firstSeen: string;
  lastSeen: string;
  lastUpdated: string;
  current: Thesis;
  previous?: Thesis;
};

type ThesisLedger = {
  version: 1;
  updatedAt: string;
  theses: Record<string, LedgerThesis>;
};

type Delta = {
  day: string;
  createdAt: string;
  newTheses: LedgerThesis[];
  changedTheses: Array<{ before: Thesis; after: Thesis; id: string; signature: string }>;
  newlyStale: LedgerThesis[];
};

function signatureFor(t: Thesis): string {
  // The goal is: stable identity per analyst + asset + timeframe + core setup.
  // Levels/targets can change; that’s tracked as a delta.
  return hashId([
    'thesis',
    t.sourceKind,
    t.sourceHandle,
    t.asset,
    t.timeframe,
    t.setupType,
    // Some analysts run multiple concurrent theses per timeframe; anchor with a short key.
    (t.trigger || '').slice(0, 80),
    (t.invalidation || '').slice(0, 80)
  ]);
}

function isMeaningfullyDifferent(a: Thesis, b: Thesis): boolean {
  const pick = (t: Thesis) => ({
    bias: t.bias,
    setupType: t.setupType,
    supportLevels: t.supportLevels,
    resistanceLevels: t.resistanceLevels,
    entryZone: t.entryZone,
    targets: t.targets,
    invalidation: t.invalidation,
    trigger: t.trigger
  });
  return JSON.stringify(pick(a)) !== JSON.stringify(pick(b));
}

function main(): void {
  const day = isoDay();
  const thesesPath = resolveFromRoot('out', `theses-${day}.json`);
  const raw = readJson<unknown>(thesesPath, null);
  if (!raw) {
    console.error(`Missing ${thesesPath}. Did the thesis extraction job run?`);
    process.exit(1);
  }

  const parsed = z.array(ThesisSchema).safeParse(raw);
  if (!parsed.success) {
    console.error('Invalid theses JSON. Zod errors:');
    console.error(parsed.error.toString());
    process.exit(1);
  }
  const theses = parsed.data;

  const ledgerPath = resolveFromRoot('state', 'thesis-ledger.json');
  const ledger = readJson<ThesisLedger>(ledgerPath, {
    version: 1,
    updatedAt: new Date().toISOString(),
    theses: {}
  });

  const now = new Date().toISOString();
  const newTheses: LedgerThesis[] = [];
  const changedTheses: Delta['changedTheses'] = [];

  const seenIds = new Set<string>();

  for (const t of theses) {
    const sig = signatureFor(t);
    const id = sig;
    seenIds.add(id);

    const existing = ledger.theses[id];
    if (!existing) {
      const lt: LedgerThesis = {
        id,
        signature: sig,
        status: 'active',
        firstSeen: day,
        lastSeen: day,
        lastUpdated: now,
        current: t
      };
      ledger.theses[id] = lt;
      newTheses.push(lt);
      continue;
    }

    existing.lastSeen = day;
    if (isMeaningfullyDifferent(existing.current, t)) {
      changedTheses.push({ before: existing.current, after: t, id, signature: sig });
      existing.previous = existing.current;
      existing.current = t;
      existing.lastUpdated = now;
      existing.status = 'active';
    }
  }

  const newlyStale: LedgerThesis[] = [];
  // Simple staleness: if not seen for 7 days, mark stale.
  const TTL_DAYS = 7;
  const dayNum = new Date(day).getTime();
  for (const lt of Object.values(ledger.theses)) {
    if (seenIds.has(lt.id)) continue;
    const lastSeenNum = new Date(lt.lastSeen).getTime();
    const ageDays = (dayNum - lastSeenNum) / (1000 * 60 * 60 * 24);
    if (ageDays >= TTL_DAYS && lt.status !== 'stale') {
      lt.status = 'stale';
      lt.lastUpdated = now;
      newlyStale.push(lt);
    }
  }

  ledger.updatedAt = now;
  writeJson(ledgerPath, ledger);

  const delta: Delta = {
    day,
    createdAt: now,
    newTheses,
    changedTheses,
    newlyStale
  };

  const deltaPath = resolveFromRoot('out', `delta-${day}.json`);
  writeJson(deltaPath, delta);

  console.log(`Updated thesis ledger: ${ledgerPath}`);
  console.log(`Wrote delta: ${deltaPath} (new=${newTheses.length}, changed=${changedTheses.length}, stale=${newlyStale.length})`);
}

main();
