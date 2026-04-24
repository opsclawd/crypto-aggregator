import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parsePriceString,
  canonicalizeSource,
  buildNotes,
  projectThesesToRequests
} from '../emit-sr-levels.js';

type Thesis = {
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
};

function makeThesis(overrides: Partial<Thesis> = {}): Thesis {
  return {
    asset: 'sol',
    timeframe: 'swing',
    bias: 'bullish',
    setupType: 'trend continuation',
    supportLevels: ['$128'],
    resistanceLevels: ['$178'],
    entryZone: null,
    targets: [],
    invalidation: null,
    trigger: null,
    chartReference: null,
    sourceHandle: 'morecryptoonline',
    sourceChannel: null,
    sourceKind: 'youtube',
    sourceReliability: 'high',
    rawThesisText: 'test',
    collectedAt: '2026-04-17T08:00:00.000Z',
    publishedAt: '2026-04-17T10:00:00.000Z',
    sourceUrl: null,
    notes: null,
    ...overrides
  };
}

describe('parsePriceString', () => {
  it('parses plain dollar prefix', () => {
    expect(parsePriceString('$128')).toBe(128);
  });

  it('parses plain number', () => {
    expect(parsePriceString('128')).toBe(128);
  });

  it('parses K suffix', () => {
    expect(parsePriceString('86K')).toBe(86000);
    expect(parsePriceString('67.5K')).toBe(67500);
  });

  it('parses dollar + K suffix', () => {
    expect(parsePriceString('$86K')).toBe(86000);
    expect(parsePriceString('$67.5K')).toBe(67500);
  });

  it('parses range with en-dash (midpoint)', () => {
    expect(parsePriceString('86\u201387K')).toBe(86500);
  });

  it('parses range with hyphen (midpoint)', () => {
    expect(parsePriceString('86-87K')).toBe(86500);
  });

  it('parses range with mixed K (midpoint)', () => {
    expect(parsePriceString('67.5K\u201373K')).toBe(70250);
  });

  it('parses range with "to" separator (midpoint)', () => {
    expect(parsePriceString('128 to 132')).toBe(130);
  });

  it('parses dollar range with "to" and trailing label', () => {
    expect(parsePriceString('$78.81 to $81.75 area')).toBeCloseTo(80.28, 1);
  });

  it('parses comma numbers with "to" and parenthetical', () => {
    expect(
      parsePriceString('$67,600 to $73,000 (main support zone)')
    ).toBe(70300);
  });

  it('parses dollar with trailing area label and parenthetical', () => {
    expect(parsePriceString('$96 area (March highs)')).toBe(96);
  });

  it('strips multiple trailing labels', () => {
    expect(parsePriceString('$120 support zone')).toBe(120);
    expect(parsePriceString('$78 to $82 main resistance zone')).toBe(80);
  });

  it('parses approximate prefix', () => {
    expect(parsePriceString('~128')).toBe(128);
  });

  it('returns null for prose without numeric price', () => {
    expect(parsePriceString('21-week EMA')).toBeNull();
    expect(parsePriceString('bull market support band')).toBeNull();
    expect(parsePriceString('around the weekly low')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parsePriceString('')).toBeNull();
  });
});

describe('canonicalizeSource', () => {
  it('maps morecryptoonline to mco', () => {
    expect(canonicalizeSource('morecryptoonline')).toBe('mco');
  });

  it('maps Morecryptoonl to mco (case variant)', () => {
    expect(canonicalizeSource('Morecryptoonl')).toBe('mco');
  });

  it('maps @Morecryptoonl to mco (strips leading @)', () => {
    expect(canonicalizeSource('@Morecryptoonl')).toBe('mco');
  });

  it('normalizes unknown handle to alphanumeric slug', () => {
    expect(canonicalizeSource('some_other_source')).toBe(
      'someothersource'
    );
  });

  it('returns null for empty-after-normalization handle', () => {
    expect(canonicalizeSource('!!!')).toBeNull();
  });
});

