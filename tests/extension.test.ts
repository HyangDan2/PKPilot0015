import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as LZString from 'lz-string';

let SF: any;

beforeAll(() => {
  (globalThis as any).LZString = LZString;
  const code = readFileSync(resolve(process.cwd(), 'public/shutterframe.js'), 'utf8');
  new Function(code)();
  SF = (globalThis as any).ShutterFrame;
});

/** A 2D context that only records what it was asked to draw. */
function recorder() {
  const calls: { op: string; args: any[] }[] = [];
  const gradient = { addColorStop() {} };
  const ctx: any = {
    globalAlpha: 1,
    canvas: { width: 600, height: 1800 },
    save: () => calls.push({ op: 'save', args: [] }),
    restore: () => calls.push({ op: 'restore', args: [] }),
    beginPath: () => calls.push({ op: 'beginPath', args: [] }),
    closePath: () => calls.push({ op: 'closePath', args: [] }),
    moveTo: (...args: any[]) => calls.push({ op: 'moveTo', args }),
    lineTo: (...args: any[]) => calls.push({ op: 'lineTo', args }),
    arcTo: (...args: any[]) => calls.push({ op: 'arcTo', args }),
    arc: (...args: any[]) => calls.push({ op: 'arc', args }),
    quadraticCurveTo: (...args: any[]) => calls.push({ op: 'quadraticCurveTo', args }),
    rect: (...args: any[]) => calls.push({ op: 'rect', args }),
    clip: () => calls.push({ op: 'clip', args: [] }),
    fill: () => calls.push({ op: 'fill', args: [] }),
    stroke: () => calls.push({ op: 'stroke', args: [] }),
    fillRect: (...args: any[]) => calls.push({ op: 'fillRect', args }),
    strokeRect: (...args: any[]) => calls.push({ op: 'strokeRect', args }),
    setLineDash: (...args: any[]) => calls.push({ op: 'setLineDash', args }),
    drawImage: (...args: any[]) => calls.push({ op: 'drawImage', args }),
    translate: (...args: any[]) => calls.push({ op: 'translate', args }),
    rotate: (...args: any[]) => calls.push({ op: 'rotate', args }),
    scale: (...args: any[]) => calls.push({ op: 'scale', args }),
    fillText: (...args: any[]) => calls.push({ op: 'fillText', args }),
    measureText: (text: string) => ({ width: String(text).length * 10 }),
    createLinearGradient: () => gradient,
    setTransform: () => calls.push({ op: 'setTransform', args: [] }),
    clearRect: () => calls.push({ op: 'clearRect', args: [] }),
  };
  return { ctx, calls };
}

const base = () => ({
  schema: 'shutterframe/v1',
  id: 'frame-ext',
  name: 'Ext Strip',
  updatedAt: '2026-11-21T00:00:00.000Z',
  canvas: { width: 600, height: 1800, background: '#f4f1ea', light: true },
  perforation: { enabled: false, style: 'side', color: '#e9e4d8' },
  cells: [
    { x: 36, y: 96, w: 528, h: 380, radius: 4 },
    { x: 36, y: 496, w: 528, h: 380, radius: 4 },
    { x: 36, y: 896, w: 528, h: 380, radius: 4 },
    { x: 36, y: 1296, w: 528, h: 380, radius: 4 },
  ],
  texts: [{ id: 't1', text: '{{date}}', x: 300, y: 1740, size: 20, family: 'sans', weight: 500, align: 'center', color: '#6b635a' }],
  emblem: { enabled: true, x: 300, y: 1700, maxW: 220, maxH: 40, align: 'center', mode: 'auto' },
});

const slot = (name: string) => ({ img: { width: 640, height: 480 } as unknown as CanvasImageSource, w: 640, h: 480, tag: name });

