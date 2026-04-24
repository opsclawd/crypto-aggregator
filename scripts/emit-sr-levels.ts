/**
 * regime-engine S/R level ingest contract:
 *
 * POST /v1/sr-levels
 * Header: X-Ingest-Token: <token>
 * Body: {
 *   schemaVersion: "1.0",
 *   source: string,
 *   symbol: string,        // "SOL/USDC"
 *   brief: {
 *     briefId: string,
 *     sourceRecordedAtIso?: string (ISO datetime),
 *     summary?: string
 *   },
 *   levels: [{
 *     levelType: "support" | "resistance",
 *     price: number,
 *     timeframe?: string,
 *     rank?: string,
 *     invalidation?: number,
 *     notes?: string
 *   }]
 * }
 *
 * Responses: 201 (inserted), 200 (idempotent), 400 (validation), 401 (auth), 409 (conflict)
 */

const SOURCE_ALIASES: Record<string, string> = {
  morecryptoonline: 'mco',
  morecryptoonl: 'mco'
};

const TRAILING_LABELS =
  /\s+(area|zone|target|support|resistance|initial|next|main|key|minor|major|near[- ]term|current|strong|weak|critical)\s*$/i;

interface Thesis {
  asset: string;
  timeframe: string;
  bias: string;
  setupType: string;
  supportLevels: string[];
  resistanceLevels: string[];
  entryZone: string | null;
  targets: string[];
  invalidation: string | null;
  trigger: string | null;
  chartReference: string | null;
  sourceHandle: string;
  sourceChannel: string | null;
  sourceKind: string;
  sourceReliability: string;
  rawThesisText: string;
  collectedAt: string;
  publishedAt: string | null;
  sourceUrl: string | null;
  notes: string | null;
}

interface LevelRow {
  levelType: 'support' | 'resistance';
  price: number;
  timeframe?: string;
  rank?: string;
  notes?: string;
}

interface SrLevelBriefRequest {
  schemaVersion: '1.0';
  source: string;
  symbol: string;
  brief: {
    briefId: string;
    sourceRecordedAtIso?: string;
    summary?: string;
  };
  levels: LevelRow[];
}

const BACKOFF_DELAYS = [500, 1000, 2000];
const MAX_RETRIES = 3;
const MAX_SUMMARY_LENGTH = 500;

export function parsePriceString(value: string): number | null {
  let s = value.trim();
  if (!s) return null;

  s = s.replace(/\([^)]*\)/g, '');
  s = s.trim();

  while (TRAILING_LABELS.test(s)) {
    s = s.replace(TRAILING_LABELS, '').trim();
  }

  s = s.replace(/^~\s*/, '');

  const rangeMidpoint = tryParseRange(s);
  if (rangeMidpoint !== null) return rangeMidpoint;

  const single = tryParseSingle(s);
  if (single !== null) return single;

  return null;
}

function tryParseRange(s: string): number | null {
  const toIdx = s.toLowerCase().indexOf(' to ');
  if (toIdx > 0) {
    const left = s.slice(0, toIdx).trim();
    const right = s.slice(toIdx + 4).trim();
    const l = tryParseSingle(left);
    const r = tryParseSingle(right);
    if (l !== null && r !== null) return roundMidpoint(l, r);
  }

  const separators = ['\u2013', '\u2014', '\u2012', '-'];
  for (const sep of separators) {
    const idx = s.indexOf(sep);
    if (idx > 0) {
      let left = s.slice(0, idx).trim();
      let right = s.slice(idx + 1).trim();

      const suffixK = /k$/i.test(s);
      if (suffixK) {
        if (!/k$/i.test(left)) left = left + 'K';
        if (!/k$/i.test(right)) right = right + 'K';
      }

      const l = tryParseSingle(left);
      const r = tryParseSingle(right);
      if (l !== null && r !== null) return roundMidpoint(l, r);
    }
  }

  return null;
}

function roundMidpoint(a: number, b: number): number {
  return Math.round(((a + b) / 2) * 1000) / 1000;
}

function tryParseSingle(s: string): number | null {
  let v = s.trim();
  if (!v) return null;

  v = v.replace(/^\$/, '');

  const hasK = /k$/i.test(v);
  v = v.replace(/k$/i, '');

  v = v.replace(/,/g, '');

  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;

  return hasK ? n * 1000 : n;
}