describe('buildNotes', () => {
  it('builds basic notes string with parsed-from', () => {
    const thesis = makeThesis();
    const notes = buildNotes(thesis, '$128', 'support');
    expect(notes).toContain('morecryptoonline');
    expect(notes).toContain('swing');
    expect(notes).toContain('bullish');
    expect(notes).toContain('trend continuation');
    expect(notes).toContain('Support parsed from: "$128"');
  });

  it('includes trigger and invalidation', () => {
    const thesis = makeThesis({
      trigger: 'break above resistance',
      invalidation: 'close below $120'
    });
    const notes = buildNotes(thesis, '$128', 'support');
    expect(notes).toContain('Trigger: break above resistance');
    expect(notes).toContain('Invalidation: close below $120');
  });

  it('includes entryZone when present', () => {
    const thesis = makeThesis({ entryZone: '$125-$130' });
    const notes = buildNotes(thesis, '$128', 'support');
    expect(notes).toContain('Entry zone: $125-$130');
  });

  it('includes raw support and resistance levels', () => {
    const thesis = makeThesis({
      supportLevels: ['$128', '$120'],
      resistanceLevels: ['$178\u2013$182']
    });
    const notes = buildNotes(thesis, '$128', 'support');
    expect(notes).toContain('Raw support: $128, $120');
    expect(notes).toContain('Raw resistance: $178\u2013$182');
  });

  it('omits trigger/invalidation/entryZone when fields are null', () => {
    const thesis = makeThesis({
      trigger: null,
      invalidation: null,
      entryZone: null
    });
    const notes = buildNotes(thesis, '$128', 'support');
    expect(notes).not.toContain('Trigger:');
    expect(notes).not.toContain('Invalidation:');
    expect(notes).not.toContain('Entry zone:');
  });

  it('uses resistance label for resistance levels', () => {
    const thesis = makeThesis();
    const notes = buildNotes(thesis, '$178', 'resistance');
    expect(notes).toContain('Resistance parsed from: "$178"');
  });
});

