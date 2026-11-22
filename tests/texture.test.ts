import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as LZString from 'lz-string';

/**
 * Paper is part of the frame, not a screen effect: a document carried to a
 * host app must name the sheet it prints on, and a document written before
 * paper existed must still open on the matte cotton sheet it now defaults to.
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

const sample = () => ({
  schema: 'shutterframe/v1',
  id: 'frame-paper',
  name: 'Paper Strip',
  updatedAt: '2026-11-22T00:00:00.000Z',
  canvas: { width: 600, height: 1800, background: '#f4f1ea', light: true },
  perforation: { enabled: false, style: 'side', color: '#e9e4d8' },
  cells: [
    { x: 36, y: 96, w: 528, h: 380, radius: 4 },
    { x: 36, y: 496, w: 528, h: 380, radius: 4 },
    { x: 36, y: 896, w: 528, h: 380, radius: 4 },
    { x: 36, y: 1296, w: 528, h: 380, radius: 4 },
  ],
  texts: [],
  emblem: { enabled: false, x: 300, y: 1700, maxW: 220, maxH: 40, align: 'center', mode: 'auto' },
});

describe('paper texture', () => {
  it('gives a document that names no paper the matte cotton default', () => {
    const spec = SF.validate(sample()).spec;
    expect(spec.canvas.texture).toEqual({ kind: 'cotton', strength: 0.55 });
  });

  it('keeps an archival sheet and the grain the visitor chose', () => {
    const spec = SF.validate({ ...sample(), canvas: { ...sample().canvas, texture: { kind: 'archive', strength: 0.8 } } }).spec;
    expect(spec.canvas.texture).toEqual({ kind: 'archive', strength: 0.8 });
  });

  it('keeps the off switch instead of falling back to cotton', () => {
    const spec = SF.validate({ ...sample(), canvas: { ...sample().canvas, texture: { kind: 'none', strength: 0.7 } } }).spec;
    expect(spec.canvas.texture.kind).toBe('none');
  });

  it('puts an unknown kind on cotton and reads a strength outside 0–1 as its edge', () => {
    const spec = SF.validate({ ...sample(), canvas: { ...sample().canvas, texture: { kind: 'silk', strength: 9 } } }).spec;
    expect(spec.canvas.texture).toEqual({ kind: 'cotton', strength: 1 });
    const low = SF.validate({ ...sample(), canvas: { ...sample().canvas, texture: { kind: 'archive', strength: -4 } } }).spec;
    expect(low.canvas.texture.strength).toBe(0);
  });

  it('carries the sheet through a saved file and a share link alike', () => {
    const spec = SF.validate(sample()).spec;
    spec.canvas.texture = { kind: 'archive', strength: 0.65 };
    const file = SF.parse(SF.serialize(spec));
    expect(file.ok).toBe(true);
    expect(file.spec.canvas.texture).toEqual({ kind: 'archive', strength: 0.65 });
    const link = SF.decode(SF.encode(spec));
    expect(link.canvas.texture).toEqual({ kind: 'archive', strength: 0.65 });
  });

  it('starts every preset on paper, and none of them flat', async () => {
    const { PRESETS } = await import('../src/editor/presets');
    for (const preset of PRESETS) {
      const spec = preset.build();
      expect(spec.canvas.texture, preset.id).toBeTruthy();
      expect(['cotton', 'archive'], preset.id).toContain(spec.canvas.texture!.kind);
      expect(spec.canvas.texture!.strength, preset.id).toBeGreaterThan(0);
    }
  });

  it('paints a textured plate and a flat one without touching the canvas path', () => {
    /* happy-dom has no 2D context; the engine must still answer true for a
       layout carrying paper, and the guard must swallow the missing context */
    const spec = SF.validate(sample()).spec;
    const layout = SF.layout(spec, { scale: 1 });
    expect(layout.custom.spec.canvas.texture.kind).toBe('cotton');
    expect(SF.paint({ save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; }, fillStyle: '' }, layout)).toBe(true);
  });
});
