// Icons from Phosphor, drawn in currentColor. Decorative unless their button gives a label.
// Navigation uses the duotone weight; small actions use bold so they hold up at 14–16px.
import { memo, type ComponentType } from 'react';
import {
  ArrowCounterClockwise, ArrowLeft as PArrowLeft, Check as PCheck, FolderSimple, PushPin, ArrowUp as PArrowUp, BoundingBox, DownloadSimple, ImageSquare,
  List, MoonStars, Pause as PPause, PencilSimpleLine, Play as PPlay, Plus as PPlus, ShootingStar, Sparkle as PSparkle,
  SquaresFour, SunDim, TrashSimple, UserCircle, X as PX, type IconProps, type IconWeight,
} from '@phosphor-icons/react';

const I = (C: ComponentType<IconProps>, weight: IconWeight = 'regular') =>
  memo(({ size = 20, w }: { size?: number; w?: IconWeight }) => <C size={size} weight={w ?? weight} aria-hidden="true" />);

export const Sparkle = I(PSparkle, 'fill');
export const ImageIcon = I(ImageSquare, 'duotone');
export const Plus = I(PPlus, 'bold');
export const X = I(PX, 'bold');
export const Trash = I(TrashSimple, 'duotone');
export const Pencil = I(PencilSimpleLine, 'duotone');
export const Menu = I(List, 'bold');
export const Sun = I(SunDim, 'duotone');
export const Moon = I(MoonStars, 'duotone');
export const ArrowUp = I(PArrowUp, 'bold');
export const ArrowLeft = I(PArrowLeft, 'bold');
export const Play = I(PPlay, 'fill');
export const Pause = I(PPause, 'fill');
export const Download = I(DownloadSimple, 'bold');
export const Pins = I(BoundingBox, 'duotone');
export const Undo = I(ArrowCounterClockwise, 'bold');
export const Grid = I(SquaresFour, 'duotone');
export const Mine = I(ShootingStar, 'duotone');
export const User = I(UserCircle, 'duotone');
export const Send = I(PArrowUp, 'bold');
export const Folder = I(FolderSimple, 'duotone');
export const Pin = I(PushPin, 'duotone');
export const Check = I(PCheck, 'bold');