describe('projectThesesToRequests', () => {
  const date = '2026-04-17';

  it('projects a single MCO SOL thesis into a request', () => {
    const theses = [
      makeThesis({
        supportLevels: ['$128', '$120'],
        resistanceLevels: ['$178\u2013$182']
      })
    ];
    const requests = projectThesesToRequests(theses, date);
    expect(requests).toHaveLength(1);
    const req = requests[0]!;
    expect(req.schemaVersion).toBe('1.0');
    expect(req.source).toBe('mco');
    expect(req.symbol).toBe('SOL/USDC');
    expect(req.brief.briefId).toBe('mco-sol-2026-04-17');
    expect(req.brief.sourceRecordedAtIso).toBe(
      '2026-04-17T10:00:00.000Z'
    );
    expect(req.levels.length).toBeGreaterThanOrEqual(3);
    expect(req.levels.find((l) => l.price === 128)).toBeDefined();
    expect(req.levels.find((l) => l.price === 120)).toBeDefined();
    expect(
      req.levels.find((l) => Math.abs(l.price - 180) < 1)
    ).toBeDefined();
  });

  it('produces separate requests for multiple sources', () => {
    const theses = [
      makeThesis({ sourceHandle: 'morecryptoonline' }),
      makeThesis({
        sourceHandle: 'cryptoanalyst',
        sourceReliability: 'medium',
        publishedAt: null
      })
    ];
    const requests = projectThesesToRequests(theses, date);
    expect(requests).toHaveLength(2);
    expect(requests[0]!.source).toBe('mco');
    expect(requests[1]!.source).toBe('cryptoanalyst');
    expect(requests[0]!.brief.briefId).not.toBe(
      requests[1]!.brief.briefId
    );
  });

  it('returns empty for non-SOL theses only', () => {
    const theses = [
      makeThesis({ asset: 'btc' }),
      makeThesis({ asset: 'eth' })
    ];
    const requests = projectThesesToRequests(theses, date);
    expect(requests).toHaveLength(0);
  });

  it('includes neutral/mixed bias theses with levels', () => {
    const theses = [
      makeThesis({
        bias: 'neutral',
        supportLevels: ['$130'],
        resistanceLevels: ['$150']
      })
    ];
    const requests = projectThesesToRequests(theses, date);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.levels.length).toBeGreaterThanOrEqual(2);
    const support = requests[0]!.levels.find(
      (l) => l.levelType === 'support' && l.price === 130
    );
    expect(support).toBeDefined();
    expect(support!.notes).toContain('neutral');
  });

  it('deduplicates identical (levelType, price) within a source', () => {
    const theses = [
      makeThesis({ supportLevels: ['$128'] }),
      makeThesis({ supportLevels: ['$128'] })
    ];
    const requests = projectThesesToRequests(theses, date);
    expect(requests).toHaveLength(1);
    const support128 = requests[0]!.levels.filter(
      (l) => l.levelType === 'support' && l.price === 128
    );
    expect(support128).toHaveLength(1);
  });

  it('includes brief.summary from rawThesisText', () => {
    const theses = [
      makeThesis({ rawThesisText: 'SOL is trending up with key support at 128.' })
    ];
    const requests = projectThesesToRequests(theses, date);
    expect(requests[0]!.brief.summary).toContain(
      'SOL is trending up with key support at 128.'
    );
  });

  it('includes brief.summary concatenated from multiple theses', () => {
    const theses = [
      makeThesis({ rawThesisText: 'Thesis one.' }),
      makeThesis({ rawThesisText: 'Thesis two.' })
    ];
    const requests = projectThesesToRequests(theses, date);
    expect(requests[0]!.brief.summary).toContain('Thesis one.');
    expect(requests[0]!.brief.summary).toContain('Thesis two.');
  });

  it('truncates brief.summary to 500 characters', () => {
    const theses = [
      makeThesis({ rawThesisText: 'x'.repeat(600) })
    ];
    const requests = projectThesesToRequests(theses, date);
    expect(requests[0]!.brief.summary!.length).toBeLessThanOrEqual(500);
  });

  it('uses latest publishedAt ?? collectedAt for sourceRecordedAtIso', () => {
    const theses = [
      makeThesis({
        publishedAt: '2026-04-17T10:00:00.000Z',
        collectedAt: '2026-04-17T08:00:00.000Z'
      }),
      makeThesis({
        publishedAt: '2026-04-17T14:00:00.000Z',
        collectedAt: '2026-04-17T12:00:00.000Z'
      })
    ];
    const requests = projectThesesToRequests(theses, date);
    expect(requests[0]!.brief.sourceRecordedAtIso).toBe(
      '2026-04-17T14:00:00.000Z'
    );
  });

  it('normalizes mixed-offset timestamps to UTC ISO for sourceRecordedAtIso', () => {
    const theses = [
      makeThesis({
        publishedAt: '2026-04-24T09:00:00-04:00',
        collectedAt: '2026-04-24T08:00:00.000Z'
      }),
      makeThesis({
        publishedAt: '2026-04-24T12:00:00Z',
        collectedAt: '2026-04-24T11:00:00.000Z'
      })
    ];
    const requests = projectThesesToRequests(theses, date);
    // 09:00:00-04:00 = 13:00:00Z, which is later than 12:00:00Z
    expect(requests[0]!.brief.sourceRecordedAtIso).toBe(
      '2026-04-24T13:00:00.000Z'
    );
  });

  it('uses collectedAt when publishedAt is null', () => {
    const theses = [
      makeThesis({
        publishedAt: null,
        collectedAt: '2026-04-17T09:00:00.000Z'
      })
    ];
    const requests = projectThesesToRequests(theses, date);
    expect(requests[0]!.brief.sourceRecordedAtIso).toBe(
      '2026-04-17T09:00:00.000Z'
    );
  });

  it('skips unparseable levels with warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const theses = [
      makeThesis({
        supportLevels: ['$128', 'around the weekly low'],
        resistanceLevels: ['21-week EMA']
      })
    ];
    const requests = projectThesesToRequests(theses, date);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.levels).toHaveLength(1);
    expect(requests[0]!.levels[0]!.price).toBe(128);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('skips source with empty slug', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const theses = [
      makeThesis({ sourceHandle: '!!!', supportLevels: ['$128'] })
    ];
    const requests = projectThesesToRequests(theses, date);
    expect(requests).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it('skips POST when all levels are unparseable', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const theses = [
      makeThesis({
        supportLevels: ['around the weekly low'],
        resistanceLevels: ['bull market support band']
      })
    ];
    const requests = projectThesesToRequests(theses, date);
    expect(requests).toHaveLength(0);
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('maps sourceReliability to rank correctly', () => {
    const theses = [
      makeThesis({ sourceReliability: 'high', supportLevels: ['$100'] }),
      makeThesis({
        sourceHandle: 'analyst2',
        sourceReliability: 'medium',
        supportLevels: ['$101']
      }),
      makeThesis({
        sourceHandle: 'analyst3',
        sourceReliability: 'low',
        supportLevels: ['$102']
      })
    ];
    const requests = projectThesesToRequests(theses, date);
    expect(requests).toHaveLength(3);
    expect(
      requests[0]!.levels.find((l) => l.price === 100)!.rank
    ).toBe('primary');
    expect(
      requests[1]!.levels.find((l) => l.price === 101)!.rank
    ).toBe('secondary');
    expect(
      requests[2]!.levels.find((l) => l.price === 102)!.rank
    ).toBe('minor');
  });

  it('deduplicates same canonical source across different raw handles', () => {
    const theses = [
      makeThesis({
        sourceHandle: 'morecryptoonline',
        supportLevels: ['$128']
      }),
      makeThesis({
        sourceHandle: 'Morecryptoonl',
        supportLevels: ['$130']
      })
    ];
    const requests = projectThesesToRequests(theses, date);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.source).toBe('mco');
  });
});