export function canonicalizeSource(sourceHandle: string): string | null {
  const lower = sourceHandle.toLowerCase().trim();
  if (SOURCE_ALIASES[lower]) return SOURCE_ALIASES[lower];

  const slug = lower.replace(/[^a-z0-9]/g, '');
  if (SOURCE_ALIASES[slug]) return SOURCE_ALIASES[slug];
  return slug.length > 0 ? slug : null;
}

const RANK_MAP: Record<string, string> = {
  high: 'primary',
  medium: 'secondary',
  low: 'minor'
};

export function buildNotes(
  thesis: Thesis,
  rawLevelString: string,
  levelType: 'support' | 'resistance'
): string {
  const parts: string[] = [
    `${thesis.sourceHandle} ${thesis.timeframe}, ${thesis.bias}. ${thesis.setupType}`
  ];

  if (typeof thesis.trigger === 'string' && thesis.trigger.length > 0) {
    parts.push(`Trigger: ${thesis.trigger}`);
  }
  if (
    typeof thesis.invalidation === 'string' &&
    thesis.invalidation.length > 0
  ) {
    parts.push(`Invalidation: ${thesis.invalidation}`);
  }
  if (
    typeof thesis.entryZone === 'string' &&
    thesis.entryZone.length > 0
  ) {
    parts.push(`Entry zone: ${thesis.entryZone}`);
  }

  parts.push(
    `${levelType === 'support' ? 'Support' : 'Resistance'} parsed from: "${rawLevelString}"`
  );

  if (thesis.supportLevels.length > 0) {
    parts.push(`Raw support: ${thesis.supportLevels.join(', ')}`);
  }
  if (thesis.resistanceLevels.length > 0) {
    parts.push(`Raw resistance: ${thesis.resistanceLevels.join(', ')}`);
  }

  return parts.join(' | ');
}

export function projectThesesToRequests(
  theses: Thesis[],
  date: string
): SrLevelBriefRequest[] {
  const solTheses = theses.filter(
    (t) => t.asset.toLowerCase() === 'sol'
  );

  if (solTheses.length === 0) return [];

  const bySource = new Map<string, Thesis[]>();
  for (const t of solTheses) {
    const canonical = canonicalizeSource(t.sourceHandle);
    if (canonical === null) {
      console.warn(
        `sourceHandle '${t.sourceHandle}' normalized to empty, skipping`
      );
      continue;
    }
    const group = bySource.get(canonical) ?? [];
    group.push(t);
    bySource.set(canonical, group);
  }

  const requests: SrLevelBriefRequest[] = [];

  for (const [source, group] of bySource) {
    const levels: LevelRow[] = [];
    const seen = new Set<string>();

    let latestIso: string | undefined;

    for (const thesis of group) {
      const rank = RANK_MAP[thesis.sourceReliability] ?? 'minor';

      for (const raw of thesis.supportLevels) {
        const price = parsePriceString(raw);
        if (price === null) {
          console.warn(`Could not parse support level: "${raw}"`);
          continue;
        }
        const key = `support:${price}`;
        if (seen.has(key)) continue;
        seen.add(key);
        levels.push({
          levelType: 'support',
          price,
          timeframe: thesis.timeframe,
          rank,
          notes: buildNotes(thesis, raw, 'support')
        });
      }

      for (const raw of thesis.resistanceLevels) {
        const price = parsePriceString(raw);
        if (price === null) {
          console.warn(`Could not parse resistance level: "${raw}"`);
          continue;
        }
        const key = `resistance:${price}`;
        if (seen.has(key)) continue;
        seen.add(key);
        levels.push({
          levelType: 'resistance',
          price,
          timeframe: thesis.timeframe,
          rank,
          notes: buildNotes(thesis, raw, 'resistance')
        });
      }

      const thesisIso = thesis.publishedAt ?? thesis.collectedAt;
      if (thesisIso) {
        const thesisMs = Date.parse(thesisIso);
        const latestMs = latestIso ? Date.parse(latestIso) : -Infinity;
        if (!Number.isNaN(thesisMs) && thesisMs > latestMs) {
          latestIso = new Date(thesisMs).toISOString();
        }
      }
    }

    if (levels.length === 0) {
      console.log(`No parseable levels for source ${source}, skipping POST`);
      continue;
    }

    const briefId = `${source}-sol-${date}`;
    const rawTexts = group.map((t) => t.rawThesisText).filter(Boolean);
    const summary = rawTexts.join(' ').slice(0, MAX_SUMMARY_LENGTH);
    requests.push({
      schemaVersion: '1.0',
      source,
      symbol: 'SOL/USDC',
      brief: {
        briefId,
        ...(latestIso ? { sourceRecordedAtIso: latestIso } : {}),
        summary
      },
      levels
    });
  }

  return requests;
}

