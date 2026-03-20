import { readJson, resolveFromRoot, writeJson } from './fs.js';

export interface SeenState {
  rssLinks: string[];
  youtubeVideoIds: string[];
}

const STATE_FILE = resolveFromRoot('state', 'seen.json');

export function readSeenState(): SeenState {
  return readJson<SeenState>(STATE_FILE, {
    rssLinks: [],
    youtubeVideoIds: []
  });
}

export function writeSeenState(state: SeenState): void {
  writeJson(STATE_FILE, state);
}
