import fs from 'node:fs';
import path from 'node:path';
import { resolveFromRoot, writeJson, readJson } from './lib/fs.js';

type LockFile = {
  kind: 'x-collect';
  job: string;
  createdAt: string;
  ttlMinutes: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function minutesBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  return Math.abs(b - a) / 60000;
}

function lockPath(): string {
  return resolveFromRoot('state', 'x-collect.lock.json');
}

function acquire(job: string, ttlMinutes: number): void {
  const fp = lockPath();
  const existing = readJson<LockFile | null>(fp, null);
  if (existing?.createdAt) {
    const age = minutesBetween(existing.createdAt, nowIso());
    if (age < existing.ttlMinutes) {
      console.error(`X collect lock active (job=${existing.job}, age=${age.toFixed(1)}m < ttl=${existing.ttlMinutes}m). Exiting.`);
      process.exit(2);
    }
  }

  const payload: LockFile = {
    kind: 'x-collect',
    job,
    createdAt: nowIso(),
    ttlMinutes
  };
  writeJson(fp, payload);
  console.log(`Acquired X collect lock for job=${job} (ttl=${ttlMinutes}m)`);
}

function release(): void {
  const fp = lockPath();
  if (fs.existsSync(fp)) {
    fs.rmSync(fp);
    console.log('Released X collect lock');
  } else {
    console.log('No X collect lock present');
  }
}

function main(): void {
  const [cmd, job, ttlStr] = process.argv.slice(2);
  if (!cmd || (cmd !== 'acquire' && cmd !== 'release')) {
    console.error('Usage: tsx scripts/x-collect-lock.ts acquire <job> [ttlMinutes]\n       tsx scripts/x-collect-lock.ts release');
    process.exit(1);
  }

  if (cmd === 'release') {
    release();
    return;
  }

  if (!job) {
    console.error('Missing <job>');
    process.exit(1);
  }
  const ttlMinutes = ttlStr ? Number(ttlStr) : 25;
  if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
    console.error('Invalid ttlMinutes');
    process.exit(1);
  }

  // Ensure state dir exists
  fs.mkdirSync(path.dirname(lockPath()), { recursive: true });
  acquire(job, ttlMinutes);
}

main();
