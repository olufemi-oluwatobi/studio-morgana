// Stroke icons, drawn in currentColor. Decorative unless given a label by their button.
import { memo, type ReactNode } from 'react';

const I = (d: ReactNode, fill = false) => memo(({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'}
    strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
));

export const Sparkle = I(<path d="M12 2.5c.6 5.5 2.9 7.8 8.5 8.5-5.6.7-7.9 3-8.5 8.5-.6-5.5-2.9-7.8-8.5-8.5 5.6-.7 7.9-3 8.5-8.5Z" />, true);
export const ImageIcon = I(<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m4 18 5-4.5 3.5 3 3-2.5 4.5 4" /></>);
export const Plus = I(<path d="M12 5v14M5 12h14" />);
export const X = I(<path d="m6 6 12 12M18 6 6 18" />);
export const Trash = I(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />);
export const Pencil = I(<path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />);
export const Menu = I(<path d="M4 7h16M4 12h16M4 17h16" />);
export const Sun = I(<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>);
export const Moon = I(<path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.7 6.7 0 0 0 10.7 10.7Z" />);
export const ArrowUp = I(<path d="M12 19V5M6 11l6-6 6 6" />);
export const ArrowLeft = I(<path d="M19 12H5M11 6l-6 6 6 6" />);
export const Play = I(<path d="M7 4.5v15l12-7.5-12-7.5Z" />, true);
export const Pause = I(<><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>, true);
export const Download = I(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />);
export const Pins = I(<><circle cx="7" cy="8" r="2.5" /><circle cx="16" cy="7" r="2.5" /><circle cx="12" cy="16.5" r="2.5" /></>);
export const Undo = I(<path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2" />);
export const Grid = I(<><rect x="4" y="4" width="7" height="9" rx="1.5" /><rect x="13" y="4" width="7" height="6" rx="1.5" /><rect x="4" y="15" width="7" height="5" rx="1.5" /><rect x="13" y="12" width="7" height="8" rx="1.5" /></>);
export const User = I(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1-4 4-6 7-6s6 2 7 6" /></>);
export const Send = I(<path d="M5 12h13M13 6l6 6-6 6" />);
