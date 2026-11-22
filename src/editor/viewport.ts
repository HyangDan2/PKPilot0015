import type { Point } from './geometry';

/**
 * The plate's own viewport: a stage that can be zoomed from 20% to 400% and
 * moved freely in X and Y. Everything here is pure maths on screen pixels and
 * design units, so the canvas, the hit tests and the tests share one answer.
 */

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 4;
/** How many screen pixels of the plate must stay reachable at any pan. */
export const KEEP_VISIBLE = 44;

export interface Pan { x: number; y: number }
export interface Size { w: number; h: number }
export interface Insets { top: number; right: number; bottom: number; left: number }
/** What the studio shows: a zoom level ('fit' or a number) and where it sits. */
export interface View { zoom: number | 'fit'; pan: Pan }

export const NO_PAN: Pan = { x: 0, y: 0 };

export function clampZoom(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

/**
 * The floating dock's footprint at this width. `fit` gives the chrome room so
 * the frame opens in the clear; the user's own pan and zoom ignore it, which is
 * why the canvas itself now covers the whole stage.
 */
export function fitInsets(stageW: number): Insets {
  return stageW < 1024
    ? { top: 60, right: 16, bottom: 116, left: 16 }
    : { top: 52, right: 124, bottom: 88, left: 124 };
}

/** The part of the stage the chrome leaves to the plate. */
function padded(stage: Size, insets: Insets): Size {
  return {
    w: Math.max(1, stage.w - insets.left - insets.right),
    h: Math.max(1, stage.h - insets.top - insets.bottom),
  };
}

/** The largest scale that still leaves the floating controls in the clear. */
export function fitScale(stage: Size, design: Size, insets: Insets): number {
  const area = padded(stage, insets);
  const s = Math.min(area.w / Math.max(1, design.w), area.h / Math.max(1, design.h));
  return Math.max(0.05, s);
}

export function resolveScale(zoom: number | 'fit', stage: Size, design: Size, insets: Insets): number {
  return zoom === 'fit' ? fitScale(stage, design, insets) : clampZoom(zoom);
}

/** Where design (0, 0) lands on the stage, in stage pixels. */
export function originOf(scale: number, pan: Pan, stage: Size, design: Size, insets: Insets): Point {
  const area = padded(stage, insets);
  return {
    x: insets.left + (area.w - design.w * scale) / 2 + pan.x,
    y: insets.top + (area.h - design.h * scale) / 2 + pan.y,
  };
}

/** A stage-local pixel as a design coordinate. */
export function toDesignPoint(local: Point, scale: number, pan: Pan, stage: Size, design: Size, insets: Insets): Point {
  const origin = originOf(scale, pan, stage, design, insets);
  return { x: (local.x - origin.x) / scale, y: (local.y - origin.y) / scale };
}

/** The pan that puts `anchor` (a design point) under `local` at `scale`. */
export function panForAnchor(anchor: Point, local: Point, scale: number, stage: Size, design: Size, insets: Insets): Pan {
  const base = originOf(scale, NO_PAN, stage, design, insets);
  return { x: local.x - anchor.x * scale - base.x, y: local.y - anchor.y * scale - base.y };
}

/**
 * A hand that drags too far cannot lose the frame: at least `keep` pixels of
 * each axis stay on the stage.
 */
export function clampPan(pan: Pan, scale: number, stage: Size, design: Size, insets: Insets, keep = KEEP_VISIBLE): Pan {
  const base = originOf(scale, NO_PAN, stage, design, insets);
  const one = (value: number, origin: number, span: number, room: number) => {
    const lo = keep - origin - span;
    const hi = room - keep - origin;
    if (lo > hi) return (lo + hi) / 2;
    return Math.min(hi, Math.max(lo, value));
  };
  return {
    x: one(pan.x, base.x, design.w * scale, stage.w),
    y: one(pan.y, base.y, design.h * scale, stage.h),
  };
}

/**
 * Wheel or trackpad pinch: the design point under the cursor does not move,
 * whatever the zoom becomes.
 */
export function zoomAround(
  zoom: number | 'fit',
  pan: Pan,
  local: Point,
  factor: number,
  stage: Size,
  design: Size,
  insets: Insets,
): View {
  const scale = resolveScale(zoom, stage, design, insets);
  const anchor = toDesignPoint(local, scale, pan, stage, design, insets);
  const next = clampZoom(scale * factor);
  const moved = panForAnchor(anchor, local, next, stage, design, insets);
  return { zoom: next, pan: clampPan(moved, next, stage, design, insets) };
}

/**
 * Two fingers on the stage: the point they landed on rides the point they are
 * on now, so the pinch zooms and moves in X/Y at the same time.
 */
export function pinchAround(
  anchor: Point,
  baseScale: number,
  ratio: number,
  mid: Point,
  stage: Size,
  design: Size,
  insets: Insets,
): View {
  const next = clampZoom(baseScale * ratio);
  const moved = panForAnchor(anchor, mid, next, stage, design, insets);
  return { zoom: next, pan: clampPan(moved, next, stage, design, insets) };
}

/** The `−` / `+` buttons: a step that keeps the readout on a round number. */
export function stepZoom(scale: number, dir: 1 | -1): number {
  const factor = dir > 0 ? 1.25 : 0.8;
  return clampZoom(Math.round(clampZoom(scale) * factor * 20) / 20);
}
