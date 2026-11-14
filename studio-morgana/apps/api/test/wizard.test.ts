// The wizards with scripted models: the loops, the plan, patches, answers and reviews, without Workers AI.
//   node apps/api/test/run-wizard.mjs
import { planBrief, writeOption } from '../src/wizard/create';
import { editPiece, parsePatch, applyPatch, reviewRender } from '../src/wizard/edit';
import { MANUAL } from '../src/manual.gen';
import { openAiCompatible, type Ask, type Models } from '../src/wizard/models';

let pass = 0, failn = 0;
const ok = (name: string, cond: boolean, detail = '') => { cond ? pass++ : failn++; console.log(`${cond ? '✓' : '✗'} ${name}${!cond && detail ? ' · ' + detail : ''}`); };

// a model that answers from a script: the first rule whose pattern matches the prompt
type Rule = [RegExp, string | ((a: Ask) => string)];
function scripted(reader: Rule[], writer: Rule[]) {
  const calls: { who: string; a: Ask }[] = [];
  const pick = (rules: Rule[], who: string) => async (a: Ask) => {
    calls.push({ who, a });
    const r = rules.find(([re]) => re.test(a.prompt));
    if (!r) throw new Error(`${who}: no scripted answer for: ${a.prompt.slice(0, 120)}`);
    return typeof r[1] === 'function' ? r[1](a) : r[1];
  };
  const m: Models & { calls: typeof calls } = { read: pick(reader, 'reader'), write: pick(writer, 'writer'), names: { reader: 'scout', writer: 'oss' }, calls };
  return m;
}
const gt = (s: string) => '```gt\n' + s + '\n```';

const GOOD = `Let there be a flat canvas called sale, 1080 by 1350.
Let ink be #14121a.
Make the card ink.
Write "SALE" called headline in Lilita One, size 300, at 540 600.
Make the headline #ffd23f.
Make the headline glow in #ff7a2f, 40 wide.
Write "THIS WEEKEND" called sub in Jost, size 48, under the headline, 40 apart.
Make the sub white.`;

const plan = { kind: 'canvas', title: 'sale', size: [1080, 1350], flat: true, mood: 'loud', palette: [{ name: 'ink', hex: '#14121a' }, { name: 'sun', hex: '#ffd23f' }], fonts: ['Lilita One', 'Jost'], elements: [{ name: 'headline', what: 'big SALE', where: 'centre' }], images: [], notes: '' };

// 1. plan, then write: the writer's first try has a typo the compiler can fix and a word it cannot
{
  const m = scripted(
    [[/plan a piece/i, JSON.stringify(plan)], [/Pick the chapters/i, '{"chapters": ["verb:write", "words", "example:a-launch-poster-duotone-photo", "not-a-chapter"]}']],
    [[/does not compile/, gt(GOOD)], [/Write the piece/, gt(GOOD.replace('glow in', 'glowy in').replace('Make the sub white.', 'Make the sub sparkly.'))]],
  );
  const planned = await planBrief(m, { prompt: 'a weekend sale poster', refs: [], images: [], looksLike: [] }, ['Lilita One', 'Jost']);
  ok('the reader plans the piece', planned.plan.kind === 'canvas' && planned.plan.palette.length === 2 && planned.plan.elements[0].name === 'headline');
  const ids = planned.chapters.map((c) => c.id);
  ok('the reader picks chapters; unknown ids are dropped; what every canvas needs is added', ids.includes('verb:write') && ids.includes('layout') && ids.includes('names') && !ids.includes('not-a-chapter'), ids.join(','));
  ok('no look step without images', !m.calls.some((c) => /designer was given these images/.test(c.a.prompt)));
  const sys = MANUAL.filter((c) => c.core).length;
  const w = await writeOption(m, { brief: { prompt: 'a weekend sale poster', refs: [], images: [], looksLike: [] }, planned, files: {}, i: 0, n: 2, rounds: 3 });
  ok('the writer gets the core and the picked chapters, not the whole guide', sys === 2 && m.calls.filter((c) => c.who === 'writer')[0].a.system!.length < 30000, String(m.calls.filter((c) => c.who === 'writer')[0].a.system!.length));
  ok('the compiler fixes "glowy" itself; the writer fixes "sparkly"; then it compiles', w.ok && w.rounds === 1 && /glow in/.test(w.source) && !/sparkly/.test(w.source), JSON.stringify(w.trail));
  const fixPrompt = m.calls.find((c) => /does not compile/.test(c.a.prompt))!.a.prompt;
  ok('the fix prompt names the line and the error', /sparkly/.test(fixPrompt) && /line 8/.test(fixPrompt), fixPrompt.slice(-400));
  ok('the trail says what happened', w.trail.map((t) => t.step).join(' → ') === 'write → check → fix 1 → check', w.trail.map((t) => t.step).join(' → '));
}

