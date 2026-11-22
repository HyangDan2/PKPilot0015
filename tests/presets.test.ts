import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as LZString from 'lz-string';

/**
 * The presets are the documents a visitor starts from. Two promises live here:
 * every word the frame prints is an editable text layer (never lettering baked
 * into an image), and the studio talks about itself as FrameBuilder.
 */

let SF: any;

beforeAll(async () => {
  (globalThis as any).LZString = LZString;
  const code = readFileSync(resolve(process.cwd(), 'public/shutterframe.js'), 'utf8');
  new Function(code)();
  SF = (globalThis as any).ShutterFrame;
  if (!(globalThis as any).window) (globalThis as any).window = globalThis;
  (globalThis as any).window.ShutterFrame = SF;
});

async function presets() {
  const module = await import('../src/editor/presets');
  return module;
}

describe('presets', () => {
  it('bakes no lettering into the photobooth overlay artwork', async () => {
    const { PRESETS } = await presets();
    const booth = PRESETS.find((preset) => preset.id === 'photobooth-png')!;
    const spec = booth.build();
    const svg = decodeURIComponent(spec.overlay!.dataUrl.split(',').slice(1).join(','));
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('<text');
    expect(svg).not.toMatch(/MYNDA|FRAME STUDIO/);
  });

  it('prints the brand line as text layers a visitor can delete', async () => {
    const { PRESETS } = await presets();
    for (const preset of PRESETS) {
      const spec = preset.build();
      const words = spec.texts.map((row) => row.text);
      expect(words, preset.id).not.toContain('MYNDA LJÓSA');
      expect(spec.texts.every((row) => typeof row.id === 'string' && row.id.length > 0), preset.id).toBe(true);
    }

    const classic = PRESETS[0].build();
    const title = classic.texts.find((row) => row.id === 't-title')!;
    const foot = classic.texts.find((row) => row.id === 't-foot')!;
    expect(title.text).toBe('FRAMEBUILDER');
    expect(foot.text).toBe('HD2LAB · FRAMEBUILDER');

    /* each one goes away on its own, and the rest of the plate stays */
    const without = SF.removeLayer(classic, { kind: 'text', id: 't-title' });
    expect(without.texts.map((row: any) => row.id)).not.toContain('t-title');
    expect(without.texts.map((row: any) => row.id)).toContain('t-foot');
    expect(without.texts.map((row: any) => row.id)).toContain('t-date');
  });

  it('starts every frame with the HD2Lab mark in its brand colour', async () => {
    const { PRESETS } = await presets();
    for (const preset of PRESETS) {
      const spec = preset.build();
      expect(spec.emblem.id, preset.id).toBe('hd2lab');
      expect(spec.emblem.mono, preset.id).toBe(false);
    }
  });
});
