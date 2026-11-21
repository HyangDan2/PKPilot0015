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

const sample = () => ({
  schema: 'shutterframe/v1',
  id: 'frame-test',
  name: 'Test Strip',
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

describe('shutterframe/v1 spec', () => {
  it('normalizes a document into the canonical shape', () => {
    const result = SF.validate(sample());
    expect(result.ok).toBe(true);
    expect(result.spec.schema).toBe('shutterframe/v1');
    expect(result.spec.cells).toHaveLength(4);
    expect(result.spec.texts[0].letterSpacing).toBe(0);
    expect(result.spec.perforation).toMatchObject({ enabled: false, style: 'side', holeWidth: expect.any(Number) });
    expect(result.spec.emblem.mode).toBe('auto');
  });

  it('rejects a document with another schema and reports it', () => {
    const bad = { ...sample(), schema: 'shutterframe/v2' };
    const result = SF.validate(bad);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('schema');
    expect(result.spec).not.toBeNull();
  });

  it('fills missing cells up to four and keeps everything paintable', () => {
    const partial = { ...sample(), cells: [{ x: 0, y: 0, w: 200, h: 200, radius: 0 }] };
    const result = SF.validate(partial);
    expect(result.spec.cells).toHaveLength(4);
    expect(result.warnings.join(' ')).toContain('cells');
  });

  it('drops an overlay that is not an image data URL', () => {
    const result = SF.validate({ ...sample(), overlay: { dataUrl: 'https://example.com/x.png', layer: 'above' } });
    expect(result.spec.overlay).toBeUndefined();
  });

  it('keeps a PNG overlay and its layer', () => {
    const result = SF.validate({ ...sample(), overlay: { dataUrl: 'data:image/png;base64,AAAA', layer: 'below', opacity: 0.5 } });
    expect(result.spec.overlay).toMatchObject({ layer: 'below', opacity: 0.5 });
  });
});

describe('variables', () => {
  it('fills all nine placeholders and blanks the unknown ones', () => {
    const vars = SF.buildVars(SF.validate(sample()).spec, {
      date: '2026.11.21', camera: 'Leica M6', lens: 'Summicron', film: 'Nordlys 400',
      title: 'Winter', caption: '바다', shutter: '1/250', iso: '400', aperture: '2.0',
    });
    const line = SF.applyVars('{{date}} · {{camera}} · {{film}} · {{shutter}} · f/{{aperture}} · ISO {{iso}}', vars);
    expect(line).toBe('2026.11.21 · Leica M6 · Nordlys 400 · 1/250 · f/2.0 · ISO 400');
    expect(SF.applyVars('{{nope}}!', vars)).toBe('!');
  });

  it('falls back to make + model when camera is absent', () => {
    const vars = SF.buildVars(null, { make: 'Canon', model: 'AE-1', datetime: '2026-11-21 15:04:00' });
    expect(vars.camera).toBe('Canon AE-1');
    expect(vars.date).toBe('2026.11.21');
  });
});

describe('cell alignment', () => {
  it('lays a 1×4 strip inside equal margins', () => {
    const spec = SF.validate(sample()).spec;
    const next = SF.alignCells(spec, '1x4', 36, 18);
    expect(next.cells[0].x).toBe(36);
    expect(next.cells[1].y - (next.cells[0].y + next.cells[0].h)).toBe(18);
    expect(next.cells[3].y + next.cells[3].h).toBeLessThanOrEqual(spec.canvas.height);
    next.cells.forEach((cell: any) => expect(cell.w).toBe(528));
  });

  it('lays a 2×2 grid with one shared gutter', () => {
    const spec = SF.validate({ ...sample(), canvas: { width: 1200, height: 1600, background: '#fff', light: true } }).spec;
    const next = SF.alignCells(spec, '2x2', 60, 24);
    expect(next.cells[0].w).toBe(528);
    expect(next.cells[1].x - (next.cells[0].x + next.cells[0].w)).toBe(24);
    expect(next.cells[2].y - (next.cells[0].y + next.cells[0].h)).toBe(24);
  });
});

describe('share codec', () => {
  it('round-trips a frame through the compressed share string', () => {
    const spec = SF.validate(sample()).spec;
    const encoded = SF.encode(spec);
    expect(encoded.length).toBeLessThan(JSON.stringify(spec).length);
    const decoded = SF.decode(encoded);
    expect(decoded.id).toBe(spec.id);
    expect(decoded.cells).toEqual(spec.cells);
    expect(decoded.texts[0].text).toBe('{{date}}');
  });

  it('reads the frame out of a #frame= link and a ?frame= link', () => {
    const spec = SF.validate(sample()).spec;
    const hashLink = SF.shareUrl('https://hyangdan2.github.io/PKPilot0003/', spec);
    expect(hashLink).toContain('#frame=');
    expect(SF.fromUrl(hashLink)?.id).toBe(spec.id);
    const query = `https://example.com/PKPilot0011/?frame=${SF.encode(spec)}`;
    expect(SF.fromUrl(query)?.id).toBe(spec.id);
  });

  it('accepts a plain JSON paste', () => {
    const spec = SF.validate(sample()).spec;
    expect(SF.decode(JSON.stringify(spec))?.name).toBe('Test Strip');
  });

  it('returns null for nonsense', () => {
    expect(SF.decode('not a frame')).toBeNull();
    expect(SF.fromUrl('https://example.com/')).toBeNull();
  });
});

describe('layout', () => {
  it('scales the design canvas to the requested export size', () => {
    const spec = SF.validate(sample()).spec;
    const layout = SF.layout(spec, { scale: 2, fields: { date: '2026.11.21' } });
    expect(layout.W).toBe(1200);
    expect(layout.H).toBe(3600);
    expect(layout.custom.spec.id).toBe(spec.id);
    expect(layout.multi).toBe(true);
    expect(layout.cells[0]).toEqual({ x: 72, y: 192, w: 1056, h: 760 });
  });

  it('summarises the frame for a toast', () => {
    const spec = SF.validate(sample()).spec;
    expect(SF.summary(spec)).toBe('600×1800 · 4컷 · 1텍스트');
  });
});

describe('printed rows', () => {
  it('drops the separator a missing value would leave', () => {
    const vars = { camera: 'SONY ILCE-7M4', film: 'VESTRA', shutter: '', aperture: '', iso: '100' };
    expect(SF.applyVars('{{camera}} · {{shutter}} · f/{{aperture}}', vars)).toBe('SONY ILCE-7M4');
    expect(SF.applyVars('{{film}} · ISO {{iso}}', vars)).toBe('VESTRA · ISO 100');
    expect(SF.applyVars('{{camera}} · {{lens}} · {{shutter}}', { camera: 'Canon', shutter: '1/125s' })).toBe('Canon · 1/125s');
  });
});
