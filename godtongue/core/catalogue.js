// The catalogue: every part of the platform and every property it has, in one place.
//
// The Card Document (core/doc.js) is the contract between the language and the renderers, so this catalogue is written
// against it: what exists, what each property does, what the renderer does with it, and how a writer reaches it today.
// docs/catalogue.md is generated from this file plus the live registry (node tools/catalogue.mjs), and test/run.js
// fails when the compiler emits, or the renderer reads, a property that is not listed here. Nothing can be added
// to the platform without being catalogued.
//
// Status of a property:
//   ok          rendered, and the plain-English layer reaches it (let, write, make, give, move, change, when)
//   old         rendered, but only verbs the plain-English layer replaces reach it (create, draw, enamel, shadow, glide,
//               set, bring in, …). The craft operations (emboss, engrave, deboss, etch, plate, foil, inlay, spray, print,
//               illustrate, mix, sign, reveal, caption, place) keep their own first word, so they count as ok.
//   none        rendered, but no word reaches it: a gap in the language
//   partial     some values are reachable, some are not (the note says which)
//   unrendered  the language has it but the web renderer does not draw it
//   internal    set by the compiler for the renderers; never written by an author

const P = (key, type, def, does, say, status, note) => ({ key, type, def, does, say, status, ...(note ? { note } : {}) });

