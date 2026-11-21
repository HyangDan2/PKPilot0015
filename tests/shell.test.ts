import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('HD2Lab shell', () => {
  const html = read('index.html');
  const css = read('src/styles.css');

  it('opens in the navy theme, not the old iris default', () => {
    expect(html).toContain('data-theme="navy"');
    expect(html).not.toContain('data-theme="iris"');
    expect(css).toMatch(/html\[data-theme="iris"\]/);
    expect(css).toMatch(/color-scheme: dark/);
  });

  it('draws the signature dual-skew mark instead of the retired SVG bars', () => {
    expect(css).toMatch(/\.mark \{[^}]*skewY\(-23deg\)/s);
    expect(css).toMatch(/\.mark::after/);
    expect(css).not.toContain('brand-mark-bar');
    expect(html).not.toContain('FRAME STUDI');
  });

  it('keeps the per-app rule: no GoatCounter on an individual app', () => {
    expect(html.toLowerCase()).not.toContain('goatcounter');
  });

  it('has no fixed left/right rails left in the layout', () => {
    expect(css).not.toContain('--rail-left');
    expect(css).not.toContain('grid-template-columns: var(--rail-left)');
  });

  it('lays the drawers out as sheets under 1024px', () => {
    expect(css).toMatch(/@media \(max-width: 1023px\)/);
    expect(css).toMatch(/\.drawer\.open \{ transform: none; \}/);
    expect(css).toMatch(/\.sheet-backdrop/);
  });

  it('paints the floating dock and the zoom capsule', () => {
    for (const selector of ['.dock-left', '.dock-right', '.dock-zoom', '.dock-save', '.fab', '.zoom-capsule']) {
      expect(css).toContain(selector);
    }
  });

  it('keeps the shared engine on the page', () => {
    expect(html).toContain('/PKPilot0015/lz-string.min.js');
    expect(html).toContain('/PKPilot0015/shutterframe.js');
  });

  it('publishes the navy shell colour in the manifest', () => {
    const manifest = JSON.parse(read('public/manifest.json'));
    expect(manifest.theme_color).toBe('#0B1020');
    expect(manifest.background_color).toBe('#0B1020');
  });
});
