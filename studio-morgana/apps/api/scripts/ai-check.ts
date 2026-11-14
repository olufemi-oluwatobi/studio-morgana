// Tries the real models end to end, from your own machine:
//   AI_PROVIDER=openai AI_BASE_URL=https://crowllm.com/v1 AI_API_KEY=… READER_MODEL=… WRITER_MODEL=… node scripts/ai-check.mjs [image.jpg]
// It lists the service's models, pings the reader (with the image if you give one) and the writer, then runs one brief
// through the real plan → write → compile → fix wizards and prints what each step took. The key is read from the
// environment only; it is never printed or written anywhere.
import fs from 'node:fs';
import { buildModels, roleConfig } from '../src/wizard/models';
import { planBrief, writeOption } from '../src/wizard/create';
import { FACTS } from '../src/guide.gen';

const env = process.env as any;
const secs = (t: number) => ((Date.now() - t) / 1000).toFixed(1) + 's';
const step = async <T,>(name: string, f: () => Promise<T>): Promise<T | null> => {
  const t = Date.now();
  try { const r = await f(); console.log(`✓ ${name}  ${secs(t)}`); return r; }
  catch (e) { console.log(`✗ ${name}  ${secs(t)}  ${(e as Error).message}${(e as any).cause ? ' (' + String((e as any).cause?.message ?? (e as any).cause) + ')' : ''}`); return null; }
};

const r = roleConfig(env, 'read'), w = roleConfig(env, 'write');
console.log(`reader  ${r.provider}:${r.model}\nwriter  ${w.provider}:${w.model}\n`);
if (r.provider !== 'workers-ai' && r.baseUrl) {
  await step('list models', async () => {
    const res = await fetch(r.baseUrl + '/models', { headers: { authorization: `Bearer ${r.apiKey}` } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const ids = ((await res.json()) as any).data?.map((m: any) => m.id) ?? [];
    console.log('   ' + ids.slice(0, 60).join(', ') + (ids.length > 60 ? ` … (${ids.length} in all)` : ''));
  });
}
const m = buildModels(env);
const file = process.argv[2];
const images = file ? [{ name: file.split('/').pop()!, mime: /png$/i.test(file) ? 'image/png' : 'image/jpeg', bytes: new Uint8Array(fs.readFileSync(file)) }] : [];

await step('reader answers' + (images.length ? ' (with the image)' : ''), async () => console.log('   ' + (await m.read({ prompt: images.length ? 'Describe this image in one sentence.' : 'Say "ready" and nothing else.', images, maxTokens: 120 })).slice(0, 160)));
await step('writer answers', async () => console.log('   ' + (await m.write({ prompt: 'Say "ready" and nothing else.', maxTokens: 60 })).slice(0, 80)));

const brief = { prompt: process.env.BRIEF || 'A weekend sale poster, red and gold, bold chrome lettering', refs: [], images, looksLike: [] };
const t0 = Date.now();
const planned = await step('plan (look, plan, manual)', () => planBrief(m, brief, [...FACTS.fonts]));
if (planned) {
  console.log('   ' + planned.plan.kind, '·', planned.plan.elements.length + ' elements ·', planned.chapters.length + ' chapters');
  const made = await step('write + compile + fix', () => writeOption(m, { brief, planned, files: {}, i: 0, n: 1, rounds: 3 }));
  if (made) {
    console.log(`   compiles: ${made.ok}  fix rounds: ${made.rounds}`);
    for (const s of made.trail) console.log(`   · ${s.step} (${s.by}, ${(s.ms / 1000).toFixed(1)}s): ${s.note}`);
    fs.writeFileSync('ai-check-output.gt', made.source);
    console.log('\nwrote ai-check-output.gt');
  }
}
console.log(`\ntotal ${secs(t0)}`);