describe('v1 extensions: rotation and the shared z stack', () => {
  it('keeps a legacy document in exactly the legacy paint order', () => {
    const spec = SF.validate(base()).spec;
    const kinds = SF.paintOrder(spec).map((row: any) => row.kind);
    expect(kinds).toEqual(['cell', 'cell', 'cell', 'cell', 'emblem', 'text']);
  });

  it('defaults rotation to 0 and z to undefined without touching legacy output', () => {
    const spec = SF.validate(base()).spec;
    expect(spec.cells[0].rotation).toBe(0);
    expect(spec.texts[0].rotation).toBe(0);
    expect(spec.emblem.rotation).toBe(0);
    expect(spec.cells[0].z).toBeUndefined();
  });

  it('wraps rotation into (-180, 180]', () => {
    const spec = SF.validate({ ...base(), texts: [{ ...base().texts[0], rotation: 400 }, { ...base().texts[0], id: 't2', rotation: -190 }] }).spec;
    expect(spec.texts[0].rotation).toBe(40);
    expect(spec.texts[1].rotation).toBe(170);
  });

  it('an explicit z puts a sticker above the photographs', () => {
    const spec = SF.validate({
      ...base(),
      stickers: [{ id: 'st-1', kind: 'stripe', preset: 'film-tape', z: 90, x: 0, y: 0, w: 100, h: 40 }],
    }).spec;
    const order = SF.paintOrder(spec).map((row: any) => row.key);
    expect(order[order.length - 1]).toBe('sticker:st-1');
  });

  it('lifts a text in front of the emblem with one layer step', () => {
    const spec = SF.validate(base()).spec;
    const before = SF.layers(spec).map((row: any) => row.key);
    expect(before.indexOf('emblem')).toBeLessThan(before.indexOf('text:t1'));
    const next = SF.moveLayer(spec, { kind: 'text', id: 't1' }, 1);
    const after = SF.layers(next).map((row: any) => row.key);
    expect(after.indexOf('text:t1')).toBeGreaterThan(after.indexOf('emblem'));
  });

  it('drops a text one step back, under the emblem', () => {
    const spec = SF.validate(base()).spec;
    const next = SF.moveLayer(spec, { kind: 'text', id: 't1' }, -1);
    const after = SF.layers(next).map((row: any) => row.key);
    expect(after.indexOf('text:t1')).toBeLessThan(after.indexOf('emblem'));
  });

  it('can drop a text all the way behind the photographs', () => {
    let spec = SF.validate(base()).spec;
    for (let i = 0; i < 6; i += 1) spec = SF.moveLayer(spec, { kind: 'text', id: 't1' }, -1);
    const after = SF.layers(spec).map((row: any) => row.key);
    expect(after[0]).toBe('text:t1');
  });

  it('stops at the ends of the stack instead of wrapping', () => {
    let spec = SF.validate(base()).spec;
    for (let i = 0; i < 12; i += 1) spec = SF.moveLayer(spec, { kind: 'text', id: 't1' }, 1);
    expect(SF.depthOf(spec, { kind: 'text', id: 't1' })!.index).toBe(SF.depthOf(spec, { kind: 'text', id: 't1' })!.count - 1);
  });
});

describe('v1 extensions: background image', () => {
  it('keeps a cropped photograph and its opacity', () => {
    const spec = SF.validate({
      ...base(),
      canvas: { ...base().canvas, backgroundImage: { dataUrl: 'data:image/jpeg;base64,AAAA', opacity: 0.4 } },
    }).spec;
    expect(spec.canvas.backgroundImage).toMatchObject({ opacity: 0.4 });
  });

  it('refuses a background that is not an image data URL', () => {
    const spec = SF.validate({ ...base(), canvas: { ...base().canvas, backgroundImage: { dataUrl: 'https://x/y.jpg' } } }).spec;
    expect(spec.canvas.backgroundImage).toBeUndefined();
  });

  it('paints the photograph under the slots', () => {
    const spec = SF.validate({
      ...base(),
      canvas: { ...base().canvas, backgroundImage: { dataUrl: 'data:image/jpeg;base64,AAAA', opacity: 1 } },
    }).spec;
    spec.canvas.backgroundImage.__image = { width: 600, height: 1800 } as unknown as CanvasImageSource;
    const { ctx, calls } = recorder();
    SF.paint(ctx, SF.layout(spec, { slots: [slot('a'), slot('b'), slot('c'), slot('d')] }));
    const draws = calls.filter((call) => call.op === 'drawImage').map((call) => call.args[0] as any);
    expect(draws[0]).toBe(spec.canvas.backgroundImage.__image);
    expect(draws).toHaveLength(5);
  });
});

