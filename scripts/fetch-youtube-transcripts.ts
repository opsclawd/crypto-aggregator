import fs from 'node:fs';
import path from 'node:path';
import { isoDay, readJson, resolveFromRoot, writeJson } from './lib/fs.js';
import type { YouTubeRawItem } from './lib/types.js';

/**
 * Stage 2 YouTube ingestion.
 *
 * This script does NOT scrape YouTube itself (that’s handled by an OpenClaw browser job).
 * It prepares a queue of TA videos that need transcripts and writes it to out/.
 */

type TranscriptQueueItem = {
  videoId: string;
  url: string;
  channelLabel: string;
  title: string;
  publishedAt: string | null;
};

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f))
    .sort();
}

function main(): void {
  const day = isoDay();
  const youtubeDir = resolveFromRoot('data', 'raw', day, 'youtube');
  const transcriptsDir = resolveFromRoot('data', 'raw', day, 'youtube-transcripts');

  const existing = new Set<string>();
  for (const file of listJsonFiles(transcriptsDir)) {
    const base = path.basename(file);
    // convention: <videoId>.json OR arbitrary filename with videoId inside
    const m = base.match(/^([a-zA-Z0-9_-]{6,})\.json$/);
    if (m) existing.add(m[1]);
  }

  const queue: TranscriptQueueItem[] = [];
  for (const file of listJsonFiles(youtubeDir)) {
    const items = readJson<YouTubeRawItem[]>(file, []);
    for (const it of items) {
      const isTA = it.category === 'ta' || it.category === 'thesis';
      if (!isTA) continue;
      if (existing.has(it.videoId)) continue;
      queue.push({
        videoId: it.videoId,
        url: it.link,
        channelLabel: it.channelLabel,
        title: it.title,
        publishedAt: it.published || it.updated || null
      });
    }
  }

  // Deduplicate by videoId
  const byId = new Map<string, TranscriptQueueItem>();
  for (const q of queue) byId.set(q.videoId, q);
  const finalQueue = [...byId.values()].sort((a, b) => (a.publishedAt || '').localeCompare(b.publishedAt || ''));

  const outPath = resolveFromRoot('out', `youtube-transcript-queue-${day}.json`);
  writeJson(outPath, {
    day,
    createdAt: new Date().toISOString(),
    total: finalQueue.length,
    items: finalQueue
  });

  console.log(`Prepared ${finalQueue.length} YouTube transcript queue items: ${outPath}`);
  console.log('Next step: run the OpenClaw browser transcript collector job to populate data/raw/<day>/youtube-transcripts/*.json');
}

main();