describe('main (integration)', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.EMIT_SR_LEVELS_DRY_RUN;
    delete process.env.REGIME_ENGINE_URL;
    delete process.env.REGIME_ENGINE_INGEST_TOKEN;
    delete process.env.CRON_RUN_DATE;
  });

  it('dry-run logs body without making network calls', async () => {
    process.env.EMIT_SR_LEVELS_DRY_RUN = 'true';
    process.env.REGIME_ENGINE_URL = 'https://example.com';
    process.env.THESES_PATH = new URL(
      './fixtures/theses-2026-04-17.json',
      import.meta.url
    ).pathname;

    const { main } = await import('../emit-sr-levels.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await main();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DRY RUN]')
    );
    logSpy.mockRestore();
  });

  it('retries on 500 then succeeds', async () => {
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
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.runAllTimersAsync();
    await mainPromise;

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Inserted')
    );
    logSpy.mockRestore();
    warnSpy.mockRestore();
    vi.useRealTimers();
  });

  it('exits non-zero on 409 conflict (no retry)', async () => {
    process.env.REGIME_ENGINE_URL = 'https://example.com';
    process.env.REGIME_ENGINE_INGEST_TOKEN = 'test-token';
    process.env.THESES_PATH = new URL(
      './fixtures/theses-2026-04-17.json',
      import.meta.url
    ).pathname;

    const mockFetch = vi.fn().mockResolvedValue({
      status: 409,
      json: () => Promise.resolve({ error: { code: 'CONFLICT' } })
    });

    vi.stubGlobal('fetch', mockFetch);

    const { main } = await import('../emit-sr-levels.js');

    await expect(main()).rejects.toThrow('process.exit(1)');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});