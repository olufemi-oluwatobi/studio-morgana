// The stamp library: the converter, the compiler check, and how stamps reach the writer.
import { readFileSync } from 'node:fs';
import { check } from '../src/gt/checker.gen.js';
import { stampList, stampsFor, withStamps, type LibStamp } from '../src/library';
// @ts-expect-error plain JavaScript shared with the web app
import { svgToStamp } from '../../web/src/lib/svgstamp.js';

let passed = 0, failed = 0;
const ok = (name: string, cond: boolean, detail = '') => { if (cond) { passed++; console.log('✓ ' + name); } else { failed++; console.log('✗ ' + name + (detail ? ' — ' + detail : '')); } };
const icon = (rel: string) => readFileSync(`/tmp/gi/${rel}`, 'utf8');
const haveIcons = (() => { try { icon('delapouite/house.svg'); return true; } catch { return false; } })();

const probe = (gt: string, slug: string) => check(`Let there be a flat canvas called t, 400 by 400.\n${gt}place a ${slug} at 200 200.\n`, {});

// a drawing with a body, a hole and a separate piece
const twoPieces = '<svg viewBox="0 0 100 100"><path fill="#000" d="M10 10H60V60H10Z M20 20V50H50V20Z"/><path fill="#000" d="M70 70L90 70L80 90Z"/></svg>';
const sq = svgToStamp(twoPieces, { name: 'pair' });
ok('a drawing becomes a stamp', sq.ok === true, JSON.stringify(sq.notes));
ok('disjoint pieces are separate parts', sq.parts?.length === 2, JSON.stringify(sq.parts));
ok('the stamp compiles when placed', probe(sq.gt!, 'pair').ok === true, JSON.stringify(probe(sq.gt!, 'pair').diagnostics));
ok('a bad name is refused', svgToStamp(twoPieces, { name: 'Bad Name' }).ok === false);
ok('an empty drawing is refused', svgToStamp('<svg viewBox="0 0 10 10"></svg>', { name: 'empty' }).ok === false);

if (haveIcons) {
  const bottle = svgToStamp(icon('delapouite/beer-bottle.svg'), { name: 'beer-bottle' });
  ok('a bottle keeps its whole body (one part, large)', bottle.ok === true && bottle.parts?.length === 1 && (bottle.parts[0].area ?? 0) > 15000, JSON.stringify(bottle.parts));
  const house = svgToStamp(icon('delapouite/house.svg'), { name: 'house' });
  ok('a house splits into body, roof edge and chimney', house.parts?.length === 3, JSON.stringify(house.parts));
  ok('the house compiles when placed', probe(house.gt!, 'house').ok === true);
}

const lib: LibStamp[] = [
  { slug: 'house', name: 'House', words: ['home', 'cottage'], tags: ['home'], parts: [{ name: 'body', area: 1 }], gt: 'define a house as:\n  draw a shape called body from 0 0 to 50 0 to 50 50.\nend.\n' },
  { slug: 'banana', name: 'Banana', words: ['fruit'], tags: ['food'], parts: [{ name: 'body', area: 1 }], gt: 'define a banana as:\n  draw a shape called body from 0 0 to 50 0 to 50 50.\nend.\n' },
];

ok('the writer sees only stamps that fit the plan', stampsFor(lib, [{ name: 'front-door-house', what: 'a red house with a door' }]).map((s) => s.slug).join() === 'house');
ok('no matching element offers nothing', stampsFor(lib, [{ name: 'sky', what: 'blue air' }]).length === 0);
ok('the prompt lists each stamp with its parts', /house: home, cottage; parts body/.test(stampList(lib)));

const placed = 'Let there be a flat canvas called t, 400 by 400.\nplace a house at 200 200, size 100.\n';
const withDef = withStamps(placed, lib);
ok('a placed stamp gets its definition in front', withDef.startsWith('define a house as:') && withDef.includes('place a house'));
ok('an unused stamp adds nothing', withStamps('Let there be a flat canvas called t, 400 by 400.\n', lib) === 'Let there be a flat canvas called t, 400 by 400.\n');
ok('a stamp the writer defined itself is not added twice', withStamps('define a house as:\n  draw a shape called b from 0 0 to 9 0 to 9 9.\nend.\nplace a house at 1 1.\n', lib).split('define a house').length === 2);
ok('the piece with its stamps compiles', check(withDef, {}).ok === true, JSON.stringify(check(withDef, {}).diagnostics));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
