import { test, expect, isMobile, openStudio, boxesOverlap } from './fixtures';

test.describe('HD2Lab shell', () => {
  test('opens in the Navy & Lavender dark theme', async ({ page }) => {
    await openStudio(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'navy');
    const shell = await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(shell).toBe('rgb(11, 16, 32)');
  });

  test('the header is the slim four: brand · KO|EN · theme · ⋮', async ({ page }) => {
    await openStudio(page);
    await expect(page.locator('.topbar .mark')).toBeVisible();
    await expect(page.locator('.brand-name')).toHaveText('HD2Lab');
    await expect(page.locator('.brand-app')).toHaveText('Mynda Ljósa');
    await expect(page.getByTestId('lang-ko')).toBeVisible();
    await expect(page.getByTestId('lang-en')).toBeVisible();
    await expect(page.getByTestId('theme-toggle')).toBeVisible();
    await expect(page.getByTestId('more-menu')).toBeVisible();
    /* none of the six crowded text buttons survive in the bar */
    await expect(page.locator('.topbar .btn')).toHaveCount(0);
    await expect(page.locator('.badge')).toHaveCount(0);
    const height = await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.round(height)).toBe(56);
  });

  test('theme toggles to Soft Iris and stays chosen', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'iris');
    const shell = await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(shell).toBe('rgb(250, 250, 253)');
    await page.reload();
    await expect(page.locator('canvas.stage-canvas')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'iris');
  });

  test('KO | EN switches every surface and remembers the choice', async ({ page }) => {
    await openStudio(page);
    await expect(page.getByTestId('dock-presets')).toContainText('프리셋 · 보관함');
    await page.getByTestId('lang-en').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('dock-presets')).toContainText('Presets & library');
    await expect(page.getByTestId('dock-props')).toContainText('Frame & properties');
    await expect(page.getByTestId('zoom-fit')).toHaveText('Fit');
    await expect(page.getByTestId('grid-toggle')).toContainText('Grid');

    await page.getByTestId('dock-presets').click();
    await expect(page.getByTestId('drawer-left').locator('.drawer-title')).toContainText('Presets');
    await expect(page.locator('.preset-copy b').first()).toHaveText('Classic 1×4 strip');
    await page.keyboard.press('Escape');

    await page.getByTestId('more-menu').click();
    await expect(page.locator('.nav-kicker').first()).toHaveText('NAVIGATION');
    const enMenu = await page.locator('.nav-pop').innerText();
    for (const label of ['HD2Lab Web-HQ', 'ApplicationHub', 'Shutterplate', 'Nordlys']) {
      expect(enMenu).toContain(label);
    }
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(page.locator('canvas.stage-canvas')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('dock-presets')).toContainText('Presets & library');
  });
});

