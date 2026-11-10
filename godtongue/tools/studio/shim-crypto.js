import shajs from 'sha.js';
export const createHash = (alg) => shajs(alg);
export default { createHash };