export const PARTS = [
  {
    id: 'piece', title: 'Piece', path: 'doc',
    does: 'The whole thing being made: one document, one source file. Its kind decides what else it has.',
    props: [
      P('kind', 'card | canvas | stage | room', 'card', 'What the piece is. A card is a physical card with two faces; a canvas is one surface of any size; a stage holds several objects (a scene); a stage with a video is animated; a room is an interior (its own renderer).', 'Let there be a card / canvas / stage / video called …', 'ok', 'a room only through "create a room …", and the web renderer does not draw rooms'),
      P('name', 'text', 'untitled', 'The piece\'s name; also its file and its id.', '… called poster', 'ok'),
      P('id', 'text', 'godtongue/<name>', 'Stable id for engines and caches.', '(from the name)', 'internal'),
      P('gtdoc', 'number', 1, 'Version of the document format.', '', 'internal'),
      P('source', 'text', null, 'The source text the document was compiled from.', '', 'internal'),
      P('view', 'object', null, 'Which face or view the preview opens on.', '', 'internal'),
      P('card', 'object', null, 'The blank\'s settings (see Card and canvas settings).', 'Let there be a card / canvas …', 'ok'),
      P('canvas', 'object', null, 'Present for a canvas (see Canvas).', 'Let there be a canvas …', 'ok'),
      P('stage', 'object', null, 'Present for a stage or video (see Stage and video).', 'Let there be a stage / video …', 'ok'),
      P('video', 'object', null, 'Present for a video (see Stage and video).', 'Let there be a video …, 5 s long', 'ok'),
      P('assets', 'map', {}, 'Files the piece uses (photos, drawings, placed cards), by key, with their hash.', '@photo.jpg anywhere a file is named', 'ok'),
      P('materials', 'map', {}, 'Every material the steps use, defined once (see Materials).', '(from make, plate, enamel, mix …)', 'internal'),
      P('layers', 'map', {}, 'Every thing drawn or written, by name (see Things).', 'Let there be …, Write …', 'ok'),
      P('zones', 'map', {}, 'Named areas of the surface that are not drawn: the card, the window (see Zones).', 'make the window 756 by 1345, at 242 242', 'old'),
      P('sides', 'map', {}, 'Each face (front, back, or an object\'s name on a stage) with the steps that make it (see Looks).', '(arranged by the compiler); on the back', 'partial', '"on the back" exists only as the older "on the back." line'),
      P('elements', 'map', {}, 'Objects on a stage, or the card or canvas itself as one object (see Objects).', 'Let there be a card called ball, of cardstock …', 'ok'),
      P('timeline', 'object', null, 'Reveals, captions and the camera (see Time).', 'reveal, caption, glide the camera', 'partial', 'reveal and caption are craft words; the camera only moves through the older glide'),
      P('room', 'object', null, 'A room\'s size, surfaces, furniture, lights and cameras.', 'create a room …', 'old', 'drawn only by the room engine'),
    ],
  },
  {
    id: 'card', title: 'Card and canvas settings', path: 'doc.card',
    does: 'The blank: its size, its stock, and the studio it is shown in. A canvas uses the same record with its own size.',
    props: [
      P('size_mm', '[w, h] mm', [54, 83.43], 'Physical size: a card\'s real size; a canvas\'s at 300 dpi.', '', 'internal', 'cards are always the standard size; no word sets another'),
      P('grid', '[w, h] px', [1240, 1829], 'The drawing grid every position is measured on.', 'Let there be a canvas …, 1080 by 1350', 'ok'),
      P('rect', '[x, y, w, h] px', [80, 80, 1080, 1669], 'Where the body sits inside the grid.', '(from the size)', 'internal'),
      P('r', 'px', 54, 'Corner radius of the body.', '', 'none', 'cards keep the standard radius and canvases are square; no word changes it'),
      P('stock', 'stock', 'stainless', 'What the blank is made of (see Stocks).', 'Let there be a card called … from brass', 'ok'),
      P('thickness_mm', 'mm', 0.8, 'Thickness of the blank; shows at the edge.', 'Let there be a card …, 1.2 mm thick', 'partial', 'only when the piece is started'),
      P('brush_deg', 'degrees', 0, 'Direction of the brushed-metal grain.', 'brush the card at 30 degrees · set the brush to 30', 'old'),
      P('seed', 'number', 1, 'Seed for everything random (sprays, grain, scatter), so a piece renders the same every time.', 'set the seed to 7', 'old'),
      P('edition', '{ no, of, set }', '1 of 1', 'Edition number, shown on cards that print it.', 'set the edition to 1 of 100', 'old'),
      P('title', 'text', null, 'Human title of the card.', 'set the title to "Marilyn"', 'old'),
      P('bench', 'colour', '#0e0f12', 'The colour of the surface the card lies on (the background around it).', 'set the bench to #0e0f12', 'old'),
      P('lights', '[numbers]', [-1, 0, 1], 'Where the studio lights sit, left to right.', 'set the lights to -1 0 1', 'old'),
    ],
  },
  {
    id: 'canvas', title: 'Canvas', path: 'doc.canvas',
    does: 'Present when the piece is a canvas (or a flat stage or video).',
    props: [
      P('size_px', '[w, h] px', null, 'The canvas size.', 'Let there be a canvas called poster, 1080 by 1350', 'ok'),
      P('flat', 'yes/no', false, 'Exact colours, no studio light: graphic design rather than a lit object. Paper objects then cover instead of multiplying.', 'Let there be a flat canvas …', 'ok', 'all or nothing: a flat page with one lit chrome headline is not possible'),
    ],
  },
  {
    id: 'stage', title: 'Stage and video', path: 'doc.stage · doc.video',
    does: 'A stage is a scene of objects; adding a length makes it a video.',
    props: [
      P('stage.size', '[w, h] px', null, 'The stage size.', 'Let there be a stage / video called …, 1080 by 1080', 'ok'),
      P('stage.background', 'colour', null, 'The colour behind the objects.', '…, on #14121a', 'ok'),
      P('video.seconds', 'seconds', null, 'Length of the video.', '…, 5 s long', 'ok'),
      P('video.fps', 'number', 30, 'Frames per second when exported.', '…, fps 24', 'ok'),
    ],
  },
  {
    id: 'zone', title: 'Zones', path: 'doc.zones.<name>',
    does: 'Named areas that are not drawn: "card" is the whole body; "window" is where a photo goes by default.',
    props: [
      P('rect', '[x, y, w, h] px', null, 'The area.', 'make the window 756 by 1345, at 242 242', 'old'),
      P('r', 'px', null, 'Its corner radius.', 'make the window …, corners 9', 'old'),
    ],
  },
  {
    id: 'thing', title: 'Things (all kinds)', path: 'doc.layers.<name>',
    does: 'Anything drawn or written on a surface. Every thing has a name and remembers the line that made it, so the editor can find it.',
    props: [
      P('kind', 'vector | text | signature', null, 'What sort of thing it is (below).', '(from the word that made it)', 'internal'),
      P('line', 'number', null, 'The source line that made it.', '', 'internal'),
      P('span', '[from, to]', null, 'Where in the source the statement is.', '', 'internal'),
    ],
  },
  {
    id: 'shape', title: 'Shapes and drawings', path: 'doc.layers.<name> (kind vector)',
    does: 'Shapes, lines, paths, patterns, drawings and groups. Each is a list of outlines (shapes), plus an SVG for drawings.',
    props: [
      P('shapes', '[outline]', null, 'The outlines that make the thing (see Outline).', 'Let there be a circle / star / heart … called …', 'ok'),
      P('generator', 'name', null, 'Which shape or pattern made it (see Shapes and patterns).', 'Let there be a <shape> …', 'ok'),
      P('svg', 'SVG', null, 'The drawing itself, for paths, drawings and patterns.', 'Let there be a path called leaf, "M0 0 …" · draw @sketch.svg', 'ok'),
      P('clip', 'SVG path', null, 'The outline a filled path clips to.', '(from the path)', 'internal'),
      P('path', 'object', null, 'The line a shape follows (for patterns along a path and text).', '(from the shape)', 'internal'),
      P('points', '[[x, y]]', null, 'The points a shape, line or curve passes through.', 'draw a line called … from 100 100 through 300 200 to 500 100', 'old'),
      P('parts', '[names]', null, 'For a group or a set of several: the names of its members.', 'Let there be 9 circles called orbit … (then "the orbits") · group the a and the b as c', 'ok'),
      P('object', 'name', null, 'For a placed object: which definition it came from.', 'place a rose at 620 900', 'ok'),
    ],
  },
  {
    id: 'outline', title: 'Outline', path: 'doc.layers.<name>.shapes[]',
    does: 'One closed or open outline inside a shape.',
    props: [
      P('pts', '[[x, y]]', null, 'The points, in pixels.', '(from the shape\'s size, at and turn)', 'internal'),
      P('closed', 'yes/no', true, 'Closed (an area) or open (a line).', '(from the shape)', 'internal'),
      P('paint', 'fill | stroke', 'fill', 'Solid, or drawn as a line.', 'Let there be a circle …, hollow 6', 'ok'),
      P('width', 'px', null, 'Line width when drawn as a line.', '…, hollow 6', 'ok'),
      P('dash', '[on, off] px', null, 'Dashes along a line.', 'dash the rule, 18 on 12 off', 'old'),
    ],
  },
  {
    id: 'text', title: 'Text', path: 'doc.layers.<name> (kind text)',
    does: 'Words set in a font. One style per thing.',
    props: [
      P('text', 'text', null, 'The words.', 'Write "Golden Hour" called title …', 'ok'),
      P('font', '{ family, weight, style }', 'Bodoni Moda 400', 'The font (see Fonts).', '… in Lilita One · in Jost bold italic', 'ok'),
      P('size', 'px', 48, 'Size of the letters.', '…, size 170 · Give the title a size of 170 · fit 780', 'ok'),
      P('at', '[x, y] px', 'centre', 'Where the words sit: their centre, or their left or right edge when aligned.', '…, at 540 720 · Move the title to …', 'ok'),
      P('track', 'px', 0, 'Extra space between letters.', '…, tracking 6 · Give the title a tracking of 6', 'ok'),
      P('lines', '[text]', null, 'Several lines, from \\n or from wrapping to a width.', '"Golden\\nHour" · …, 880 wide', 'ok'),
      P('leading', 'number', 1.15, 'Line spacing, as a multiple of the size.', '…, leading 0.92', 'ok'),
      P('align', 'left | center | right', 'center', 'Alignment of the lines.', '…, aligned left', 'ok'),
      P('curve', 'px', null, 'Sets the words on an arc of this radius (negative: the other way).', '…, curved 220', 'ok'),
      P('turn', 'degrees', 0, 'Tilts the words round their point.', '…, turned -6 · Make the title turned -6', 'ok'),
      P('box', '[x0, y0, x1, y1]', null, 'Where the words are, measured in the font; used for align, distribute and gradients.', '', 'internal'),
    ],
  },
  {
    id: 'signature', title: 'Signature', path: 'doc.layers.<name> (kind signature)',
    does: 'A handwritten signature fitted to a spot.',
    props: [
      P('text', 'text', null, 'The name.', 'sign "Marilyn" …', 'ok'),
      P('font', 'font', 'Herr Von Muellerhoff', 'A script font.', '… in Herr Von Muellerhoff', 'ok'),
      P('center', '[x, y] px', 'near the bottom', 'Where it sits.', '…, at 620 1478', 'ok'),
      P('max_width', 'px', 620, 'The widest it may be.', '…, 620 wide', 'ok'),
      P('size', 'px', 250, 'Its size.', '…, size 250', 'ok'),
      P('rotate_deg', 'degrees', -6, 'Its slant.', '…, tilted -6', 'ok'),
    ],
  },
  {
    id: 'area', title: 'Areas', path: 'step.area',
    does: 'Which part of a surface a look is applied to: things and zones combined, cut away, or limited.',
    props: [
      P('terms', '[term]', null, 'The things and zones that make the area, added together.', 'the title · the title and the badge · the rays', 'ok'),
      P('minus', '[term]', null, 'Things cut out of it.', 'Engrave the card except the window', 'partial', 'craft words take it; make and give do not yet'),
      P('within', '[term]', null, 'Only where it overlaps these.', 'Plate the vine within the window', 'partial', 'craft words take it; make and give do not yet'),
      P('term.ref', 'name', null, 'The thing or zone.', 'the <name>', 'ok'),
      P('term.mod', 'halo | grow', null, 'A ring round the thing, or the thing grown outward.', 'the outline of the frame by 6 · the vine grown by 5 · Give the title an outline …', 'partial', 'grown areas only in the older form'),
      P('term.r', 'px', null, 'How wide the ring, or how far grown.', '… by 6 · …, 8 wide', 'partial'),
    ],
  },
  {
    id: 'step', title: 'Looks and craft (every step)', path: 'doc.sides.<face>.steps[]',
    does: 'Everything applied to a surface, bottom to top. In a "Let there be" piece the compiler orders them per thing; in a "create" piece they follow the sentences.',
    props: [
      P('op', 'operation', null, 'What is done (the operations below).', '(from the word)', 'internal'),
      P('area', 'area', null, 'Where (see Areas).', 'the <thing>', 'ok'),
      P('material', 'material key', null, 'The material or colour used (see Materials).', 'Make the title gold / #10131f', 'ok'),
      P('params', 'object', {}, 'The operation\'s settings (below).', 'details after commas', 'ok'),
      P('kind', 'spray kind', null, 'For spray: which coat.', 'spray the card with gloss / candy / …', 'ok'),
      P('image', 'image', null, 'For print: the photo (see Images).', 'Print @photo.jpg in the photo', 'ok'),
      P('line', 'number', null, 'The source line.', '', 'internal'),
      P('span', '[from, to]', null, 'Where in the source.', '', 'internal'),
    ],
  },
  {
    id: 'image', title: 'Images', path: 'step.image',
    does: 'A photo or illustration printed into an area.',
    props: [
      P('asset', 'file key', null, 'Which file.', '@photo.jpg', 'ok'),
      P('zone', 'name', 'window', 'The zone it fills when no shape is named.', 'Print @photo.jpg in the window', 'ok'),
      P('rect', '[x, y, w, h] px', null, 'The box it fills: the shape it is printed in.', 'Print @photo.jpg in the portrait', 'ok'),
      P('focus', '[x, y] 0–1', [0.5, 0.5], 'Which point of the photo stays in view when it is cropped.', '…, focused at 0.5 0.2', 'ok'),
      P('filter', 'adjustments', null, 'Blur, brightness, contrast, saturation, hue, grayscale, sepia, invert.', '…, grayscale, contrast 1.2 · Make the photo grayscale', 'ok'),
      P('duotone', '[colour, colour]', null, 'Shadows take the first colour, highlights the second.', '…, duotone #1b1145 and #ff9a5a', 'ok'),
      P('on_foil', 'yes/no', false, 'Printed see-through onto metal.', 'Print @art.png in the window, on foil', 'ok'),
    ],
  },
  {
    id: 'object', title: 'Objects', path: 'doc.elements.<name>',
    does: 'A physical object: the card or canvas itself, or each card, paper or plate on a stage. Objects are what move in a video.',
    props: [
      P('kind', 'paper | card | piece | plate | sheet | sticker', null, 'What it is.', 'Let there be a card called ball …', 'ok'),
      P('body', 'stock', null, 'What it is made of: colour, metalness, roughness, thickness, paper fibres (see Stocks). "in #colour" tints the stock.', '…, of cardstock · …, of kraft, in #c9a27a', 'ok'),
      P('stock', 'stock name', null, 'The stock\'s name.', '…, of cardstock', 'ok'),
      P('size', '[w, h] px', null, 'Its size.', '…, 200 by 200 · Make the ball bigger', 'ok'),
      P('size_mm', '[w, h] mm', null, 'Its size in millimetres (placed cards).', '(from the placed card)', 'internal'),
      P('rect', '[x, y, w, h] px', null, 'Its own drawing rectangle.', '', 'internal'),
      P('at', '[x, y] px', 'centre', 'Where it is.', '…, at 200 300 · Move the ball to …', 'ok'),
      P('turn', 'degrees', 0, 'Its turn.', 'Make the ball turned 10', 'ok'),
      P('scale', 'number', 1, 'Its scale (placed cards).', 'place a card … from @ticket.gt, scale 0.6', 'ok'),
      P('order', 'number', null, 'Stacking: higher is in front.', 'bring the memo to the front · send the seal behind the memo', 'old'),
      P('outline', 'rect | circle', 'rect', 'Its shape.', '…, round', 'ok'),
      P('corners', 'px', 0, 'Corner radius.', '…, corners 40', 'ok'),
      P('thick_mm', 'mm', 'from the stock', 'Its thickness.', '…, 2 mm thick', 'partial', 'only when made'),
      P('up_mm', 'mm', 'from the stock', 'How far it lifts off the surface below (its shadow).', '…, up 3 mm', 'partial', 'only when made'),
      P('aged', '0–1', 0, 'Wear: yellowing, creases, dirt.', '…, aged 0.4', 'partial', 'only when made; no "make it aged"'),
      P('edge', '{ style: clean | torn | deckle | bevel, side }', 'from the stock', 'A torn, deckled or bevelled edge, on one side or all.', '…, torn top edge · deckled edges', 'partial', 'only when made; no "make the paper torn"'),
      P('held', 'yes/no', false, 'Held in a hand (the surface tilts with the light) rather than lying on the stage.', '', 'internal'),
      P('faces', '[faces]', null, 'Its faces: front and back.', '(a card has two; stage objects one)', 'partial', 'stage objects have one face; no word gives them a back'),
      P('card', 'document', null, 'A placed card brings its whole document with it.', 'place a card called ticket from @ticket.gt', 'ok'),
      P('file', 'file key', null, 'The placed card\'s source file.', '', 'internal'),
      P('line', 'number', null, 'The source line.', '', 'internal'),
    ],
  },
  {
    id: 'motion', title: 'Time: objects', path: 'doc.elements.<name> (moves, fades, loops, enter, exit, flips)',
    does: 'How objects change over a video. Every entry has a start (t0) and a length (dur) in seconds.',
    props: [
      P('moves[].to', '[x, y] px', null, 'Travels to a place.', 'Move the ball to 880 300 over 1.4 s · When …, move …', 'ok'),
      P('moves[].scale', 'number', null, 'Grows or shrinks to a scale.', 'Change the ball to 130% size for 0.3 s, then back', 'ok'),
      P('moves[].turn', 'degrees', null, 'Turns to an angle.', 'Change the tag to turned 20 over 1 s', 'ok'),
      P('moves[].ease', 'linear | ease-in | ease-out | overshoot | bounce | elastic', 'ease in and out', 'How the move speeds up and slows down.', '…, bouncing · elastic · overshooting · linear', 'ok'),
      P('moves[].t0 / dur', 'seconds', null, 'When it starts, how long it takes.', '…, at 0.5 s, over 1.4 s · When the ball arrives, …', 'ok'),
      P('fades[].to', '0 | 1', null, 'Fades out or in.', 'Change the banner to visible over 0.4 s · Make the title fade in', 'ok'),
      P('fades[].t0 / dur', 'seconds', null, 'When the fade starts, how long it takes.', '…, at 1 s, over 0.5 s · When the ball arrives, …', 'ok'),
      P('loops[].kind', 'float | pulse | sway | spin', null, 'Motion that keeps going.', 'Make the badge float, 14 high, every 3 s', 'ok'),
      P('loops[].amp', 'number', 'per kind', 'How much: pixels, scale or degrees.', '…, 14 high · by 0.04 · 8 degrees', 'ok'),
      P('loops[].period', 'seconds', 'per kind', 'How long one cycle takes.', '…, every 3 s', 'ok'),
      P('loops[].t0', 'seconds', 0, 'When it starts.', 'When the banner appears, make the banner pulse', 'ok'),
      P('enter', '{ t0, style, from }', null, 'How it arrives: sliding from a side, popping, rising, zooming, fading.', 'bring in the badge at 0.2 s, popping', 'old'),
      P('exit', '{ t0, to, style }', null, 'How it leaves: sliding to a side, shrinking, fading, sinking.', 'remove the banner at 4.3 s, shrinking', 'old'),
      P('flips[]', '{ t0, dur }', null, 'Turns over to show its back.', 'flip the ticket at 1.5 s, over 0.8 s', 'partial', 'only placed cards have a back to flip to'),
      P('slam', '(enter style)', null, 'Lands like a rubber stamp.', 'slam the stamp in at 7 s', 'old'),
    ],
  },
  {
    id: 'timeline', title: 'Time: the piece', path: 'doc.timeline',
    does: 'What happens over a video that is not an object moving.',
    props: [
      P('reveals.<thing>', '{ t0, dur, from }', null, 'A thing is drawn or written on over time, from a side or by fading.', 'reveal the price at 5 s, over 3 s, from the left', 'ok'),
      P('captions[]', '{ text, t0, dur, marks }', null, 'Captions that appear word by word; marked words take a colour.', 'caption "TEXT" at 2 s, for 3 s, "word" in #e94f37', 'ok'),
      P('captionStyle', '{ font, size, color, y, weight }', 'Jost 60', 'How captions look.', 'style the captions in Jost, size 62, #1d1b18, at 1560', 'ok'),
      P('camera[]', '{ t0, dur, to, zoom }', null, 'The camera moves and zooms.', 'glide the camera to 700 600, zoom 1.2, at 9 s, over 0.5 s', 'old'),
    ],
  },
  {
    id: 'material', title: 'Materials', path: 'doc.materials.<key>',
    does: 'What a look is made of. Defined once, used by many steps.',
    props: [
      P('type', 'metal | enamel | paint', null, 'Metal (plated, foiled), enamel (flat colour), or paint (mixed from pigments, sprayed).', 'Make the title gold / #10131f · mix a paint …', 'ok'),
      P('finish', 'metal finish | paint finish', null, 'For metal: which metal (see the list). For paint: gloss, satin, matte, metallic, pearl, candy.', 'Make the title mirror chrome · mix a paint called teal from …, gloss', 'ok'),
      P('polish', 'mirror | satin | brushed', null, 'How a metal is polished; part of the metal\'s name.', 'Make the title mirror gold', 'partial', 'only the polishes that have a named metal (mirror gold, mirror chrome …); no "satin" on its own'),
      P('holo and crystal finishes', 'finish', null, 'Holographic metals and foils (holo-gold, holo-silver …) and crystal.', 'Make the title holo gold', 'unrendered', 'the web renderer leaves them out and says so'),
      P('preview', '{ hi, lo }', null, 'Highlight and shadow colours of a metal, for flat previews.', '', 'internal'),
      P('hex', 'colour', null, 'An enamel or paint colour.', '#10131f · navy · Let navy be #1f3a5f', 'ok'),
      P('process', 'name', null, 'How an enamel is made (niello inlay and others).', 'inlay the vine with niello', 'ok'),
      P('name', 'text', null, 'A named enamel.', '', 'internal'),
      P('pigments', '[[pigment, parts]]', null, 'The pigments a paint was mixed from.', 'mix a paint called teal from 2 parts phthalo blue and 1 part titanium white', 'ok'),
    ],
  },
];

