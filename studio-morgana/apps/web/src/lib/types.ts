// Piece types: what a piece is as media. The wall's tabs, the editor's viewer and its exports all come from here.
// To add one (slides next): add it here and in apps/api/src/types.ts, and give it a viewer.
export type PieceType = 'image' | 'video';
export interface TypeInfo {
  id: PieceType | 'slides';
  label: string;               // the tab
  viewer: 'image' | 'player' | null;
  exports: ('png' | 'mp4' | 'gt')[];
  soon?: boolean;              // shown as coming, not yet made
}
export const PIECE_TYPES: TypeInfo[] = [
  { id: 'image', label: 'Images', viewer: 'image', exports: ['png', 'gt'] },
  { id: 'video', label: 'Videos', viewer: 'player', exports: ['png', 'mp4', 'gt'] },
  { id: 'slides', label: 'Slides', viewer: null, exports: [], soon: true },
];
export const typeInfo = (t: string | null | undefined) => PIECE_TYPES.find((x) => x.id === t) ?? PIECE_TYPES[0];
// a rendered source's type: anything with a timeline is a video
export const typeOfCompiled = (c: { video: unknown }): PieceType => (c.video ? 'video' : 'image');
