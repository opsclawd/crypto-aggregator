import { z } from 'zod';
import { isoDay, readJson, resolveFromRoot, writeJson } from './lib/fs.js';

const DeltaSchema = z.object({
  day: z.string(),
  createdAt: z.string(),
  newTheses: z.array(z.any()),
  changedTheses: z.array(z.any()),
  newlyStale: z.array(z.any())
});

type MarketMapInput = {
  day: string;
  createdAt: string;
  theses: unknown[];
  delta: unknown;
  catalysts: unknown[];
  notes: string[];
};

function main(): void {
  const day = isoDay();

  const ledgerPath = resolveFromRoot('state', 'thesis-ledger.json');
  const ledger = readJson<any>(ledgerPath, { theses: {} });
  const theses = Object.values(ledger.theses || {}).filter((t: any) => t.status !== 'stale');

  const deltaPath = resolveFromRoot('out', `delta-${day}.json`);
  const deltaRaw = readJson<unknown>(deltaPath, null);
  const delta = deltaRaw && DeltaSchema.safeParse(deltaRaw).success ? deltaRaw : { day, createdAt: null, newTheses: [], changedTheses: [], newlyStale: [] };

  const catalystsPath = resolveFromRoot('out', `catalysts-${day}.json`);
  const catalysts = readJson<any[]>(catalystsPath, []);

  const input: MarketMapInput = {
    day,
    createdAt: new Date().toISOString(),
    theses,
    delta,
    catalysts,
    notes: [
      'This input is for Morning Market Map synthesis. Do not treat it as ground truth; it is extracted/normalized.'
    ]
  };

  const outPath = resolveFromRoot('out', 'market-map-input.json');
  writeJson(outPath, input);
  console.log(`Wrote market map input bundle: ${outPath}`);
}

main();
