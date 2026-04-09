import fs from 'node:fs';
import path from 'node:path';
import { hashId } from './lib/common.js';
import { isoDay, readJson, resolveFromRoot, writeJson } from './lib/fs.js';
import type { NormalizedItem, RssRawItem, XRawItem, YouTubeRawItem } from './lib/types.js';

type YouTubeTranscriptItem = {
  videoId: string;
  fetchedAt: string;
  transcriptText: string;
  language?: string | null;
  method: 'browser' | 'api' | 'unknown';
};

type YouTubeSummaryItem = {
  videoId: string;
  title: string;
  link: string;
  published: string | null;
  channelLabel: string;
  assets: string[];
  summary: string;
};

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => path.join(dir, entry))
    .sort();
}

function categoryToLane(category: string): NormalizedItem['lane'] {
  if (category === 'ta' || category === 'thesis') return 'thesis';
  if (category === 'catalyst') return 'catalyst';
  return 'news';
}

function laneToBucket(lane: NormalizedItem['lane']): NormalizedItem['bucket'] {
  if (lane === 'thesis') return 'ta';
  if (lane === 'catalyst') return 'catalyst';
  return 'news';
}

function toNormalizedFromRss(item: RssRawItem): NormalizedItem {
  const lane = categoryToLane(item.category);
  return {
    id: hashId(['rss', item.link]),
    lane,
    bucket: laneToBucket(lane),
    sourceKind: 'rss',
    sourceLabel: item.feedLabel,
    title: item.title,
    text: item.contentSnippet || item.title,
    url: item.link,
    publishedAt: item.isoDate || null,
    collectedAt: item.fetchedAt,
    assets: item.assets,
    category: item.category,
    confidence: lane === 'news' ? 'low' : 'medium'
  };
}

function toNormalizedFromYouTube(
  item: YouTubeRawItem,
  transcriptByVideoId: Map<string, YouTubeTranscriptItem>,
  summaryByVideoId: Map<string, YouTubeSummaryItem>
): NormalizedItem {
  const lane = categoryToLane(item.category);
  const transcript = transcriptByVideoId.get(item.videoId);
  const summary = summaryByVideoId.get(item.videoId);
  const hasTranscript = Boolean(transcript?.transcriptText?.trim());
  const hasSummary = Boolean(summary?.summary?.trim() && !summary.summary.startsWith('Error'));

  let text: string;
  let confidence: NormalizedItem['confidence'];
  let limitations: string[] | undefined;

  if (hasSummary && summary) {
    text = summary.summary;
    confidence = 'high';
    limitations = undefined;
  } else if (hasTranscript) {
    text = transcript!.transcriptText;
    confidence = 'high';
    limitations = undefined;
  } else {
    text = item.title;
    confidence = lane === 'news' ? 'low' : 'medium';
    limitations = ['youtube:no_summary_no_transcript'];
  }

  return {
    id: hashId(['youtube', item.videoId]),
    lane,
    bucket: laneToBucket(lane),
    sourceKind: 'youtube',
    sourceLabel: item.channelLabel,
    title: item.title,
    text,
    url: item.link,
    publishedAt: item.published || item.updated || null,
    collectedAt: item.fetchedAt,
    assets: item.assets,
    category: item.category,
    confidence,
    limitations
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
  const lane = categoryToLane(category);
  return {
    id: hashId(['x', item.postUrl]),
    lane,
    bucket: laneToBucket(lane),
    sourceKind: 'x',
    sourceLabel: item.sourceLabel,
    title: `${item.authorHandle} post`,
    text: item.rawText,
    url: item.postUrl,
    publishedAt: item.postedAtText || null,
    collectedAt: item.capturedAt,
    assets,
    category,
    confidence: item.isRepost ? 'low' : (lane === 'news' ? 'low' : 'medium')
  };
}

function dedupe(items: NormalizedItem[]): NormalizedItem[] {
  const byId = new Map<string, NormalizedItem>();
  for (const item of items) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => (a.publishedAt || a.collectedAt || '').localeCompare(b.publishedAt || b.collectedAt || ''));
}

function findLatestDataDir(): string | null {
  const rawDir = resolveFromRoot('data', 'raw');
  if (!fs.existsSync(rawDir)) return null;
  const dirs = fs.readdirSync(rawDir)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse();
  return dirs[0] || null;
}

function main(): void {
  const day = findLatestDataDir() || isoDay();
  console.log(`Using data from: ${day}`);
  const rssDir = resolveFromRoot('data', 'raw', day, 'rss');
  const youtubeDir = resolveFromRoot('data', 'raw', day, 'youtube');
  const youtubeTranscriptsDir = resolveFromRoot('data', 'raw', day, 'youtube-transcripts');
  const xDir = resolveFromRoot('data', 'raw', day, 'x');

  const transcriptByVideoId = new Map<string, YouTubeTranscriptItem>();
  for (const file of listJsonFiles(youtubeTranscriptsDir)) {
    const t = readJson<YouTubeTranscriptItem>(file, null as any);
    if (t?.videoId) transcriptByVideoId.set(t.videoId, t);
  }

  const summaryByVideoId = new Map<string, YouTubeSummaryItem>();
  const summaryFile = resolveFromRoot('out', `youtube-ta-summaries-${day}.json`);
  if (fs.existsSync(summaryFile)) {
    const summaryData = readJson<{ summaries: YouTubeSummaryItem[] }>(summaryFile, { summaries: [] });
    for (const s of summaryData.summaries) {
      if (s.videoId) summaryByVideoId.set(s.videoId, s);
    }
    console.log(`Loaded ${summaryByVideoId.size} YouTube summaries`);
  }

  const normalized: NormalizedItem[] = [];

  for (const file of listJsonFiles(rssDir)) {
    const payload = readJson<RssRawItem[]>(file, []);
    normalized.push(...payload.map(toNormalizedFromRss));
  }

  for (const file of listJsonFiles(youtubeDir)) {
    const payload = readJson<YouTubeRawItem[]>(file, []);
    normalized.push(...payload.map((it) => toNormalizedFromYouTube(it, transcriptByVideoId, summaryByVideoId)));
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
