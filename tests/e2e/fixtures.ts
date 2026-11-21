import { test as base, expect, type Page } from '@playwright/test';

/**
 * Every test asserts, on the way out, that the studio printed nothing to the
 * console and threw nothing — one of the two hard requirements of the redesign.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
    expect(errors, 'console errors').toEqual([]);
  },
});

export { expect };

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;

/** Loads the studio and waits for the first frame to paint (each test gets a fresh context). */
export async function openStudio(page: Page) {
  await page.goto('/');
  await expect(page.locator('canvas.stage-canvas')).toBeVisible();
}

/** The header is the four controls: brand, KO|EN, theme, ⋮. */
export async function headerControls(page: Page) {
  return page.locator('.topbar .lang-toggle, .topbar .icon-btn, .topbar .nav-menu');
}

export function boxesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
