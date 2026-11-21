import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as LZString from 'lz-string';

/**
 * The photograph behind a plate is a decoded image held on the document under
 * `__image`. An edit copies the document, and that copy must keep the image
 * itself: a JSON round-trip used to leave `{}` behind — truthy, undrawable, and
 * enough to blank the whole plate on the next paint.
 */

let SF: any;

beforeAll(() => {
  (globalThis as any).LZString = LZString;
  const code = readFileSync(resolve(process.cwd(), 'public/shutterframe.js'), 'utf8');
  new Function(code)();
  SF = (globalThis as any).ShutterFrame;
});

/** Stands in for a decoded image the engine has already loaded. */
function decoded(): { width: number; height: number } {
  return { width: 12, height: 8 };
}

function withBackground() {
  return {
    schema: 'shutterframe/v1',
    id: 'frame-bg',
    name: 'Background frame',
    updatedAt: '2026-11-21T00:00:00.000Z',
    canvas: {
      width: 600,
      height: 1800,
      background: '#f4f1ea',
      light: true,
      backgroundImage: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', opacity: 0.8, __image: decoded() },
    },
    perforation: { enabled: false, style: 'side', color: '#e9e4d8' },
    cells: [{ x: 36, y: 96, w: 528, h: 380, radius: 4 }],
    overlay: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=', layer: 'above', opacity: 1, __image: decoded() },
    stickers: [
      { id: 'st-1', kind: 'sprite', color: '#000000', color2: '#ffffff', opacity: 1, x: 10, y: 10, w: 100, h: 100, rotation: 0, dataUrl: 'data:image/png;base64,iVBORw0KGgo=', __image: decoded() },
    ],
    texts: [{ id: 't1', text: '{{date}}', x: 300, y: 1740, size: 20, family: 'sans', weight: 500, align: 'center', color: '#6b635a' }],
    emblem: { enabled: true, x: 300, y: 1700, maxW: 220, maxH: 40, align: 'center', mode: 'auto' },
  };
}

describe('document copies keep their decoded images', () => {
  it('clone hands back the same image, never an empty husk', () => {
    const spec = withBackground();
    const copy = SF.clone(spec);
    expect(copy).not.toBe(spec);
    expect(copy.canvas.backgroundImage.__image).toBe(spec.canvas.backgroundImage.__image);
    expect(copy.overlay.__image).toBe(spec.overlay.__image);
    expect(copy.stickers[0].__image).toBe(spec.stickers[0].__image);
    /* the husk a JSON copy would have left: truthy, zero-sized */
    expect(copy.canvas.backgroundImage.__image.width).toBe(12);
  });

  it('clone still copies the document itself', () => {
    const spec = withBackground();
    const copy = SF.clone(spec);
    copy.canvas.width = 1200;
    copy.cells[0].w = 10;
    copy.canvas.backgroundImage.dataUrl = 'data:image/png;base64,AAAA';
    expect(spec.canvas.width).toBe(600);
    expect(spec.cells[0].w).toBe(528);
    expect(spec.canvas.backgroundImage.dataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('touch — the copy every edit goes through — keeps the image', () => {
    const spec = withBackground();
    const next = SF.touch(spec, {});
    expect(next.canvas.backgroundImage.__image).toBe(spec.canvas.backgroundImage.__image);
    expect(next.canvas.backgroundImage.opacity).toBe(0.8);
    expect(next.updatedAt).not.toBe(spec.updatedAt);
  });

  it('a copy of a rotated cell keeps the photograph underneath it', () => {
    const spec = withBackground();
    const next = SF.touch(spec, {});
    next.cells[0].rotation = 12.5;
    next.canvas.backgroundImage.opacity = 0.4;
    expect(next.canvas.backgroundImage.__image.width).toBe(12);
    expect(spec.canvas.backgroundImage.opacity).toBe(0.8);
  });

  it('validate carries an already decoded image whose url still matches', () => {
    const spec = withBackground();
    const result = SF.validate(spec);
    expect(result.ok).toBe(true);
    expect(result.spec.canvas.backgroundImage.__image).toBe(spec.canvas.backgroundImage.__image);
    expect(result.spec.overlay.__image).toBe(spec.overlay.__image);
  });

  it('validate drops a husk so the next paint reloads the file', () => {
    const spec = withBackground();
    spec.canvas.backgroundImage.__image = {} as never;
    const result = SF.validate(spec);
    expect(result.spec.canvas.backgroundImage.__image).toBeUndefined();
  });

  it('a saved document carries no image at all', () => {
    const text = SF.serialize(withBackground());
    expect(text).not.toContain('__image');
    expect(JSON.parse(text).canvas.backgroundImage.dataUrl).toContain('data:image/png');
  });
});
