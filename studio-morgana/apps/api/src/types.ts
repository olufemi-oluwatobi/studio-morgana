// Piece types: what a piece is as media, which decides how it is shown, previewed and exported.
// The browser decides the type when it renders (a source with a timeline is a video) and sends it on commit.
// New types (slides next) start here and in apps/web/src/lib/types.ts.
export const PIECE_TYPES = {
  image: { outputs: ['poster-480', 'poster-1200'] },
  video: { outputs: ['poster-480', 'poster-1200', 'video'] },
} as const;
export type PieceType = keyof typeof PIECE_TYPES;
export const isPieceType = (t: unknown): t is PieceType => typeof t === 'string' && Object.hasOwn(PIECE_TYPES, t);