// The operations: what can be done to an area. Each is a step; its settings are its params.
const O = (op, does, say, status, params, note) => ({ op, does, say, status, params, ...(note ? { note } : {}) });
export const OPERATIONS = [
  O('enamel', 'A flat colour or gradient over an area. On a lit piece it is enamel; on a flat piece, plain colour.', 'Make the card #10131f · Make the card a gradient from … to …', 'ok', [
    P('gradient', '{ stops, angle, radial }', null, 'Two or more colours across the area\'s box, at an angle or from the middle.', 'a gradient from #a to #b, angled 80 · a radial gradient from …', 'ok'),
    P('opacity', '0–1', 1, 'How solid.', '…, 40% see-through · Give the leaf an opacity of 85%', 'ok'),
    P('blend', 'blend mode', 'normal', 'How it mixes with what is under it (multiply, screen, overlay, darken, lighten, soft-light, hard-light, difference, color-dodge, color-burn, exclusion, hue, saturation, color, luminosity).', '…, multiply', 'partial', 'exclusion, hue, saturation, color and luminosity only in the older form'),
    P('feather', 'px', 0, 'Soft edges.', '…, feathered 6', 'ok'),
  ]),
  O('plate', 'Electroplates a metal onto an area (lit pieces).', 'Make the title gold', 'ok', []),
  O('foil', 'Hot-foils a metal or holographic foil, slightly raised.', 'foil the title with gold', 'ok', [
    P('emboss', 'number', 0.5, 'How far the foil is raised.', 'foil …, raised 0.8', 'ok'),
  ], 'holographic foils are not drawn by the web renderer'),
  O('inlay', 'Engraves and fills with enamel in one go.', 'inlay the vine with niello', 'ok', []),
  O('engrave', 'Cuts into the surface.', 'Engrave the vine, 0.06 mm deep', 'ok', [
    P('depth_mm', 'mm', 0.04, 'How deep.', '…, 0.06 mm deep', 'ok', 'a bare "0.06 mm" is ignored without a word'),
  ]),
  O('emboss', 'Raises an area.', 'Emboss the title, 0.3 mm high', 'ok', [
    P('height_mm', 'mm', 0.12, 'How high.', '…, 0.3 mm high', 'ok', 'a bare "0.3 mm" is ignored without a word'),
    P('soft', '0–1', 0.9, 'How rounded the raised edge is (lower is softer).', '…, soft 0.7 · softly', 'ok'),
  ]),
  O('deboss', 'Presses an area down.', 'Deboss the logo, 0.05 mm deep', 'ok', [
    P('depth_mm', 'mm', 0.04, 'How deep.', '…, 0.05 mm deep', 'ok'),
  ]),
  O('etch', 'Frosts or matte-etches an area.', 'etch the pattern', 'ok', []),
  O('print', 'Prints a photo or illustration into an area (see Images).', 'Print @photo.jpg in the photo', 'ok', [
    P('opacity', '0–1', 1, 'How solid.', '…, 70% opacity', 'ok'),
    P('blend', 'blend mode', 'normal', 'How it mixes.', '…, multiply', 'ok'),
    P('feather', 'px', 0, 'Soft edges.', '…, feathered 12', 'ok'),
  ]),
  O('illustrate', 'Cloisonné: turns an illustration into flat enamel cells with metal wires.', 'illustrate @art.png in the window', 'ok', [
    P('opacity', '0–1', 1, 'How solid.', '', 'none', 'the renderer reads it (shared with print); illustrate does not take it'),
    P('blend', 'blend mode', 'normal', 'How it mixes.', '', 'none', 'as above'),
    P('feather', 'px', 0, 'Soft edges.', '', 'none', 'as above'),
  ]),
  O('spray', 'Sprays a coat. Kinds: paint (mixed, with real spray physics), gloss, candy, glitter, metalflake, pearl, chameleon, matte.', 'spray the window with gloss, 30 µm thick · spray the card with teal, …', 'ok', [
    P('chameleon', 'kind', null, 'A colour-shifting coat.', 'spray the card with chameleon', 'unrendered', 'the web renderer leaves it out and says so'),
    P('t0 / dur', 'seconds', null, 'When the spraying happens in a video.', '…, at 1.6 s, for 1.4 s', 'ok'),
    P('passes', 'number', 1, 'How many passes of the can.', '…, passes 3', 'ok'),
    P('sweep', 'horizontal | vertical | from a corner', 'horizontal', 'How the can moves across.', '…, top to bottom · from the top left', 'ok'),
    P('away_cm', 'cm', 20, 'How far the can is held from the surface.', '…, away 30 cm', 'ok'),
    P('nozzle', 'fine | medium | coarse', 'medium', 'The nozzle.', '…, fine nozzle · coarse spatter', 'ok'),
    P('pressure', 'number', 1, 'How hard the can is pressed.', '…, pressure 0.8', 'ok'),
    P('soft', 'yes/no', false, 'A soft spray edge.', '…, soft', 'ok'),
    P('drips', 'yes/no', false, 'Whether heavy paint drips.', '…, drips', 'ok'),
    P('wet', 'yes/no', false, 'A wet coat.', '…, wet', 'ok'),
    P('thickness_um', 'µm', null, 'Coat thickness.', '…, 30 µm thick', 'ok'),
    P('color', 'colours', null, 'Tint of a glitter or pearl coat.', '… in pale gold and deep gold', 'ok'),
    P('density', '0–1', null, 'How many glitter flakes.', '…, density 0.7', 'ok'),
    P('flake_um', 'µm', null, 'Glitter flake size.', '…, flakes 110 µm', 'ok'),
    P('overspray_px', 'px', null, 'How far glitter spills past the area.', '', 'ok'),
    P('opacity', '0–1', null, 'How solid a pearl coat is.', '', 'ok'),
  ], 'the chameleon coat is not drawn by the web renderer'),
  O('shadow', 'A soft drop shadow under an area.', 'Give the title a shadow, 10 down, blur 14', 'ok', [
    P('dx / dy', 'px', [0, 10], 'Offset.', '…, 10 down, 6 right', 'ok'),
    P('blur', 'px', 18, 'Softness.', '…, blur 14', 'ok'),
    P('color', 'colour', '#000000', 'Colour.', '…, in #2a0a3a', 'ok'),
    P('opacity', '0–1', 0.45, 'Strength.', '…, 60% opacity', 'ok'),
  ]),
  O('inshadow', 'An inner shadow: the area looks cut in.', 'Give the panel an inner shadow, 6 down, blur 10', 'ok', [
    P('dx / dy', 'px', [0, 10], 'Offset.', '…, 6 down', 'ok'),
    P('blur', 'px', 18, 'Softness.', '…, blur 10', 'ok'),
    P('color', 'colour', '#000000', 'Colour.', '…, in #000000', 'ok'),
    P('opacity', '0–1', 0.45, 'Strength.', '…, 45% opacity', 'ok'),
  ]),
  O('glow', 'Light round an area.', 'Make the sun glow in #ffd98a, 90 wide', 'ok', [
    P('color', 'colour', '#ffffff', 'Colour.', '… in #ffd98a', 'ok'),
    P('blur', 'px', 30, 'Width.', '…, 90 wide · Give the glow a width of 90', 'ok'),
    P('strength', '1–4', 1, 'How strong.', '…, strength 2', 'ok'),
    P('opacity', '0–1', 1, 'How solid.', '…, 50% opacity', 'ok'),
    P('blend', 'blend mode', 'screen', 'How it mixes.', '…, overlay', 'ok'),
  ]),
  O('adjust', 'An adjustment layer: changes what is already painted under an area (frosted glass, grayscale, …).', 'Make the glass frosted · Make the photo grayscale', 'ok', [
    P('filter', 'adjustments', null, 'Blur, brightness, contrast, saturation, hue, grayscale, sepia, invert.', 'frosted · blurred 6 · 20% brighter · vivid · muted · contrasty · grayscale · sepia · inverted', 'partial', 'hue only in the older form ("adjust …, hue 40")'),
    P('opacity', '0–1', 1, 'How strongly.', 'adjust …, 50% opacity', 'old'),
    P('blend', 'blend mode', 'normal', 'How it mixes.', 'adjust …, multiply', 'old'),
  ]),
  O('vignette', 'Darkens or tints the edges of an area.', 'Give the card a vignette of 0.35, in #1f3a5f', 'ok', [
    P('amount', '0–1', 0.5, 'How strong.', '… of 0.35', 'ok'),
    P('color', 'colour', '#000000', 'Colour.', '…, in #1f3a5f', 'ok'),
  ]),
  O('grain', 'Film grain over an area.', 'Make the card grainy, 0.2', 'ok', [
    P('amount', '0–1', 0.25, 'How strong.', '…, 0.2', 'ok'),
    P('size', '1 | 2', 1, 'Grain size.', 'grain the card, 0.2, coarse', 'old'),
  ]),
];

