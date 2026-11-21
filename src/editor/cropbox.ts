/**
 * Geometry for the background crop box.
 *
 * The modal shows the whole photograph, contained in the modal viewport, and
 * lays a frame-shaped window over it. Every number here is a CSS pixel in that
 * drawn-photograph space (`drawn`), so `toSourceRect` is the one place that
 * turns a marked area back into pixels of the original file.
 */

export interface CropRect { x: number; y: number; w: number; h: number }
export interface Area { w: number; h: number }
export type CropCorner = 'nw' | 'ne' | 'sw' | 'se';

export const CROP_CORNERS: readonly CropCorner[] = ['nw', 'ne', 'sw', 'se'];

/** The smallest crop a finger can still grab, in drawn pixels. */
export const MIN_CROP = 44;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** width ÷ height of the frame the photograph will fill. */
export function frameRatio(frameW: number, frameH: number): number {
  return frameW > 0 && frameH > 0 ? frameW / frameH : 1;
}

/** Where a whole photograph sits when it is contained in `area`. */
export function containBox(natural: Area, area: Area): Area {
  if (!natural.w || !natural.h || !area.w || !area.h) return { w: 0, h: 0 };
  const k = Math.min(area.w / natural.w, area.h / natural.h);
  return { w: natural.w * k, h: natural.h * k };
}

/**
 * The window is height-first: its height is the photograph's height, and its
 * width follows the frame ratio — clamped to the photograph's width when that
 * ratio would run past the sides.
 */
export function fitHeight(area: Area, ratio: number): CropRect {
  let h = area.h;
  let w = h * ratio;
  if (w > area.w) {
    w = area.w;
    h = w / ratio;
  }
  return { x: (area.w - w) / 2, y: (area.h - h) / 2, w, h };
}

/** The same, width-first: the width is the photograph's width, height clamped. */
export function fitWidth(area: Area, ratio: number): CropRect {
  let w = area.w;
  let h = w / ratio;
  if (h > area.h) {
    h = area.h;
    w = h * ratio;
  }
  return { x: (area.w - w) / 2, y: (area.h - h) / 2, w, h };
}

/** Keeps the window's size and puts its middle on the photograph's middle. */
export function centerCrop(rect: CropRect, area: Area): CropRect {
  const w = Math.min(rect.w, area.w);
  const h = Math.min(rect.h, area.h);
  return { x: (area.w - w) / 2, y: (area.h - h) / 2, w, h };
}

/** Moves the window by a total offset from where the drag began, kept inside. */
export function moveCrop(rect: CropRect, dx: number, dy: number, area: Area): CropRect {
  return {
    x: clamp(rect.x + dx, 0, Math.max(0, area.w - rect.w)),
    y: clamp(rect.y + dy, 0, Math.max(0, area.h - rect.h)),
    w: rect.w,
    h: rect.h,
  };
}

/**
 * Resizes from one corner with the opposite corner held still. The frame ratio
 * never changes, and the window can never leave the photograph.
 */
export function resizeCrop(
  rect: CropRect,
  corner: CropCorner,
  dx: number,
  dy: number,
  area: Area,
  ratio: number,
): CropRect {
  const east = corner === 'ne' || corner === 'se';
  const south = corner === 'se' || corner === 'sw';
  const anchorX = east ? rect.x : rect.x + rect.w;
  const anchorY = south ? rect.y : rect.y + rect.h;

  /* the finger may go sideways or up-and-down; whichever it did more of wins */
  const dwX = (east ? dx : -dx);
  const dwY = (south ? dy : -dy) / ratio;
  const dw = Math.abs(dwX) >= Math.abs(dwY) ? dwX : dwY;

  const roomW = east ? area.w - anchorX : anchorX;
  const roomH = south ? area.h - anchorY : anchorY;
  const maxW = Math.max(1, Math.min(roomW, roomH * ratio));
  const minW = Math.min(MIN_CROP, maxW);
  const w = clamp(rect.w + dw, minW, maxW);
  const h = w / ratio;

  return {
    x: clamp(east ? anchorX : anchorX - w, 0, Math.max(0, area.w - w)),
    y: clamp(south ? anchorY : anchorY - h, 0, Math.max(0, area.h - h)),
    w,
    h,
  };
}

/** Drawn-photograph pixels back to the original file's pixels. */
export function toSourceRect(rect: CropRect, drawn: Area, natural: Area): CropRect {
  const kx = natural.w / Math.max(1, drawn.w);
  const ky = natural.h / Math.max(1, drawn.h);
  const x = clamp(rect.x * kx, 0, Math.max(0, natural.w - 1));
  const y = clamp(rect.y * ky, 0, Math.max(0, natural.h - 1));
  return {
    x,
    y,
    w: clamp(rect.w * kx, 1, natural.w - x),
    h: clamp(rect.h * ky, 1, natural.h - y),
  };
}
