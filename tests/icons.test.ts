import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The official Web-HQ / PKPilot0018 / PKPilot0019 dual-skew geometry. */
const MARK_ONE = 'M13.000 18.714L37.000 6.714L37.000 43.986L13.000 55.986ZM17.000 21.186L33.000 13.186L33.000 41.514L17.000 49.514Z';
const MARK_TWO = 'M27.000 22.814L51.000 10.814L51.000 48.086L27.000 60.086ZM31.000 25.286L47.000 17.286L47.000 45.614L31.000 53.614Z';

const read = (path: string) => readFileSync(resolve(process.cwd(), path));
const pngSize = (path: string) => {
  const bytes = read(path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

/**
 * A tab is the one place a visitor sees this app before they open it, so the
 * icon set must be the house mark itself — the same two crossing sheared
 * frames every other HD2Lab surface prints — and the page must ask browsers
 * for the new files rather than the tile they cached months ago.
 */
describe('the icon set', () => {
  it('draws the official dual-skew mark, not the old gradient tile', () => {
    const svg = read('public/favicon.svg').toString('utf8');
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toContain(MARK_ONE);
    expect(svg).toContain(MARK_TWO);
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('#8B6CE8');
    expect(svg).toContain('stroke="#E8E4F2"');
    expect(svg).not.toContain('linearGradient');
  });

  it('ships every raster size a browser and a phone ask for', () => {
    expect(pngSize('public/favicon-32x32.png')).toEqual({ width: 32, height: 32 });
    expect(pngSize('public/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
    expect(pngSize('public/icon-192.png')).toEqual({ width: 192, height: 192 });
    expect(pngSize('public/icon-512.png')).toEqual({ width: 512, height: 512 });
    const ico = read('public/favicon.ico');
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.length).toBeGreaterThan(1000);
  });

  it('asks browsers for the redrawn files with one cache buster', () => {
    const html = read('index.html').toString('utf8');
    for (const file of ['favicon.ico', 'favicon.svg', 'favicon-32x32.png', 'apple-touch-icon.png']) {
      expect(html, file).toContain(`${file}?v=20261122-icons`);
    }
    expect(html).not.toMatch(/favicon\.(svg|ico)"(?!\?)/);
    const manifest = JSON.parse(read('public/manifest.json').toString('utf8'));
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual(
      expect.arrayContaining(['icon-192.png', 'icon-512.png', 'favicon.svg']),
    );
    expect(manifest.name).toContain('FrameBuilder');
    expect(manifest.description).not.toContain('Nordlys');
  });
});
