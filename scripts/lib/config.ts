import YAML from 'yaml';
import { z } from 'zod';
import { readText, resolveFromRoot } from './fs.js';
import type { CronConfig, SourcesConfig } from './types.js';

const SourcesSchema = z.object({
  defaultTimezone: z.string(),
  x: z.object({
    list: z.object({
      id: z.string(),
      url: z.string().url(),
      label: z.string()
    }),
    accounts: z.array(z.object({
      handle: z.string(),
      url: z.string().url(),
      category: z.string(),
      lane: z.enum(['thesis', 'catalyst', 'news']).optional(),
      weight: z.number().positive().optional(),
      assets: z.array(z.string()),
      enabled: z.boolean()
    }))
  }),
  youtube: z.object({
    channels: z.array(z.object({
      label: z.string(),
      handle: z.string().nullable().optional(),
      url: z.string().url(),
      category: z.string(),
      lane: z.enum(['thesis', 'catalyst', 'news']).optional(),
      weight: z.number().positive().optional(),
      assets: z.array(z.string()),
      enabled: z.boolean(),
      channelId: z.string().nullable().optional()
    }))
  }),
  rss: z.object({
    feeds: z.array(z.object({
      label: z.string(),
      category: z.string(),
      lane: z.enum(['thesis', 'catalyst', 'news']).optional(),
      weight: z.number().positive().optional(),
      assets: z.array(z.string()),
      url: z.string().url(),
      enabled: z.boolean()
    }))
  }),
  topics: z.object({
    primary: z.array(z.string()),
    taSeparately: z.boolean()
  })
});

const CronSchema = z.object({
  defaults: z.object({
    tz: z.string(),
    session: z.string(),
    agent: z.string(),
    exact: z.boolean(),
    announce: z.boolean()
  }),
  jobs: z.array(z.object({
    key: z.string(),
    name: z.string(),
    cron: z.string(),
    messageFile: z.string(),
    model: z.string().optional(),
    thinking: z.string().optional(),
    enabled: z.boolean(),
    announce: z.boolean().optional(),
    channel: z.string().optional(),
    to: z.string().optional(),
    agent: z.string().optional(),
    session: z.string().optional(),
    tz: z.string().optional(),
    exact: z.boolean().optional()
  }))
});

export function loadSourcesConfig(): SourcesConfig {
  const raw = readText(resolveFromRoot('config', 'sources.yaml'));
  return SourcesSchema.parse(YAML.parse(raw)) as SourcesConfig;
}

export function loadCronConfig(): CronConfig {
  const raw = readText(resolveFromRoot('config', 'cron.yaml'));
  return CronSchema.parse(YAML.parse(raw)) as CronConfig;
}
