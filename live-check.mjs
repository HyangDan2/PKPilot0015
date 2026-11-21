import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'https://hyangdan2.github.io/PKPilot0015/';
const OUT = '/workspace/work/pkpilot0015-redesign';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const report = [];

async function visit(name, viewport, steps) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  const response = await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('canvas.stage-canvas', { timeout: 20000 });
  await page.waitForTimeout(600);
  if (steps) await steps(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const state = await page.evaluate(() => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    return {
      theme: document.documentElement.dataset.theme,
      lang: document.documentElement.lang,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      headerH: box('.topbar')?.h,
      headerTextButtons: document.querySelectorAll('.topbar .btn').length,
      mark: !!document.querySelector('.topbar .mark'),
      docks: ['dock-presets', 'dock-layers', 'dock-props'].map((id) => !!document.querySelector(`[data-testid="${id}"]`)),
      zoom: box('.zoom-capsule'),
      save: box('.dock-save'),
      overflowDoc: document.documentElement.scrollWidth - window.innerWidth,
      overflowBody: document.body.scrollWidth - document.body.clientWidth,
      leftOpen: document.querySelector('[data-testid="drawer-left"]')?.getAttribute('data-open'),
      rightOpen: document.querySelector('[data-testid="drawer-right"]')?.getAttribute('data-open'),
      drawerLeft: box('[data-testid="drawer-left"]'),
      drawerRight: box('[data-testid="drawer-right"]'),
      sheetBackdrop: getComputedStyle(document.querySelector('.sheet-backdrop')).opacity,
    };
  });
  report.push({ name, status: response?.status(), viewport, errors, ...state });
  await context.close();
}

const wide = { width: 1440, height: 900 };
const phone = { width: 390, height: 844 };

await visit('live-pc-dark', wide);
await visit('live-pc-presets-open', wide, async (p) => { await p.getByTestId('dock-presets').click(); });
await visit('live-pc-props-open', wide, async (p) => {
  const box = await p.locator('canvas').boundingBox();
  await p.locator('canvas').click({ position: { x: box.width / 2, y: box.height * 0.16 } });
});
await visit('live-pc-en-iris', wide, async (p) => {
  await p.getByTestId('lang-en').click();
  await p.getByTestId('theme-toggle').click();
});
await visit('live-mobile-dark', phone);
await visit('live-mobile-sheet', phone, async (p) => { await p.getByTestId('dock-presets').click(); });
await visit('live-mobile-props', phone, async (p) => {
  const box = await p.locator('canvas').boundingBox();
  await p.locator('canvas').click({ position: { x: box.width / 2, y: box.height * 0.16 } });
  await p.getByTestId('dock-props').click();
});
await visit('live-mobile-save', phone, async (p) => { await p.getByTestId('dock-save-toggle').click(); });

await browser.close();
console.log(JSON.stringify(report, null, 2));