// 2. a writer that never gets it right stops after the rounds, with the errors
{
  const bad = GOOD.replace('Make the sub white.', 'Make the sub sparkly.');
  const m = scripted([], [[/./, gt(bad)]]);
  const w = await writeOption(m, { brief: { prompt: 'x', refs: [], images: [], looksLike: [] }, planned: { plan: plan as any, chapters: [], looks: '', trail: [] }, files: {}, i: 0, n: 1, rounds: 2 });
  ok('the loop stops after its rounds and says it did not compile', !w.ok && w.rounds === 2 && m.calls.length === 3, `${w.rounds} rounds, ${m.calls.length} calls`);
}

// 3. images: the reader looks at them first, and the plan may only use images it was given
{
  const img = { name: 'beach.jpg', mime: 'image/jpeg', bytes: new Uint8Array([255, 216, 255]) };
  const m = scripted(
    [[/designer was given these images/, '@beach.jpg: a blue sea at noon, #1d6fa5, subject on the left.'], [/plan a piece/i, JSON.stringify({ ...plan, images: [{ file: 'beach.jpg', use: 'full bleed' }, { file: 'made-up.jpg', use: 'x' }] })], [/Pick the chapters/, '{"chapters":[]}']],
    [],
  );
  const p = await planBrief(m, { prompt: 'a travel post', refs: [], images: [img] }, []);
  ok('the reader sees the images', m.calls[0].a.images?.length === 1 && /blue sea/.test(p.looks));
  ok('the plan keeps only images it was given', p.plan.images.length === 1 && p.plan.images[0].file === 'beach.jpg');
}

// 3b. style references are seen too, and are marked as not to be printed
{
  const sty = { name: 'reference piece 1', mime: 'image/png', bytes: new Uint8Array([137, 80]) };
  const m = scripted([[/designer was given these images/, 'reference piece 1: big condensed type, #d33.'], [/plan a piece/i, JSON.stringify(plan)], [/Pick the chapters/, '{"chapters":[]}']], []);
  const p = await planBrief(m, { prompt: 'like this', refs: [], images: [], looksLike: [sty] }, []);
  ok('the reader sees a style reference and is told not to print it', m.calls[0].a.images?.length === 1 && /must not print/.test(m.calls[0].a.prompt) && /condensed/.test(p.looks));
}

// 4. patches
{
  const src = 'a\nb\nc\nd\ne\n';
  ok('a patch replaces, inserts and deletes by the numbers it was shown', applyPatch(src, parsePatch('```patch\nREPLACE 2-3\nB\nEND\nINSERT AFTER 5\nf\nEND\nDELETE 1\n```')!) === 'B\nd\ne\nf\n');
  ok('a patch may insert at the top', applyPatch(src, parsePatch('INSERT AFTER 0\nz\nEND')!) === 'z\na\nb\nc\nd\ne\n');
  ok('line numbers copied into new lines are dropped', applyPatch(src, parsePatch('REPLACE 1\n  1| A\nEND')!) === 'A\nb\nc\nd\ne\n');
  let threw = false; try { applyPatch(src, parsePatch('DELETE 9')!); } catch { threw = true; }
  ok('a patch outside the source is refused', threw);
}

