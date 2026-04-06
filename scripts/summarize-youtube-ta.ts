import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { readJson, resolveFromRoot, writeJson, isoDay } from './lib/fs.js';
import type { YouTubeRawItem } from './lib/types.js';
import { loadSourcesConfig } from './lib/config.js';

interface SummaryItem {
  videoId: string;
  title: string;
  link: string;
  published: string | null;
  channelLabel: string;
  assets: string[];
  summary: string;
  method: 'video' | 'transcript';
}

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) throw new Error('GEMINI_API_KEY not set');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

async function callGemini(prompt: string, fileUri?: string): Promise<string> {
  const parts: object[] = [{ text: prompt }];
  
  if (fileUri) {
    parts.push({ fileData: { fileUri, mimeType: 'video/mp4' } });
  }

  const response = await fetch(`${GEMINI_BASE}/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${error}`);
  }

  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

function listJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dir, f))
    .sort();
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

async function main(): Promise<void> {
  const config = loadSourcesConfig();
  const targetChannel = config.youtube.channels.find(
    (c) => c.label === 'morecryptoonline' && c.enabled
  );

  if (!targetChannel) {
    console.error('morecryptoonline channel not found or disabled in config');
    process.exit(1);
  }

  const latestDir = findLatestDataDir();
  if (!latestDir) {
    console.error('No data directories found');
    process.exit(1);
  }
  
  const day = latestDir;
  const youtubeDir = resolveFromRoot('data', 'raw', day, 'youtube');
  const transcriptsDir = resolveFromRoot('data', 'raw', day, 'youtube-transcripts');

  const transcriptByVideoId = new Map<string, string>();
  for (const file of listJsonFiles(transcriptsDir)) {
    const t = readJson<{ videoId: string; transcriptText: string }>(file, { videoId: '', transcriptText: '' });
    if (t?.videoId && t?.transcriptText) {
      transcriptByVideoId.set(t.videoId, t.transcriptText);
    }
  }
  console.log(`Loaded ${transcriptByVideoId.size} transcripts`);

  const allItems: YouTubeRawItem[] = [];
  for (const file of listJsonFiles(youtubeDir)) {
    const items = readJson<YouTubeRawItem[]>(file, []);
    const channelItems = items.filter(
      (i) => i.channelLabel === 'morecryptoonline' && i.category === 'ta'
    );
    allItems.push(...channelItems);
  }

  const filteredItems = allItems.filter((item) => {
    const title = item.title.toLowerCase();
    if (title.includes('xrp') || title.includes('ripple')) return false;
    const assets = item.assets || [];
    const hasTargetAsset = assets.some((a) => ['btc', 'eth', 'sol'].includes(a.toLowerCase()));
    return hasTargetAsset;
  });

  console.log(`Found ${filteredItems.length} TA videos for BTC/ETH/SOL from morecryptoonline`);

  const summaries: SummaryItem[] = [];

  for (const item of filteredItems) {
    const assets = item.assets || [];
    const btc = assets.includes('btc') || assets.includes('BTC');
    const eth = assets.includes('eth') || assets.includes('ETH');
    const sol = assets.includes('sol') || assets.includes('SOL');

    const focusAssets = [
      btc ? 'Bitcoin (BTC)' : null,
      eth ? 'Ethereum (ETH)' : null,
      sol ? 'Solana (SOL)' : null
    ].filter(Boolean).join(', ');

    const transcript = transcriptByVideoId.get(item.videoId) || '';
    const hasTranscript = Boolean(transcript.trim().length > 0);

    const prompt = `You are a crypto technical analyst analyzing a YouTube video about ${focusAssets}. 

Extract and summarize the key technical analysis points:

1. **Key price targets and levels** - Specific support/resistance levels, breakout targets, price zones mentioned
2. **Chart patterns** - Any patterns discussed (head & shoulders, wedges, triangles, etc.)
3. **Market structure** - Trend direction, momentum, volume signals
4. **Trade setups** - Entry zones, stop loss levels, risk/reward ratios if mentioned
5. **Timeframes** - Which timeframes are relevant for the analysis

Be specific with numbers and levels mentioned in the video.`;

    let method: 'video' | 'transcript' = 'video';
    let summary: string;

    try {
      if (!hasTranscript) {
        console.log(`Analyzing video directly for ${item.videoId}...`);
        summary = await callGemini(prompt, item.link);
        method = 'video';
      } else {
        console.log(`Using transcript for ${item.videoId}...`);
        summary = await callGemini(`Video Transcript:\n${transcript.slice(0, 8000)}\n\n${prompt}`);
        method = 'transcript';
      }

      summaries.push({
        videoId: item.videoId,
        title: item.title,
        link: item.link,
        published: item.published || item.updated || null,
        channelLabel: item.channelLabel,
        assets: item.assets,
        summary,
        method
      });
      console.log(`✓ Summarized (${method}): ${item.title}`);
    } catch (err) {
      console.error(`✗ Error with ${item.title}:`, err);
      summaries.push({
        videoId: item.videoId,
        title: item.title,
        link: item.link,
        published: item.published || item.updated || null,
        channelLabel: item.channelLabel,
        assets: item.assets,
        summary: `Error: ${err}`,
        method: 'video'
      });
    }
  }

  const outPath = resolveFromRoot('out', `youtube-ta-summaries-${day}.json`);
  writeJson(outPath, {
    day,
    channel: 'morecryptoonline',
    generatedAt: new Date().toISOString(),
    totalVideos: summaries.length,
    summaries
  });

  console.log(`\nWritten summaries to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});