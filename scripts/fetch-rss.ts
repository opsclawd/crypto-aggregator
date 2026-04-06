import Parser from 'rss-parser';
import { loadSourcesConfig } from './lib/config.js';
import { writeTimestampedJson } from './lib/common.js';
import { readSeenState, writeSeenState } from './lib/state.js';
import type { RssRawItem } from './lib/types.js';

const parser = new Parser();
const config = loadSourcesConfig();
const seen = readSeenState();
const newLinks = new Set(seen.rssLinks);
const fetchedAt = new Date().toISOString();

async function main(): Promise<void> {
  for (const feed of config.rss.feeds.filter((item) => item.enabled)) {
    try {
      const parsed = await parser.parseURL(feed.url);
      const freshItems: RssRawItem[] = [];

      for (const item of parsed.items) {
        const link = item.link?.trim();
        if (!link || newLinks.has(link)) continue;
        newLinks.add(link);
        freshItems.push({
          type: 'rss',
          feedLabel: feed.label,
          sourceUrl: feed.url,
          title: item.title?.trim() || '(untitled)',
          link,
          contentSnippet: item.contentSnippet?.trim() || null,
          isoDate: item.isoDate || null,
          category: feed.category,
          assets: feed.assets,
          fetchedAt
        });
      }

      writeTimestampedJson('rss', feed.label, freshItems);
      console.log(`RSS ${feed.label}: ${freshItems.length} fresh items`);
    } catch (error) {
      console.error(`RSS ${feed.label}: fetch failed (${feed.url})`);
      console.error(error);
      // continue; do not crash the whole run
    }
  }

  writeSeenState({
    ...seen,
    rssLinks: [...newLinks].slice(-5000),
    youtubeVideoIds: seen.youtubeVideoIds
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
