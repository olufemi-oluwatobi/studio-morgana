// bundles ai-check.ts with esbuild and runs it in Node
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', '..', 'out', 'ai-check.mjs');
await esbuild.build({ entryPoints: [path.join(here, 'ai-check.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
await import(out);
