// Godtongue: the public API.
//   import { createRegistry, compile, engines } from './index.js'
// Packs are plug-ins: add a file to packs/ and list it in PACKS (or pass your own to createRegistry).
import { Registry } from './core/registry.js';
import { compile as compileCore } from './core/compile.js';
import { loadEngines } from './engines/index.js';
import card from './packs/card.js';
import materials from './packs/materials.js';
import ops from './packs/ops.js';
import text from './packs/text.js';
import art from './packs/art.js';
import styles from './packs/styles.js';
import shapes from './packs/shapes.js';
import room from './packs/room.js';
import elements from './packs/elements.js';
import english from './packs/english.js';
import layout from './packs/layout.js';

export const PACKS = [materials, card, ops, text, art, shapes, styles, room, elements, english, layout];   // english, then layout: they build on the others

export function createRegistry(packs = PACKS) {
  const reg = new Registry();
  for (const p of packs) reg.use(p);
  return reg;
}

export function compile(source, opts = {}) {
  return compileCore(source, { registry: opts.registry || createRegistry(), ...opts });
}

export { loadEngines };
