import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, isoDay, resolveFromRoot, timestampSlug, writeJson } from './fs.js';

export function hashId(parts: string[]): string {
  return crypto.createHash('sha256').update(parts.join('||')).digest('hex').slice(0, 20);
}

export function todayRawDir(kind: 'rss' | 'youtube' | 'x', date = new Date()): string {
  const dir = resolveFromRoot('data', 'raw', isoDay(date), kind);
  ensureDir(dir);
  return dir;
}

export function writeTimestampedJson(
  kind: 'rss' | 'youtube' | 'x',
  fileStem: string,
  payload: unknown,
  date = new Date()
): string {
  const dir = todayRawDir(kind, date);
  const filePath = path.join(dir, `${fileStem}-${timestampSlug(date)}.json`);
  writeJson(filePath, payload);
  return filePath;
}

export function latestFileByPrefix(dir: string, prefix: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const matches = fs.readdirSync(dir)
    .filter((entry) => entry.startsWith(prefix) && entry.endsWith('.json'))
    .sort();
  if (matches.length === 0) return null;
  return path.join(dir, matches[matches.length - 1]!);
}