async function postWithRetry(
  url: string,
  token: string,
  body: SrLevelBriefRequest
): Promise<{ status: number; body: unknown }> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ingest-Token': token
        },
        body: JSON.stringify(body)
      });

      if (res.status >= 500 && attempt < MAX_RETRIES) {
        const delay = BACKOFF_DELAYS[attempt] ?? 2000;
        console.warn(
          `Server error ${res.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(delay);
        continue;
      }

      const json = await res.json().catch(() => null);
      return { status: res.status, body: json };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = BACKOFF_DELAYS[attempt] ?? 2000;
        console.warn(
          `Network error: ${err}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  throw new Error('Unreachable');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function exitWithError(message: string): never {
  console.error(message);
  process.exit(1);
}

export async function main(): Promise<void> {
  const url = process.env.REGIME_ENGINE_URL;
  const token = process.env.REGIME_ENGINE_INGEST_TOKEN;
  const dryRun = process.env.EMIT_SR_LEVELS_DRY_RUN === 'true';

  if (!dryRun && (!url || !token)) {
    exitWithError(
      'REGIME_ENGINE_URL and REGIME_ENGINE_INGEST_TOKEN must be set (or use EMIT_SR_LEVELS_DRY_RUN=true)'
    );
  }

  const date =
    process.env.CRON_RUN_DATE ??
    new Date().toISOString().slice(0, 10);

  const thesesPath =
    process.env.THESES_PATH ?? `out/theses-${date}.json`;
  let raw: unknown;
  try {
    const fs = await import('node:fs');
    raw = JSON.parse(fs.readFileSync(thesesPath, 'utf8'));
  } catch {
    exitWithError(`Missing ${thesesPath}. Did the thesis extraction job run?`);
  }

  if (!Array.isArray(raw)) {
    exitWithError(`Expected array in ${thesesPath}, got ${typeof raw}`);
  }

  const theses = raw as Thesis[];
  const requests = projectThesesToRequests(theses, date);

  if (requests.length === 0) {
    console.log('No SOL theses to emit');
    return;
  }

  if (dryRun) {
    for (const req of requests) {
      console.log(`[DRY RUN] Would POST to ${url}/v1/sr-levels:`);
      console.log(JSON.stringify(req, null, 2));
    }
    return;
  }

  const endpoint = `${url}/v1/sr-levels`;

  for (const req of requests) {
    const result = await postWithRetry(endpoint, token!, req);

    switch (result.status) {
      case 201: {
        const b = result.body as { insertedCount?: number };
        console.log(
          `Inserted ${b.insertedCount ?? '?'} levels for brief ${req.brief.briefId}`
        );
        break;
      }
      case 200: {
        console.log(
          `Idempotent skip for brief ${req.brief.briefId} (already ingested)`
        );
        break;
      }
      case 400:
      case 401:
        exitWithError(
          `Error ${result.status} for brief ${req.brief.briefId}: ${JSON.stringify(result.body)}`
        );
        break;
      case 409:
        exitWithError(
          `Conflict for brief ${req.brief.briefId} — same briefId with differing payload. Investigate manually. ${JSON.stringify(result.body)}`
        );
        break;
      default:
        exitWithError(
          `Unexpected status ${result.status} for brief ${req.brief.briefId}: ${JSON.stringify(result.body)}`
        );
    }
  }
}

const isMainModule =
  process.argv[1]?.includes('emit-sr-levels') ?? false;

if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}