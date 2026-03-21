import { isoDay, readJson, resolveFromRoot, writeJson } from './lib/fs.js';
import type { NormalizedItem } from './lib/types.js';

function main(): void {
  const day = isoDay();
  const normalizedPath = resolveFromRoot('out', `normalized-${day}.json`);
  const items = readJson<NormalizedItem[]>(normalizedPath, []);

  const thesisItems = items
    .filter((it) => it.lane === 'thesis')
    .filter((it) => ['btc', 'eth', 'sol'].some((a) => it.assets.includes(a)))
    .map((it) => ({
      id: it.id,
      sourceKind: it.sourceKind,
      sourceLabel: it.sourceLabel,
      title: it.title,
      url: it.url,
      collectedAt: it.collectedAt,
      publishedAt: it.publishedAt,
      assets: it.assets,
      text: it.text,
      confidence: it.confidence,
      limitations: it.limitations || []
    }));

  const catalystItems = items
    .filter((it) => it.lane === 'catalyst')
    .map((it) => ({
      id: it.id,
      sourceKind: it.sourceKind,
      sourceLabel: it.sourceLabel,
      title: it.title,
      url: it.url,
      collectedAt: it.collectedAt,
      publishedAt: it.publishedAt,
      assets: it.assets,
      text: it.text,
      confidence: it.confidence,
      limitations: it.limitations || []
    }));

  const thesisOut = resolveFromRoot('out', `thesis-extraction-input-${day}.json`);
  writeJson(thesisOut, {
    day,
    createdAt: new Date().toISOString(),
    total: thesisItems.length,
    items: thesisItems
  });

  const catalystOut = resolveFromRoot('out', `catalyst-extraction-input-${day}.json`);
  writeJson(catalystOut, {
    day,
    createdAt: new Date().toISOString(),
    total: catalystItems.length,
    items: catalystItems
  });

  console.log(`Wrote thesis extraction input: ${thesisOut} (${thesisItems.length} items)`);
  console.log(`Wrote catalyst extraction input: ${catalystOut} (${catalystItems.length} items)`);
}

main();
