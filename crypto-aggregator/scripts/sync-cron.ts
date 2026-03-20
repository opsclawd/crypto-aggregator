import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { loadCronConfig } from './lib/config.js';
import { readText, repoRoot, resolveFromRoot } from './lib/fs.js';

type ExistingJob = {
  id: string;
  name?: string;
  enabled?: boolean;
};

const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw';

function expandEnv(value: string | undefined): string | undefined {
  if (!value) return value;
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_m, key: string) => process.env[key] || '');
}

function runOpenClaw(args: string[]): string {
  return execFileSync(OPENCLAW_BIN, args, {
    cwd: repoRoot(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function listJobs(): ExistingJob[] {
  const raw = runOpenClaw(['cron', 'list', '--all', '--json']);
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed as ExistingJob[];
  if (Array.isArray(parsed.jobs)) return parsed.jobs as ExistingJob[];
  return [];
}

function messageText(messageFile: string): string {
  const fullPath = path.isAbsolute(messageFile)
    ? messageFile
    : resolveFromRoot(messageFile);
  return readText(fullPath).trim();
}

function createJob(job: ReturnType<typeof loadCronConfig>['jobs'][number], defaults: ReturnType<typeof loadCronConfig>['defaults']): string {
  const announce = job.announce ?? defaults.announce;
  const exact = job.exact ?? defaults.exact;
  const args = [
    'cron', 'add',
    '--name', job.name,
    '--cron', job.cron,
    '--tz', job.tz || defaults.tz,
    '--session', job.session || defaults.session,
    '--message', messageText(job.messageFile)
  ];

  if (job.model) args.push('--model', job.model);
  if (job.thinking) args.push('--thinking', job.thinking);
  if ((job.agent || defaults.agent) && (job.agent || defaults.agent) !== 'default') {
    args.push('--agent', job.agent || defaults.agent);
  }
  if (exact) args.push('--exact');

  const channel = expandEnv(job.channel);
  const to = expandEnv(job.to);
  if (announce) args.push('--announce');
  if (announce && channel) args.push('--channel', channel);
  if (announce && to) args.push('--to', to);

  console.log(`Creating cron job: ${job.name}`);
  runOpenClaw(args);

  const refreshed = listJobs();
  const created = refreshed.find((item) => item.name === job.name);
  if (!created) {
    throw new Error(`Created ${job.name} but could not resolve its job id`);
  }

  if (!job.enabled) {
    runOpenClaw(['cron', 'disable', created.id]);
  }

  return created.id;
}

function removeJob(jobId: string): void {
  console.log(`Removing cron job ${jobId}`);
  runOpenClaw(['cron', 'rm', jobId]);
}

function readRegistryPath(): string {
  return resolveFromRoot('state', 'cron-registry.json');
}

function readRegistry(): Record<string, string> {
  const file = readRegistryPath();
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
}

function writeRegistry(registry: Record<string, string>): void {
  fs.writeFileSync(readRegistryPath(), `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
}

function main(): void {
  const config = loadCronConfig();
  const registry = readRegistry();

  for (const jobId of Object.values(registry)) {
    try {
      removeJob(jobId);
    } catch (error) {
      console.warn(`Failed to remove ${jobId}. Continuing.`, error);
    }
  }

  const nextRegistry: Record<string, string> = {};
  for (const job of config.jobs) {
    nextRegistry[job.key] = createJob(job, config.defaults);
  }

  writeRegistry(nextRegistry);
  console.log('Cron sync complete.');
}

main();
