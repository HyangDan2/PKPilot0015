import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as LZString from 'lz-string';
import { arrowIntent, scaleSelection, turnSelection, typingInField, wrapAngle } from '../src/editor/nudge';

/**
 * The arrow keys are a second pair of hands on the plate: they must turn and
 * size whatever is selected — a cut, a line of text, a sticker, the logo —
 * and leave the document untouched when nothing is selected.
 */

let SF: any;

beforeAll(() => {
  (globalThis as any).LZString = LZString;
  const code = readFileSync(resolve(process.cwd(), 'public/shutterframe.js'), 'utf8');
  new Function(code)();
  SF = (globalThis as any).ShutterFrame;
  if (!(globalThis as any).window) (globalThis as any).window = globalThis;
  (globalThis as any).window.ShutterFrame = SF;
});

const spec = () => SF.validate({
  schema: 'shutterframe/v1',
  id: 'frame-keys',
  name: 'Key Strip',
  updatedAt: '2026-11-22T00:00:00.000Z',
  canvas: { width: 600, height: 1800, background: '#f4f1ea', light: true },
  perforation: { enabled: false, style: 'side', color: '#e9e4d8' },
  cells: [
    { x: 36, y: 96, w: 528, h: 380, radius: 4 },
    { x: 36, y: 496, w: 528, h: 380, radius: 4 },
    { x: 36, y: 896, w: 528, h: 380, radius: 4 },
    { x: 36, y: 1296, w: 528, h: 380, radius: 4 },
  ],
  stickers: [{
    id: 'st1', kind: 'stripe', preset: 'diagonal-bar', color: '#ffffff', color2: '#d9b7c8',
    opacity: 1, x: 40, y: 600, w: 200, h: 60, rotation: 0,
  }],
  texts: [{ id: 't1', text: '{{caption}}', x: 300, y: 1780, size: 20, family: 'sans', weight: 500, align: 'center', color: '#2a2724', letterSpacing: 0 }],
  emblem: { enabled: true, id: 'hd2lab', x: 300, y: 1700, maxW: 220, maxH: 40, align: 'center', mode: 'auto' },
}).spec;

describe('arrow keys', () => {
  it('turns a cut by a degree and keeps its centre', () => {
    const base = spec();
    const next = turnSelection(base, { kind: 'cell', index: 0 }, 1);
    expect(next.cells[0].rotation).toBe(1);
    expect(next.cells[0].x).toBe(base.cells[0].x);
    expect(base.cells[0].rotation).toBe(0);
  });

  it('turns text, stickers and the logo too', () => {
    const base = spec();
    expect(turnSelection(base, { kind: 'text', id: 't1' }, -5).texts[0].rotation).toBe(-5);
    expect(turnSelection(base, { kind: 'sticker', id: 'st1' }, 5).stickers![0].rotation).toBe(5);
    expect(turnSelection(base, { kind: 'emblem' }, 1).emblem.rotation).toBe(1);
  });

  it('wraps past a full turn instead of printing 361°', () => {
    expect(wrapAngle(359)).toBe(-1);
    expect(wrapAngle(361)).toBe(1);
    expect(wrapAngle(-181)).toBe(179);
    expect(wrapAngle(180)).toBe(180);
  });

  it('grows a cut around its own centre by two percent', () => {
    const base = spec();
    const next = scaleSelection(base, { kind: 'cell', index: 0 }, 1.02);
    const before = base.cells[0];
    const after = next.cells[0];
    expect(after.w).toBe(Math.round(before.w * 1.02));
    expect(after.h).toBe(Math.round(before.h * 1.02));
    expect(Math.abs(after.x + after.w / 2 - (before.x + before.w / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y + after.h / 2 - (before.y + before.h / 2))).toBeLessThanOrEqual(1);
  });

  it('scales a text size, a sticker box and the logo box', () => {
    const base = spec();
    expect(scaleSelection(base, { kind: 'text', id: 't1' }, 1.1).texts[0].size).toBeCloseTo(22, 1);
    expect(scaleSelection(base, { kind: 'text', id: 't1' }, 0.98).texts[0].size).toBeCloseTo(19.6, 1);
    const sticker = scaleSelection(base, { kind: 'sticker', id: 'st1' }, 1.1).stickers![0];
    expect(sticker.w).toBe(220);
    expect(sticker.h).toBe(66);
    const logo = scaleSelection(base, { kind: 'emblem' }, 0.9).emblem;
    expect(logo.maxW).toBeCloseTo(198, 1);
    expect(logo.maxH).toBeCloseTo(36, 1);
  });

  it('never shrinks a cut below the plate\'s minimum', () => {
    const base = spec();
    let small = base;
    for (let i = 0; i < 200; i += 1) small = scaleSelection(small, { kind: 'cell', index: 0 }, 0.9);
    expect(small.cells[0].w).toBeGreaterThanOrEqual(16);
    expect(small.cells[0].h).toBeGreaterThanOrEqual(16);
  });

  it('reads the arrows as the brief asks: 1° / 5° and 2% / 10%', () => {
    expect(arrowIntent('ArrowRight', false)).toEqual({ kind: 'turn', delta: 1 });
    expect(arrowIntent('ArrowLeft', true)).toEqual({ kind: 'turn', delta: -5 });
    expect(arrowIntent('ArrowUp', false)).toEqual({ kind: 'scale', factor: 1.02 });
    expect(arrowIntent('ArrowDown', true)).toEqual({ kind: 'scale', factor: 0.9 });
    expect(arrowIntent('Escape', false)).toBeNull();
  });

  it('leaves a field\'s own caret alone', () => {
    const input = { tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget;
    const area = { tagName: 'TEXTAREA', isContentEditable: false } as unknown as EventTarget;
    const select = { tagName: 'SELECT', isContentEditable: false } as unknown as EventTarget;
    const canvas = { tagName: 'CANVAS', isContentEditable: false } as unknown as EventTarget;
    expect(typingInField(input)).toBe(true);
    expect(typingInField(area)).toBe(true);
    expect(typingInField(select)).toBe(true);
    expect(typingInField(canvas)).toBe(false);
    expect(typingInField(null)).toBe(false);
  });
});