// What the renderer is, and what each engine makes.
export const ENGINES_NOTE = 'Engines read the document, never the source. "web" is the one renderer the app uses (WebGL2 in the browser, live light); "svg" exports flat vectors; the others are kept for older pipelines.';

// The app's HTTP API (Studio Morgana). Paths are under /api; admin paths under /api/admin.
const R = (method, path, does, who = 'anyone') => ({ method, path, does, who });
export const HTTP = [
  R('GET', '/me', 'Who is signed in (or the visitor), and the AI mode.'),
  R('POST', '/auth/signup', 'Make an account; sends a confirmation email.'),
  R('POST', '/auth/verify', 'Confirm an email address.'),
  R('POST', '/auth/login', 'Sign in.'),
  R('POST', '/auth/logout', 'Sign out.'),
  R('POST', '/auth/forgot', 'Send a password reset email.'),
  R('POST', '/auth/reset', 'Set a new password.'),
  R('GET', '/wall', 'The wall: featured and showcase pieces, then your own; by type, paged.'),
  R('POST', '/generate', 'Make new pieces from a prompt (and reference images or pieces).'),
  R('POST', '/uploads', 'Upload a reference image.'),
  R('GET', '/pieces/:id', 'A piece, its versions and files (owner or public).'),
  R('POST', '/pieces/:id/command', 'Change a piece with a sentence ("make p1 crimson"): a new version.', 'owner (others get a remix)'),
  R('POST', '/pieces/:id/versions', 'Save a hand-edited source as a new version.', 'owner (others get a remix)'),
  R('POST', '/pieces/:id/repair', 'Ask the model to fix a source that does not compile.', 'owner'),
  R('POST', '/pieces/:id/commit', 'Mark a version rendered, after its outputs are uploaded.', 'owner'),
  R('PUT', '/versions/:vid/outputs/:name', 'Upload a rendered output (poster, image, video).', 'owner'),
  R('POST', '/pieces/:id/visibility', 'Make a piece public or private.', 'owner, signed in'),
  R('DELETE', '/pieces/:id', 'Delete a piece.', 'owner'),
  R('POST', '/pieces/:id/restore', 'Undo a delete.', 'owner'),
  R('GET', '/projects', 'Your projects.'),
  R('POST', '/projects', 'Make a project (optionally with a piece pinned).'),
  R('PATCH', '/projects/:id', 'Rename a project.', 'owner'),
  R('DELETE', '/projects/:id', 'Delete a project.', 'owner'),
  R('POST', '/projects/:id/restore', 'Undo a project delete.', 'owner'),
  R('GET', '/projects/:id/wall', 'A project\'s pinned pieces.', 'owner'),
  R('PUT', '/projects/:id/pins/:piece', 'Pin a piece to a project.', 'owner'),
  R('DELETE', '/projects/:id/pins/:piece', 'Unpin a piece.', 'owner'),
  R('GET', '/admin/collections/:slug', 'A collection (featured, showcase).', 'admin'),
  R('PUT', '/admin/collections/:slug', 'Set a collection; featured pieces become public.', 'admin'),
  R('POST', '/admin/pieces', 'Make a piece from a source directly.', 'admin'),
  R('GET', '/admin/drafts', 'Pieces still being rendered.', 'admin'),
  R('POST', '/admin/jobs/run', 'Run the scheduled jobs now (showcase, housekeeping).', 'admin'),
  R('GET', '/admin/jobs', 'When the jobs last ran.', 'admin'),
  R('GET', '/files/*', 'A stored file (posters, outputs, uploads); not under /api.'),
];

// Property keys the catalogue covers, flattened, for the completeness check in test/run.js.
export function catalogued() {
  const keys = new Set();
  const each = (key) => { const ks = key.replace(/\[\]/g, '').split(/\s*\/\s*/), pre = ks[0].includes('.') ? ks[0].slice(0, ks[0].lastIndexOf('.') + 1) : ''; return ks.map((k, i) => i && !k.includes('.') ? pre + k : k); };
  for (const part of PARTS) for (const p of part.props) for (const k of each(p.key)) keys.add(`${part.id}.${k}`);
  for (const o of OPERATIONS) { keys.add(`op.${o.op}`); for (const p of o.params) for (const k of each(p.key)) keys.add(`op.${o.op}.${k}`); }
  return keys;
}
