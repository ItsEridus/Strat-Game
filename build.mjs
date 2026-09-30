// Bundles the game into dist/game.js (a classic script, so index.html works from file://).
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const options = {
  entryPoints: ['src/main.tsx'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/game.js',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  target: 'es2020',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching for changes… open index.html in a browser and refresh after edits.');
} else {
  await esbuild.build(options);
}