describe('v1 extensions: stripes and sprites', () => {
  it('adds a stripe sticker from a preset with house colours', () => {
    const spec = SF.validate(base()).spec;
    const next = SF.addSticker(spec, 'halftone-strip', { color: '#1b1a18', color2: '#f1eadd' });
    expect(next.stickers).toHaveLength(1);
    expect(next.stickers![0]).toMatchObject({ kind: 'stripe', preset: 'halftone-strip', color: '#1b1a18', color2: '#f1eadd' });
    expect(next.stickers![0].w).toBeGreaterThan(0);
  });

  it('ships six drawn stripe presets', () => {
    expect(SF.stickerPresets().length).toBeGreaterThanOrEqual(6);
  });

  it('adds an uploaded sprite by its transparent data URL', () => {
    const spec = SF.validate(base()).spec;
    const next = SF.addSprite(spec, 'data:image/png;base64,AAAA', { w: 200, h: 80 });
    expect(next.stickers![0]).toMatchObject({ kind: 'sprite', dataUrl: 'data:image/png;base64,AAAA' });
  });

  it('drops a sprite that carries no data URL', () => {
    const result = SF.validate({ ...base(), stickers: [{ id: 's', kind: 'sprite', x: 0, y: 0, w: 10, h: 10 }] });
    expect(result.spec.stickers).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('스프라이트');
  });

  it('draws a rotated sticker turned around its own centre', () => {
    const spec = SF.validate({
      ...base(),
      stickers: [{ id: 'st-1', kind: 'stripe', preset: 'diagonal-bar', x: 100, y: 200, w: 300, h: 80, rotation: 90 }],
    }).spec;
    const { ctx, calls } = recorder();
    SF.paint(ctx, SF.layout(spec, { slots: [] }));
    const rotate = calls.find((call) => call.op === 'rotate');
    expect(rotate).toBeTruthy();
    expect(rotate!.args[0]).toBeCloseTo(Math.PI / 2, 5);
    const translate = calls.filter((call) => call.op === 'translate').map((call) => call.args);
    expect(translate.some((args) => Math.abs(args[0] - 250) < 0.001 && Math.abs(args[1] - 240) < 0.001)).toBe(true);
  });

  it('round-trips stickers and a background photograph through a share string', () => {
    const spec = SF.validate({
      ...base(),
      canvas: { ...base().canvas, backgroundImage: { dataUrl: 'data:image/jpeg;base64,AAAA', opacity: 0.7 } },
      stickers: [{ id: 'st-1', kind: 'stripe', preset: 'grid-mesh', x: 10, y: 20, w: 200, h: 60, rotation: 30, z: 12 }],
    }).spec;
    const decoded = SF.decode(SF.encode(spec));
    expect(decoded.stickers[0]).toMatchObject({ preset: 'grid-mesh', rotation: 30, z: 12 });
    expect(decoded.canvas.backgroundImage).toMatchObject({ opacity: 0.7 });
  });

  it('serializes without the loaded images', () => {
    const spec = SF.validate(base()).spec;
    spec.canvas.backgroundImage = { dataUrl: 'data:image/jpeg;base64,AAAA', opacity: 1, __image: {} as any } as any;
    expect(SF.serialize(spec)).not.toContain('__image');
  });
});

describe('v1 extensions: align and bounds', () => {
  it('centres an element horizontally on the frame', () => {
    const spec = SF.validate({ ...base(), stickers: [{ id: 's', kind: 'stripe', x: 0, y: 0, w: 100, h: 40 }] }).spec;
    const next = SF.alignLayer(spec, { kind: 'sticker', id: 's' }, 'h-center');
    const box = SF.boundsOf(next, { kind: 'sticker', id: 's' });
    expect(box.x + box.w / 2).toBeCloseTo(300, 0);
  });

  it('aligns a rotated element by the box it actually covers', () => {
    const spec = SF.validate({ ...base(), stickers: [{ id: 's', kind: 'stripe', x: 0, y: 0, w: 200, h: 40, rotation: 90 }] }).spec;
    const next = SF.alignLayer(spec, { kind: 'sticker', id: 's' }, 'v-center');
    const box = SF.boundsOf(next, { kind: 'sticker', id: 's' });
    expect(box.y + box.h / 2).toBeCloseTo(900, 0);
  });

  it('reports the turned corners of a rotated cell for hit testing', () => {
    const spec = SF.validate({ ...base(), cells: [{ ...base().cells[0], rotation: 45 }, ...base().cells.slice(1)] }).spec;
    const inside = SF.hitLayer(spec, { kind: 'cell', index: 0 }, { x: 300, y: 286 });
    expect(inside).toBe(true);
    const outside = SF.hitLayer(spec, { kind: 'cell', index: 0 }, { x: 40, y: 100 });
    expect(outside).toBe(false);
  });

  it('measures a text row so it can be centred', () => {
    const spec = SF.validate(base()).spec;
    const box = SF.boundsOf(spec, { kind: 'text', id: 't1' }, () => 120);
    expect(box.w).toBe(120);
    expect(box.x).toBeCloseTo(240, 5);
  });
});
