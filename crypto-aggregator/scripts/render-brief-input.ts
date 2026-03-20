import { isoDay, readJson, resolveFromRoot } from './lib/fs.js';
import type { NormalizedItem } from './lib/types.js';
import fs from 'node:fs';

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key) || [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

function formatItem(item: NormalizedItem): string {
  return [
    `- [${item.sourceKind}] ${item.sourceLabel}`,
    `  - title: ${item.title}`,
    `  - assets: ${item.assets.join(', ')}`,
    `  - category: ${item.category}`,
    `  - confidence: ${item.confidence}`,
    `  - publishedAt: ${item.publishedAt ?? 'unknown'}`,
    `  - collectedAt: ${item.collectedAt}`,
    `  - url: ${item.url}`,
    `  - text: ${item.text.replace(/\s+/g, ' ').trim()}`
  ].join('\n');
}

function main(): void {
  const day = isoDay();
  const normalizedPath = resolveFromRoot('out', `normalized-${day}.json`);
  const items = readJson<NormalizedItem[]>(normalizedPath, []);

  const news = items.filter((item) => item.bucket === 'news');
  const ta = items.filter((item) => item.bucket === 'ta');

  const groupedNews = groupBy(news, (item) => {
    if (item.assets.includes('btc')) return 'BTC';
    if (item.assets.includes('eth')) return 'ETH';
    if (item.assets.includes('sol')) return 'SOL';
    return 'Broad Crypto';
  });

  const lines: string[] = [];
  lines.push(`# Brief Input - ${day}`);
  lines.push('');
  lines.push('## Instructions');
  lines.push('- Straight news and TA are separated below.');
  lines.push('- Preserve disagreement instead of smoothing it away.');
  lines.push('- Do not invent facts that are not in the source bundle.');
  lines.push('');
  lines.push('## News Bundle');
  for (const section of ['Broad Crypto', 'BTC', 'ETH', 'SOL']) {
    lines.push(`### ${section}`);
    const entries = groupedNews.get(section) || [];
    if (entries.length === 0) {
      lines.push('- none');
    } else {
      lines.push(...entries.map(formatItem));
    }
    lines.push('');
  }

  lines.push('## TA Bundle');
  if (ta.length === 0) {
    lines.push('- none');
  } else {
    lines.push(...ta.map(formatItem));
  }
  lines.push('');

  const outPath = resolveFromRoot('out', 'brief-input.md');
  fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Wrote ${outPath}`);
}

main();