// 5. an edit: the reader understands it from the picture, the writer patches, the compiler checks
{
  const picture = { name: 'poster-1200', mime: 'image/webp', bytes: new Uint8Array([1, 2, 3]) };
  const m = scripted(
    [[/They asked/, '{"intent":"change","targets":["headline","nope"],"plan":"Make the headline #ff3b30.","chapters":["make-give"]}']],
    [[/Reply with a patch/, '```patch\nREPLACE 5\nMake the headline #ff3b30.\nEND\n```']],
  );
  const r = await editPiece(m, { source: GOOD + '\n', text: 'make the headline red', parts: [], picture, images: [], files: {}, rounds: 3 });
  ok('the reader sees the picture and the things in it', m.calls[0].a.images?.length === 1 && /headline \(line 4\)/.test(m.calls[0].a.prompt));
  ok('targets are things that exist', r.understood.targets.join() === 'headline');
  ok('the patch changes one line and keeps the rest', r.ok && r.source.split('\n')[4] === 'Make the headline #ff3b30.' && r.source.split('\n').filter((l, i) => l !== (GOOD + '\n').split('\n')[i]).length === 1);
}

// 6. a question gets an answer and no change
{
  const m = scripted([[/They asked/, '{"intent":"question","targets":[],"plan":"","answer":"The headline is Lilita One at 300."}']], []);
  const r = await editPiece(m, { source: GOOD + '\n', text: 'what font is the headline?', parts: [], picture: null, images: [], files: {}, rounds: 3 });
  ok('a question is answered without touching the source', r.answer === 'The headline is Lilita One at 300.' && r.source === GOOD + '\n' && !m.calls.some((c) => c.who === 'writer'));
}

// 7. a patch that breaks the source goes round the loop
{
  const m = scripted(
    [[/They asked/, '{"intent":"add","targets":[],"plan":"Add a badge circle top right.","chapters":["things"]}']],
    [[/Reply with a patch/, '```patch\nINSERT AFTER 8\nLet there be a cirle called badge, 160 big, at the top right.\nMake the badge glimmery.\nEND\n```'], [/does not compile/, (a) => gt(a.prompt.match(/```\n([\s\S]*?)```/)![1].split('\n').map((l) => l.replace(/^\s*\d+\| ?/, '')).join('\n').replace('glimmery', '#ffd23f'))]],
  );
  const r = await editPiece(m, { source: GOOD + '\n', text: 'add a badge', parts: [], picture: null, images: [], files: {}, rounds: 3 });
  ok('an edit that does not compile is fixed in the loop', r.ok && /circle called badge/.test(r.source) && /badge #ffd23f/.test(r.source) && r.rounds === 1, JSON.stringify(r.trail) + '\n' + r.source);
}

// 8. review
{
  const m = scripted([[/Does the image do what they asked/, 'Sure! {"ok": false, "issues": ["the subtitle overlaps the headline"], "summary": "close"}']], []);
  const rv = await reviewRender(m, { text: 'move the subtitle down', picture: { mime: 'image/webp', bytes: new Uint8Array([1]) }, source: GOOD });
  ok('a review reads JSON out of a chatty reply', !rv.ok && rv.issues[0] === 'the subtitle overlaps the headline');
}

// 9. any OpenAI-compatible endpoint can stand in for either model
{
  const sent: any[] = [];
  const fake = (async (url: string, init: any) => { sent.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization }); return new Response(JSON.stringify({ choices: [{ message: { content: 'hello' } }] })); }) as unknown as typeof fetch;
  const m = openAiCompatible({ AI_BASE_URL: 'https://llm.example/v1/', AI_API_KEY: 'k', AI_READER: 'r-model', AI_MODEL: 'w-model' } as any, fake);
  const a = await m.read({ prompt: 'look', images: [{ mime: 'image/png', bytes: new Uint8Array([1]) }] }), b = await m.write({ prompt: 'write', system: 'sys' });
  ok('an OpenAI-compatible provider serves the reader (with images) and the writer', a === 'hello' && b === 'hello' && sent[0].url === 'https://llm.example/v1/chat/completions' && sent[0].body.model === 'r-model' && sent[0].body.messages[0].content[1].type === 'image_url' && sent[1].body.model === 'w-model' && sent[1].auth === 'Bearer k');
}

console.log(`\n${pass} passed, ${failn} failed`);
if (failn) process.exit(1);
