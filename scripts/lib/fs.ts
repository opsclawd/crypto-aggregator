import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function repoRoot(): string {
  return process.env.AGGREGATOR_ROOT || process.cwd();
}

export function resolveFromRoot(...parts: string[]): string {
  return path.join(repoRoot(), ...parts);
}

export function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

export function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export function appendJsonl(filePath: string, items: unknown[]): void {
  ensureDir(path.dirname(filePath));
  const body = items.map((item) => JSON.stringify(item)).join('\n');
  const suffix = body.length > 0 ? `${body}\n` : '';
  fs.appendFileSync(filePath, suffix, 'utf8');
}

export function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((entry) => path.join(dir, entry));
}

export function isoDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function timestampSlug(date = new Date()): string {
  return date.toISOString().replaceAll(':', '-');
}
