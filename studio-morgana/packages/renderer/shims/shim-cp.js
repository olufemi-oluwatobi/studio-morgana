export const spawn = () => { throw new Error('not available in the browser'); };
// "cut out" runs the matting tool at build time; in the browser a cut-out comes from the library instead
export const execFileSync = () => { throw new Error('cut out runs when a piece is built on the server; in the studio, use a cut-out from the library'); };
export default { spawn, execFileSync };
