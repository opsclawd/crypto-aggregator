import Parser from 'rss-parser';
import { loadSourcesConfig } from './lib/config.js';
import { writeTimestampedJson } from './lib/common.js';
import { readSeenState, writeSeenState } from './lib/state.js';
import type { YouTubeRawItem } from './lib/types.js';

const parser = new Parser();
const config = loadSourcesConfig();
const seen = readSeenState();
const knownIds = new Set(seen.youtubeVideoIds);
const fetchedAt = new Date().toISOString();

function extractHandle(url: string): string | null {
  const match = url.match(/youtube\.com\/@([^/?]+)/i);
  return match?.[1] ?? null;
}

async function resolveChannelIdFromPage(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0'
    }
  });
  if (!response.ok) return null;
  const html = await response.text();

  const patterns = [
    /"externalId":"(UC[^"]+)"/,
    /channelId":"(UC[^"]+)"/,
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[^\"]+)"/
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function videoIdFromLink(link: string): string | null {
  try {
    const url = new URL(link);
    return url.searchParams.get('v');
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  for (const channel of config.youtube.channels.filter((item) => item.enabled)) {
    const resolvedChannelId = channel.channelId || await resolveChannelIdFromPage(channel.url);
    if (!resolvedChannelId) {
      console.warn(`Could not resolve channel ID for ${channel.label} (${channel.url})`);
      continue;
    }

    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${resolvedChannelId}`;
    const parsed = await parser.parseURL(feedUrl);
    const freshItems: YouTubeRawItem[] = [];

    for (const entry of parsed.items) {
      const link = entry.link?.trim();
      if (!link) continue;
      const videoId = videoIdFromLink(link) || entry.id?.split(':').pop() || '';
      if (!videoId || knownIds.has(videoId)) continue;
      knownIds.add(videoId);

      freshItems.push({
        type: 'youtube',
        channelLabel: channel.label,
        channelId: resolvedChannelId,
        channelUrl: channel.url,
        feedUrl,
        videoId,
        title: entry.title?.trim() || '(untitled)',
        link,
        published: entry.pubDate || null,
        updated: (entry as { isoDate?: string }).isoDate || null,
        category: channel.category,
        assets: channel.assets,
        fetchedAt
      });
    }

    writeTimestampedJson('youtube', channel.label, freshItems);
    console.log(`YouTube ${channel.label}: ${freshItems.length} fresh videos`);
  }

  writeSeenState({
    rssLinks: seen.rssLinks,
    youtubeVideoIds: [...knownIds].slice(-5000)
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
