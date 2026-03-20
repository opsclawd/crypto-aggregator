import fs from 'node:fs';
import path from 'node:path';
import { hashId } from './lib/common.js';
import { isoDay, readJson, resolveFromRoot, writeJson } from './lib/fs.js';
import type { NormalizedItem, RssRawItem, XRawItem, YouTubeRawItem } from './lib/types.js';

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => path.join(dir, entry))
    .sort();
}

function toNormalizedFromRss(item: RssRawItem): NormalizedItem {
  return {
    id: hashId(['rss', item.link]),
    bucket: item.category === 'ta' ? 'ta' : 'news',
    sourceKind: 'rss',
    sourceLabel: item.feedLabel,
    title: item.title,
    text: item.contentSnippet || item.title,
    url: item.link,
    publishedAt: item.isoDate || null,
    collectedAt: item.fetchedAt,
    assets: item.assets,
    category: item.category,
    confidence: 'medium'
  };
}

function toNormalizedFromYouTube(item: YouTubeRawItem): NormalizedItem {
  return {
    id: hashId(['youtube', item.videoId]),
    bucket: item.category === 'ta' ? 'ta' : 'news',
    sourceKind: 'youtube',
    sourceLabel: item.channelLabel,
    title: item.title,
    text: item.title,
    url: item.link,
    publishedAt: item.published || item.updated || null,
    collectedAt: item.fetchedAt,
    assets: item.assets,
    category: item.category,
    confidence: 'medium'
  };
}

function inferAssets(text: string): string[] {
  const lower = text.toLowerCase();
  const assets = new Set<string>();
  if (/(\bbtc\b|bitcoin)/.test(lower)) assets.add('btc');
  if (/(\beth\b|ethereum)/.test(lower)) assets.add('eth');
  if (/(\bsol\b|solana)/.test(lower)) assets.add('sol');
  if (assets.size === 0) assets.add('crypto');
  return [...assets];
}

function toNormalizedFromX(item: XRawItem): NormalizedItem {
  const assets = item.assetHints && item.assetHints.length > 0 ? item.assetHints : inferAssets(item.rawText);
  const category = item.category || 'ta';
  return {
    id: hashId(['x', item.postUrl]),
    bucket: category === 'ta' ? 'ta' : 'news',
    sourceKind: 'x',
    sourceLabel: item.sourceLabel,
    title: `${item.authorHandle} post`,
    text: item.rawText,
    url: item.postUrl,
    publishedAt: item.postedAtText || null,
    collectedAt: item.capturedAt,
    assets,
    category,
    confidence: item.isRepost ? 'low' : 'medium'
  };
}

function dedupe(items: NormalizedItem[]): NormalizedItem[] {
  const byId = new Map<string, NormalizedItem>();
  for (const item of items) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => (a.publishedAt || a.collectedAt).localeCompare(b.publishedAt || b.collectedAt));
}

function main(): void {
  const day = isoDay();
  const rssDir = resolveFromRoot('data', 'raw', day, 'rss');
  const youtubeDir = resolveFromRoot('data', 'raw', day, 'youtube');
  const xDir = resolveFromRoot('data', 'raw', day, 'x');

  const normalized: NormalizedItem[] = [];

  for (const file of listJsonFiles(rssDir)) {
    const payload = readJson<RssRawItem[]>(file, []);
    normalized.push(...payload.map(toNormalizedFromRss));
  }

  for (const file of listJsonFiles(youtubeDir)) {
    const payload = readJson<YouTubeRawItem[]>(file, []);
    normalized.push(...payload.map(toNormalizedFromYouTube));
  }

  for (const file of listJsonFiles(xDir)) {
    const payload = readJson<XRawItem[]>(file, []);
    normalized.push(...payload.map(toNormalizedFromX));
  }

  const finalItems = dedupe(normalized);
  const outPath = resolveFromRoot('out', `normalized-${day}.json`);
  writeJson(outPath, finalItems);
  console.log(`Wrote ${finalItems.length} normalized items to ${outPath}`);
}

main();
