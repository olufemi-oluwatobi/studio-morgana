// Capture one frame of a built web page: node web/frames.cjs <index.html> <out.png> [side | t=<seconds>]
// Cards: the named side, lit at a fixed tilt. Stages and videos: the exact frame at time t. Engine: web/capture.cjs.
const fs = require('fs');
const { frame } = require('./capture.cjs');

(async () => {
  const [html, out, arg = ''] = process.argv.slice(2);
  if (!html || !out) { console.error('usage: node web/frames.cjs <index.html> <out.png> [side | t=<seconds>]'); process.exit(2); }
  const t = (arg.match(/^t=(.*)$/) || [])[1];
  const png = await frame(html, t != null ? { t: parseFloat(t) } : { side: arg || undefined });
  fs.writeFileSync(out, png);
  console.log(`wrote ${out}`);
})().catch(e => { console.error(e.message); process.exit(1); });
