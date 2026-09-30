// Bundles the TypeScript tests with esbuild and runs them with node's built-in test runner.
// `node tests/run.mjs --sim [days] [seed]` runs the headless balance simulation instead.
import * as esbuild from 'esbuild';
import { readdirSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

mkdirSync('build', { recursive: true });
const sim = process.argv.includes('--sim');
const entries = sim ? ['tests/headless.ts'] : readdirSync('tests').filter((f) => f.endsWith('.test.ts')).map((f) => 'tests/' + f);
await esbuild.build({
  entryPoints: entries, bundle: true, platform: 'node', format: 'esm', outdir: 'build', outExtension: { '.js': '.mjs' },
  target: 'node20', logLevel: 'warning', sourcemap: 'inline',
});
const outs = entries.map((e) => 'build/' + e.split('/').pop().replace(/\.ts$/, '.mjs'));
const args = sim ? ['--enable-source-maps', outs[0], ...process.argv.slice(process.argv.indexOf('--sim') + 1)] : ['--enable-source-maps', '--test', ...outs];
const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
process.exit(r.status ?? 1);
