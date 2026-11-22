/**
 * The keyboard's two jobs on the plate: the left and right arrows turn the
 * selection, the up and down arrows grow or shrink it. Both are absolute steps
 * on the element's own degrees and its own base size, so holding a key down
 * dials a value in rather than compounding a mistake.
 */
import { sf, type ShutterFrameSpec } from '../spec/shutterframe';
import type { Selection } from './selection';

type Target = Exclude<Selection, null>;

const MIN = { cell: 16, text: 4, sticker: 4, emblem: 8 } as const;

/** One key press in degrees, and one in the plate's own hundredths. */
export const TURN_STEP = 1;
export const TURN_STEP_LARGE = 5;
export const SCALE_STEP = 0.02;
export const SCALE_STEP_LARGE = 0.1;

/** -180 < degrees ≤ 180, so a turned cell never reads 361°. */
export function wrapAngle(deg: number): number {
  let value = deg % 360;
  if (value > 180) value -= 360;
  if (value <= -180) value += 360;
  return Math.round(value * 10) / 10;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * `delta` degrees onto whatever is selected: a cell, a text row, a sticker or
 * the emblem. The overlay is not a layer and never turns.
 */
export function turnSelection(spec: ShutterFrameSpec, target: Target, delta: number): ShutterFrameSpec {
  const next = sf().clone(spec);
  if (target.kind === 'cell') {
    const cell = next.cells[target.index];
    if (!cell) return spec;
    cell.rotation = wrapAngle((cell.rotation ?? 0) + delta);
  } else if (target.kind === 'text') {
    const item = next.texts.find((row) => row.id === target.id);
    if (!item) return spec;
    item.rotation = wrapAngle((item.rotation ?? 0) + delta);
  } else if (target.kind === 'sticker') {
    const item = (next.stickers ?? []).find((row) => row.id === target.id);
    if (!item) return spec;
    item.rotation = wrapAngle((item.rotation ?? 0) + delta);
  } else if (target.kind === 'emblem') {
    next.emblem.rotation = wrapAngle((next.emblem.rotation ?? 0) + delta);
  } else {
    return spec;
  }
  return sf().touch(next, {});
}

/**
 * Grows or shrinks around the element's own centre, so a photograph stays where
 * the frame puts it while its window opens up. A text row grows its type size
 * (the row's anchor is the baseline); the emblem grows its maximum box.
 */
export function scaleSelection(spec: ShutterFrameSpec, target: Target, factor: number): ShutterFrameSpec {
  if (!(factor > 0) || factor === 1) return spec;
  const next = sf().clone(spec);
  if (target.kind === 'cell') {
    const cell = next.cells[target.index];
    if (!cell) return spec;
    const cx = cell.x + cell.w / 2;
    const cy = cell.y + cell.h / 2;
    const w = Math.max(MIN.cell, cell.w * factor);
    const h = Math.max(MIN.cell, cell.h * factor);
    cell.w = Math.round(w);
    cell.h = Math.round(h);
    cell.x = Math.round(cx - cell.w / 2);
    cell.y = Math.round(cy - cell.h / 2);
  } else if (target.kind === 'text') {
    const item = next.texts.find((row) => row.id === target.id);
    if (!item) return spec;
    item.size = Math.min(400, Math.max(MIN.text, round(item.size * factor)));
  } else if (target.kind === 'sticker') {
    const item = (next.stickers ?? []).find((row) => row.id === target.id);
    if (!item) return spec;
    const cx = item.x + item.w / 2;
    const cy = item.y + item.h / 2;
    const w = Math.max(MIN.sticker, item.w * factor);
    const h = Math.max(MIN.sticker, item.h * factor);
    item.w = Math.round(w);
    item.h = Math.round(h);
    item.x = Math.round(cx - item.w / 2);
    item.y = Math.round(cy - item.h / 2);
  } else if (target.kind === 'emblem') {
    next.emblem.maxW = Math.min(4000, Math.max(MIN.emblem, round(next.emblem.maxW * factor)));
    next.emblem.maxH = Math.min(4000, Math.max(MIN.emblem, round(next.emblem.maxH * factor)));
  } else {
    return spec;
  }
  return sf().touch(next, {});
}

/** What one arrow key asks for, read off the event. */
export function arrowIntent(
  key: string,
  shiftKey: boolean,
): { kind: 'turn'; delta: number } | { kind: 'scale'; factor: number } | null {
  if (key === 'ArrowLeft') return { kind: 'turn', delta: -(shiftKey ? TURN_STEP_LARGE : TURN_STEP) };
  if (key === 'ArrowRight') return { kind: 'turn', delta: shiftKey ? TURN_STEP_LARGE : TURN_STEP };
  if (key === 'ArrowUp') return { kind: 'scale', factor: 1 + (shiftKey ? SCALE_STEP_LARGE : SCALE_STEP) };
  if (key === 'ArrowDown') return { kind: 'scale', factor: 1 - (shiftKey ? SCALE_STEP_LARGE : SCALE_STEP) };
  return null;
}

/** True when the caret is somewhere a typed arrow belongs to a field. */
export function typingInField(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node || !node.tagName) return false;
  return node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' || node.isContentEditable === true;
}
