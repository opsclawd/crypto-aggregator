import { ensureDir, resolveFromRoot, writeJson } from './lib/fs.js';

const dirs = [
  resolveFromRoot('data', 'raw'),
  resolveFromRoot('state'),
  resolveFromRoot('out')
];

for (const dir of dirs) ensureDir(dir);

const seenPath = resolveFromRoot('state', 'seen.json');
writeJson(seenPath, {
  rssLinks: [],
  youtubeVideoIds: []
});
writeJson(resolveFromRoot('state', 'x-list-checkpoint.json'), {
  lastPostUrl: null,
  collectedAt: null
});
writeJson(resolveFromRoot('state', 'x-accounts-checkpoint.json'), {
  accounts: {}
});
writeJson(resolveFromRoot('state', 'cron-registry.json'), {});

console.log('Initialized directories and state.');
