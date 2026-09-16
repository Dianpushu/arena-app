import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json');
const policy = process.argv[2] ?? 'never';
if (!['always', 'never'].includes(policy))
  throw new Error('Publish policy must be always or never');
if (!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version))
  throw new Error('Only stable and beta versions are supported');
const beta = version.includes('-beta.');
const result = spawnSync(
  process.execPath,
  [
    require.resolve('electron-builder/cli.js'),
    '--win',
    '--publish',
    policy,
    `-c.publish.channel=${beta ? 'beta' : 'latest'}`,
    // 本機直接發布也必須將 Beta 標記為 prerelease；正式版先保持 draft 供確認。
    `-c.publish.releaseType=${beta ? 'prerelease' : 'draft'}`,
  ],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
