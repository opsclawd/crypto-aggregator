export type AssetTag = 'crypto' | 'btc' | 'eth' | 'sol' | string;

export type Lane = 'thesis' | 'catalyst' | 'news';

export interface XAccountConfig {
  handle: string;
  url: string;
  /**
   * category is kept for backwards compatibility (e.g. "ta").
   * Prefer lane for product logic.
   */
  category: string;
  lane?: Lane;
  /** Relative importance inside the same lane/sourceKind. Default = 1. */
  weight?: number;
  assets: AssetTag[];
  enabled: boolean;
}

export interface YouTubeChannelConfig {
  label: string;
  handle?: string | null;
  url: string;
  category: string;
  lane?: Lane;
  weight?: number;
  assets: AssetTag[];
  enabled: boolean;
  channelId?: string | null;
}

export interface RssFeedConfig {
  label: string;
  category: string;
  lane?: Lane;
  weight?: number;
  assets: AssetTag[];
  url: string;
  enabled: boolean;
}

export interface SourcesConfig {
  defaultTimezone: string;
  x: {
    list: {
      id: string;
      url: string;
      label: string;
    };
    accounts: XAccountConfig[];
  };
  youtube: {
    channels: YouTubeChannelConfig[];
  };
  rss: {
    feeds: RssFeedConfig[];
  };
  topics: {
    primary: string[];
    taSeparately: boolean;
  };
}

export interface CronDefaults {
  tz: string;
  session: 'main' | 'isolated' | string;
  agent: string;
  exact: boolean;
  announce: boolean;
}

export interface CronJobConfig {
  key: string;
  name: string;
  cron: string;
  messageFile: string;
  model?: string;
  thinking?: 'low' | 'medium' | 'high' | string;
  enabled: boolean;
  announce?: boolean;
  channel?: string;
  to?: string;
  agent?: string;
  session?: string;
  tz?: string;
  exact?: boolean;
}

export interface CronConfig {
  defaults: CronDefaults;
  jobs: CronJobConfig[];
}

export interface RssRawItem {
  type: 'rss';
  feedLabel: string;
  sourceUrl: string;
  title: string;
  link: string;
  contentSnippet?: string | null;
  isoDate?: string | null;
  category: string;
  assets: AssetTag[];
  fetchedAt: string;
}

export interface YouTubeRawItem {
  type: 'youtube';
  channelLabel: string;
  channelId: string | null;
  channelUrl: string;
  feedUrl: string;
  videoId: string;
  title: string;
  link: string;
  published?: string | null;
  updated?: string | null;
  category: string;
  assets: AssetTag[];
  fetchedAt: string;
}

export interface XRawItem {
  sourceType: 'x-list' | 'x-account';
  sourceLabel: string;
  authorHandle: string;
  displayName?: string | null;
  postUrl: string;
  postedAtText?: string | null;
  capturedAt: string;
  rawText: string;
  quotedPostUrl?: string | null;
  mediaUrls?: string[];
  isRepost: boolean;
  assetHints?: string[];
  category?: string | null;
}

export interface NormalizedItem {
  id: string;
  /** Product lane (thesis/catalyst/news). */
  lane: Lane;
  /** Legacy field; kept to avoid breaking existing scripts/state. */
  bucket: 'news' | 'ta' | 'catalyst';
  sourceKind: 'rss' | 'youtube' | 'x' | 'official';
  sourceLabel: string;
  sourceWeight?: number;
  title: string;
  /**
   * text is the primary content field used for extraction.
   * For YouTube, this may be upgraded from title → transcript.
   */
  text: string;
  url: string;
  publishedAt: string | null;
  collectedAt: string;
  assets: AssetTag[];
  category: string;
  confidence: 'high' | 'medium' | 'low';
  /** If present, indicates we could not extract deep content (e.g. YouTube transcript unavailable). */
  limitations?: string[];
}
