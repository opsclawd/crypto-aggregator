import { loadCronConfig, loadSourcesConfig } from './lib/config.js';

loadSourcesConfig();
loadCronConfig();
console.log('Config OK');
