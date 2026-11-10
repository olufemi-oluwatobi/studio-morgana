import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname), root = path.resolve(here, '..', '..');
// each repo module gets its own file:// URL, so ROOT and HERE resolve to the recorded paths
const metaUrl = { name: 'meta-url', setup(b) { b.onLoad({ filter: /\.js$/ }, async (a) => {
  if (!a.path.startsWith(root) || a.path.includes('node_modules')) return;
  const src = fs.readFileSync(a.path, 'utf8');
  return { contents: src.replaceAll('import.meta.url', JSON.stringify('file://' + a.path)), loader: 'js' };
}); } };
await esbuild.build({
  entryPoints: [path.join(here, 'entry.js')], bundle: true, format: 'iife', globalName: 'GTStudio', platform: 'browser',
  outfile: path.join(here, 'gt-bundle.js'), minify: true, logLevel: 'warning', plugins: [metaUrl],
  inject: [path.join(here, 'globals.js')],
  alias: { 'node:fs': path.join(here, 'shim-fs.js'), 'node:path': path.join(here, 'node_modules', 'path-browserify', 'index.js'), 'node:url': path.join(here, 'shim-url.js'),
    'node:crypto': path.join(here, 'shim-crypto.js'), 'node:child_process': path.join(here, 'shim-cp.js') },
});
console.log('bundle', (fs.statSync(path.join(here, 'gt-bundle.js')).size / 1e3).toFixed(0), 'KB');