test.describe('floating dock', () => {
  test('opens with the five controls and no fixed rails', async ({ page }) => {
    await openStudio(page);
    await expect(page.getByTestId('dock-presets')).toBeVisible();
    await expect(page.getByTestId('dock-layers')).toBeVisible();
    await expect(page.getByTestId('dock-props')).toBeVisible();
    await expect(page.locator('.zoom-capsule')).toBeVisible();
    await expect(page.getByTestId(isMobile(page) ? 'dock-save-toggle' : 'dock-save')).toBeVisible();

    /* the plate spans the whole workspace: no 548px of rails on either side */
    const stage = await page.locator('.stage').boundingBox();
    const workspace = await page.locator('.workspace').boundingBox();
    expect(stage && workspace).toBeTruthy();
    expect(Math.abs((stage!.width) - (workspace!.width))).toBeLessThan(1);
    expect(Math.abs(stage!.x - workspace!.x)).toBeLessThan(1);

    /* nothing sticks out horizontally */
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - window.innerWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
      app: (document.querySelector('.app') as HTMLElement).scrollWidth - (document.querySelector('.app') as HTMLElement).clientWidth,
    }));
    expect(overflow.doc).toBeLessThanOrEqual(0);
    expect(overflow.body).toBeLessThanOrEqual(0);
    expect(overflow.app).toBeLessThanOrEqual(0);
  });

  test('the floating controls never overlap each other', async ({ page }) => {
    await openStudio(page);
    const presets = await page.getByTestId('dock-presets').boundingBox();
    const layers = await page.getByTestId('dock-layers').boundingBox();
    const props = await page.getByTestId('dock-props').boundingBox();
    const zoom = await page.locator('.zoom-capsule').boundingBox();
    const save = await page.getByTestId(isMobile(page) ? 'dock-save-toggle' : 'dock-save').boundingBox();
    for (const box of [presets, layers, props, zoom, save]) expect(box).toBeTruthy();
    expect(boxesOverlap(presets!, layers!)).toBe(false);
    expect(boxesOverlap(presets!, zoom!)).toBe(false);
    expect(boxesOverlap(props!, save!)).toBe(false);
    expect(boxesOverlap(zoom!, save!)).toBe(false);
    expect(boxesOverlap(layers!, zoom!)).toBe(false);
  });

  test('zoom capsule and grid respond', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('zoom-100').click();
    await expect(page.locator('.zoom-readout')).toHaveText('100%');
    await page.getByTestId('zoom-50').click();
    await expect(page.locator('.zoom-readout')).toHaveText('50%');
    await page.getByTestId('zoom-fit').click();
    await expect(page.locator('.zoom-readout')).not.toHaveText(/^100%$/);

    await expect(page.getByTestId('grid-toggle')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('grid-toggle').click();
    await expect(page.getByTestId('grid-toggle')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('drawers', () => {
  test('presets and layers share the left drawer and Esc closes it', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('dock-presets').click();
    await expect(page.getByTestId('drawer-left')).toHaveAttribute('data-open', 'true');
    await expect(page.locator('.preset-row:visible')).toHaveCount(5);

    if (isMobile(page)) {
      /* a phone opens the same drawer as a bottom sheet */
      const viewport = page.viewportSize()!;
      const box = await page.getByTestId('drawer-left').boundingBox();
      expect(box!.width).toBeGreaterThan(viewport.width - 2);
      /* it slides up to the foot of the screen */
      await expect.poll(async () => {
        const rect = await page.getByTestId('drawer-left').boundingBox();
        return Math.abs(rect!.y + rect!.height - viewport.height);
      }).toBeLessThan(2);
      await expect(page.locator('.sheet-backdrop')).toBeVisible();
      /* the sheet overlays the plate: the dock and the canvas keep their place */
      const zoom = await page.locator('.zoom-capsule').boundingBox();
      expect(zoom!.x).toBeGreaterThanOrEqual(0);
      expect(zoom!.x + zoom!.width).toBeLessThanOrEqual(viewport.width);
      const canvas = await page.locator('canvas.stage-canvas').boundingBox();
      expect(canvas!.width).toBeGreaterThan(100);
    }

    await page.getByRole('tab', { name: /레이어/ }).click();
    await expect(page.locator('.layer-row')).toHaveCount(8); /* 4 slots + 3 texts + emblem */

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('drawer-left')).toHaveAttribute('data-open', 'false');
  });

  test('choosing a canvas element opens the property drawer', async ({ page }) => {
    await openStudio(page);
    const canvas = page.locator('canvas.stage-canvas');
    const box = (await canvas.boundingBox())!;
    /* the first slot sits high on the 600×1800 strip */
    await canvas.click({ position: { x: box.width / 2, y: box.height * 0.16 } });

    if (isMobile(page)) {
      /* a phone keeps the plate visible and marks the property button instead */
      await expect(page.getByTestId('drawer-right')).toHaveAttribute('data-open', 'false');
      await expect(page.locator('.fab-dot')).toBeVisible();
      await page.getByTestId('dock-props').click();
    } else {
      await expect(page.getByTestId('drawer-right')).toHaveAttribute('data-open', 'true');
    }
    await expect(page.getByTestId('drawer-right')).toContainText('슬롯 01');
    await expect(page.getByTestId('drawer-right')).toContainText('셀 속성');

    if (isMobile(page)) {
      await expect.poll(async () => {
        const sheet = await page.getByTestId('drawer-right').boundingBox();
        return Math.abs(sheet!.y + sheet!.height - page.viewportSize()!.height);
      }).toBeLessThan(2);
    }
  });

  test('the layer list jumps to its element properties', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('dock-layers').click();
    /* the stack reads front to back, so the row is found by its name */
    await page.locator('.layer-row', { hasText: '슬롯 02' }).first().click();
    await expect(page.getByTestId('drawer-left')).toHaveAttribute('data-open', 'false');
    await expect(page.getByTestId('drawer-right')).toHaveAttribute('data-open', 'true');
    await expect(page.getByTestId('drawer-right')).toContainText('슬롯 02');
  });
});

test.describe('help, saving and sharing', () => {
  test('the ⋮ menu keeps help, importing and the reset', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('more-menu').click();
    const menu = await page.locator('.nav-pop').innerText();
    for (const label of ['HD2Lab Web-HQ', 'ApplicationHub', 'Shutterplate', 'Nordlys', '도움말', '.shutterframe.json 불러오기', '내 프레임 초기화']) {
      expect(menu).toContain(label);
    }

    await page.getByRole('menuitem', { name: /도움말/ }).click();
    await expect(page.getByTestId('help-modal')).toBeVisible();
    await expect(page.locator('.modal-title')).toHaveText('도움말');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-modal')).toHaveCount(0);
  });

  test('the save button downloads a .shutterframe.json v1 file', async ({ page }) => {
    await openStudio(page);
    if (isMobile(page)) await page.getByTestId('dock-save-toggle').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('dock-save').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.shutterframe\.json$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const spec = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(spec.schema).toBe('shutterframe/v1');
    expect(spec.cells).toHaveLength(4);
    await expect(page.locator('.toast')).toContainText('저장했습니다');
  });

  test('a shared #frame= link opens the same frame', async ({ page }) => {
    await openStudio(page);
    const link = await page.evaluate(() => {
      const engine = (window as unknown as { ShutterFrame: any }).ShutterFrame;
      const built = engine.validate({
        schema: 'shutterframe/v1',
        id: 'frame-e2e',
        name: 'E2E Strip',
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
      }).spec;
      return engine.shareUrl(window.location.origin + '/PKPilot0015/', built);
    });
    expect(link).toContain('#frame=');
    await page.goto(link);
    await expect(page.locator('canvas.stage-canvas')).toBeVisible();
    await expect(page.locator('.toast')).toContainText('링크에서 프레임을 불러왔습니다');
    await page.getByTestId('dock-props').click();
    await expect(page.getByTestId('frame-name')).toHaveValue('E2E Strip');
  });

  test('copying a share link confirms in a toast', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openStudio(page);
    if (isMobile(page)) await page.getByTestId('dock-save-toggle').click();
    await page.getByTestId('dock-copy-link').click();
    await expect(page.locator('.toast')).toContainText('링크를 복사했습니다');
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('#frame=');
  });

  test('⌘/Ctrl+S saves the frame as a file', async ({ page }) => {
    await openStudio(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('ControlOrMeta+s'),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.shutterframe\.json$/);
  });
});
